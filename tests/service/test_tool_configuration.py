"""Real proxy round trips and shared local/HTTP/CLI configuration semantics."""

import argparse
import json
import socket
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading
import time

import httpx
import pytest
from fastapi.testclient import TestClient

from sr_harness.cli import tool_config
from sr_harness.core import AgentContext
from sr_harness.http.app import create_app
from sr_harness.service import LocalHarnessService, HttpHarnessService, ServiceError
from sr_harness.tools import WebFetchTool, WebSearchTool

TOKEN = "tool-config-test-token-1234567890"


@pytest.fixture
def proxy():
    requests = []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            requests.append(self.path)
            if self.path.endswith("/slow"):
                time.sleep(0.6)
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            try:
                self.wfile.write(b"<html><body>Configured proxy worked</body></html>")
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_port}", requests
    server.shutdown()
    server.server_close()
    thread.join()


def test_proxy_fetch_uses_proxy_target_resolution_with_mixed_local_dns(
    tmp_path, proxy, monkeypatch
):
    address, calls = proxy
    original_lookup = socket.getaddrinfo

    def lookup(host, *args, **kwargs):
        if host == "mixed-dns.test":
            return [
                (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 80)),
                (socket.AF_INET6, socket.SOCK_STREAM, 6, "", ("2001::1", 80, 0, 0)),
            ]
        return original_lookup(host, *args, **kwargs)

    monkeypatch.setattr("sr_harness.tools.web_research.socket.getaddrinfo", lookup)
    service = LocalHarnessService(tmp_path)
    try:
        service.configure_tool(
            "global",
            "web_fetch",
            {
                "proxy_mode": "custom",
                "proxy_url": address,
                "timeout_seconds": 2,
            },
        )
        result = service.test_tool_configuration(
            "global",
            "web_fetch",
            {
                "url": "http://mixed-dns.test/science",
            },
        )
        assert result["ok"] is True and result["characters"] > 0
        assert calls == ["http://mixed-dns.test/science"]
        # The same hostname remains blocked when the effective connection is direct.
        service.configure_tool("global", "web_fetch", {"proxy_mode": "direct", "proxy_url": None})
        assert (
            service.test_tool_configuration(
                "global",
                "web_fetch",
                {
                    "url": "http://mixed-dns.test/science",
                },
            )["ok"]
            is False
        )
        assert len(calls) == 1
    finally:
        service.close()


def test_configuration_persists_and_binds_to_each_agent_tool(tmp_path, proxy):
    address, calls = proxy
    service = LocalHarnessService(tmp_path)
    sid = service.create(tags={}, idempotency_key="tools")["id"]
    session = service._session(sid)
    tool = WebFetchTool(context=session.context)
    tool.agent_role = "data"
    settings = {"proxy_mode": "custom", "proxy_url": address, "timeout_seconds": 2.5}
    record = service.configure_tool("data", "web_fetch", settings, 0)
    assert tool.get_runtime_configuration().proxy_url == address
    assert tool.execute("http://93.184.216.34/science")["text"] == "Configured proxy worked"
    assert calls == ["http://93.184.216.34/science"]
    assert service.test_tool_configuration(
        "data", "web_fetch", {"url": "http://93.184.216.34/test"}
    )["ok"]
    assert service.tool_configuration("search", "web_fetch")["settings"]["proxy_mode"] == "direct"
    assert service.tool_configuration("data", "web_search")["settings"]["timeout_seconds"] == 15
    with pytest.raises(ServiceError) as conflict:
        service.configure_tool("data", "web_fetch", {}, 0)
    assert conflict.value.status_code == 409
    old = tool.get_runtime_configuration()
    service.reset_tool_configuration("data", "web_fetch", record["revision"])
    assert old.proxy_url == address
    assert tool.get_runtime_configuration().proxy_mode == "direct"
    # Settings never enter the LLM-visible invocation parameters.
    assert "proxy_url" not in WebFetchTool.metadata.parameters["properties"]
    service.close()
    restored = LocalHarnessService(tmp_path)
    assert restored.tool_configuration("data", "web_fetch")["revision"] == 2
    restored.close()


def test_http_and_offline_cli_share_the_same_records(tmp_path, capsys):
    service = LocalHarnessService(tmp_path)
    with TestClient(create_app(service, token=TOKEN)) as server:

        def exchange(request):
            result = server.request(
                request.method,
                str(request.url),
                headers=dict(request.headers),
                content=request.read(),
            )
            return httpx.Response(
                result.status_code, headers=result.headers, content=result.content
            )

        remote = HttpHarnessService(
            "http://testserver", TOKEN, transport=httpx.MockTransport(exchange)
        )
        assert {t["name"] for t in remote.tool_catalog()["tools"]} == {"web_search", "web_fetch"}
        record = remote.configure_tool("data", "web_fetch", {"timeout_seconds": 7.5})
        assert remote.tool_configuration("data", "web_fetch") == record
        remote.close()
    parser = tool_config.setup_parser()
    args = parser.parse_args(["--root", str(tmp_path), "--role", "data", "get", "web_fetch"])
    assert tool_config.main(args) == 0
    assert json.loads(capsys.readouterr().out)["settings"]["timeout_seconds"] == 7.5
    file = tmp_path / "input.json"
    file.write_text(json.dumps({"timeout_seconds": 9}), encoding="utf8")
    args = parser.parse_args(
        [
            "--root",
            str(tmp_path),
            "--role",
            "data",
            "set",
            "web_fetch",
            "--file",
            str(file),
        ]
    )
    assert tool_config.main(args) == 0
    assert json.loads(capsys.readouterr().out)["revision"] == 2


@pytest.mark.parametrize(
    "settings",
    [
        {"timeout_seconds": 0},
        {"timeout_seconds": True},
        {"timeout_seconds": float("inf")},
        {"proxy_mode": "custom", "proxy_url": "http://user:password@proxy.test:80"},
        {"proxy_mode": "custom", "proxy_url": "socks5://proxy.test:80"},
        {"proxy_mode": []},
        {"proxy_url": {}},
        {"unknown": True},
    ],
)
def test_invalid_settings_are_rejected_by_harness(tmp_path, settings):
    service = LocalHarnessService(tmp_path)
    try:
        with pytest.raises(ServiceError) as error:
            service.configure_tool("data", "web_fetch", settings)
        assert error.value.status_code == 422
        assert "password@" not in str(error.value)
    finally:
        service.close()


def test_timeout_and_direct_mode_ignore_process_and_model_proxies(monkeypatch):
    seen = []

    class Response:
        is_redirect = False
        status_code = 200
        headers = {"content-type": "text/html"}
        encoding = "utf8"

        def raise_for_status(self):
            pass

        def iter_content(self, size):
            yield b"ok"

        def close(self):
            pass

    def request(client, method, url, **kwargs):
        seen.append((client.trust_env, kwargs))
        return Response()

    monkeypatch.setenv("HTTPS_PROXY", "http://unexpected:8888")
    monkeypatch.setattr("sr_harness.runtime.tool_http.requests.Session.request", request)
    context = AgentContext(
        args=argparse.Namespace(
            api_environment={"HTTPS_PROXY": "http://model-proxy:1"},
            tool_configurations={"search:web_fetch": {"settings": {"timeout_seconds": 3.25}}},
        )
    )
    WebFetchTool(context=context).execute("http://93.184.216.34/a")
    assert seen[0][0] is False
    assert seen[0][1]["timeout"] == 3.25
    assert seen[0][1]["proxies"] == {}


def test_global_defaults_and_agent_overrides_apply_across_sessions(tmp_path, proxy):
    address, calls = proxy
    service = LocalHarnessService(tmp_path)
    first = service.create(tags={}, idempotency_key="first")["id"]
    tool = WebFetchTool(context=service._session(first).context)
    tool.agent_role = "data"
    default = service.configure_tool(
        "global",
        "web_fetch",
        {
            "proxy_mode": "custom",
            "proxy_url": address,
            "timeout_seconds": 2.5,
        },
        0,
    )
    assert tool.execute("http://93.184.216.34/global")["text"] == "Configured proxy worked"
    assert calls == ["http://93.184.216.34/global"]
    frozen = tool.get_runtime_configuration()
    second = service.create(tags={}, idempotency_key="second")["id"]
    other = WebFetchTool(context=service._session(second).context)
    other.agent_role = "data"
    for role in ("data", "evaluator", "search"):
        inherited = service.tool_configuration(role, "web_fetch")
        assert inherited["source"] == "global" and not inherited["overridden"]
        assert inherited["settings"] == default["settings"]
    override = service.configure_tool("data", "web_fetch", {"timeout_seconds": 7}, 0)
    service.configure_tool("global", "web_fetch", {"timeout_seconds": 9}, 1)
    assert frozen.timeout_seconds == 2.5
    assert tool.get_runtime_configuration().timeout_seconds == 7
    assert other.get_runtime_configuration().timeout_seconds == 7
    assert service.tool_configuration("search", "web_fetch")["settings"]["timeout_seconds"] == 9
    inherited = service.reset_tool_configuration("data", "web_fetch", override["revision"])
    assert inherited["source"] == "global" and not inherited["overridden"]
    assert tool.get_runtime_configuration().timeout_seconds == 9
    assert other.get_runtime_configuration().timeout_seconds == 9
    with pytest.raises(ServiceError) as stale:
        service.configure_tool("data", "web_fetch", {}, 1)
    assert stale.value.status_code == 409
    service.close()
    restored = LocalHarnessService(tmp_path)
    assert restored.tool_configuration("data", "web_fetch")["settings"]["timeout_seconds"] == 9
    restored.reset_tool_configuration("global", "web_fetch", 2)
    assert restored.tool_configuration("data", "web_fetch")["settings"]["timeout_seconds"] == 20
    assert restored.tool_configuration("data", "web_search")["settings"]["timeout_seconds"] == 15
    restored.close()


def test_global_and_agent_http_cli_contract(tmp_path, capsys):
    service = LocalHarnessService(tmp_path)
    with TestClient(create_app(service, token=TOKEN)) as server:

        def exchange(request):
            response = server.request(
                request.method,
                str(request.url),
                headers=dict(request.headers),
                content=request.read(),
            )
            return httpx.Response(
                response.status_code, headers=response.headers, content=response.content
            )

        remote = HttpHarnessService(
            "http://testserver", TOKEN, transport=httpx.MockTransport(exchange)
        )
        record = remote.configure_tool("global", "web_fetch", {"timeout_seconds": 11}, 0)
        assert remote.tool_configuration("global", "web_fetch") == record
        assert remote.tool_configuration("data", "web_fetch")["source"] == "global"
        remote.configure_tool("data", "web_fetch", {"timeout_seconds": 3}, 0)
        assert remote.tool_configuration("data", "web_fetch")["settings"]["timeout_seconds"] == 3
        remote.reset_tool_configuration("data", "web_fetch", 1)
        assert remote.tool_configuration("search", "web_fetch")["settings"]["timeout_seconds"] == 11
        remote.close()
    parser = tool_config.setup_parser()
    assert tool_config.main(parser.parse_args(["--root", str(tmp_path), "get", "web_fetch"])) == 0
    assert json.loads(capsys.readouterr().out)["source"] == "global"
    assert (
        tool_config.main(
            parser.parse_args(
                [
                    "--root",
                    str(tmp_path),
                    "--global",
                    "reset",
                    "web_fetch",
                    "--expected-revision",
                    "1",
                ]
            )
        )
        == 0
    )
    assert json.loads(capsys.readouterr().out)["source"] == "builtin"


def test_removed_session_scope_and_legacy_records_are_not_applied(tmp_path):
    service = LocalHarnessService(tmp_path)
    sid = service.create(tags={}, idempotency_key="legacy")["id"]
    legacy = service._locations[sid].directory / "tool-configurations.json"
    legacy.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "records": {
                    "session:web_fetch": {"revision": 1, "settings": {"timeout_seconds": 1}},
                    "data:web_fetch": {"revision": 2, "settings": {"timeout_seconds": 2}},
                },
            }
        ),
        encoding="utf8",
    )
    tool = WebFetchTool(context=service._session(sid).context)
    tool.agent_role = "data"
    assert tool.get_runtime_configuration().timeout_seconds == 20
    with pytest.raises(ServiceError) as error:
        service.configure_tool("session", "web_fetch", {})
    assert error.value.status_code == 404
    with TestClient(create_app(service, token=TOKEN)) as server:
        headers = {"Authorization": f"Bearer {TOKEN}"}
        path = f"/v1/sessions/{sid}/tool-configurations/session/web_fetch"
        assert server.get(path, headers=headers).status_code == 404
        assert server.put(path, headers=headers, json={"settings": {}}).status_code == 404
        assert (
            server.get(
                f"/v1/sessions/{sid}/tool-configurations/data/web_fetch", headers=headers
            ).status_code
            == 404
        )
    assert legacy.exists()  # Old data is left in place, never promoted to shared defaults.
    parser = tool_config.setup_parser()
    for removed in (["--session", sid], ["--session-default"]):
        with pytest.raises(SystemExit) as invalid:
            parser.parse_args(["--root", str(tmp_path), *removed, "get", "web_fetch"])
        assert invalid.value.code == 2


def test_http_probe_applies_timeout_and_requires_service_token(tmp_path, proxy):
    address, calls = proxy
    service = LocalHarnessService(tmp_path)
    with TestClient(create_app(service, token=TOKEN)) as http:
        path = "/v1/agents/data/tool-configurations/web_fetch"
        assert http.get(path).status_code == 401
        headers = {"Authorization": f"Bearer {TOKEN}"}
        saved = http.put(
            path,
            headers=headers,
            json={
                "settings": {
                    "timeout_seconds": 0.1,
                    "proxy_mode": "custom",
                    "proxy_url": address,
                },
                "expected_revision": 0,
            },
        )
        assert saved.status_code == 200
        result = http.post(
            path + "/test", headers=headers, json={"url": "http://93.184.216.34/slow"}
        ).json()
        assert result["ok"] is False
        assert result["configuration_revision"] == 1
        assert result["elapsed_seconds"] < 0.6
        assert calls == ["http://93.184.216.34/slow"]
        assert address not in result["message"]
        invalid = http.put(
            path,
            headers=headers,
            json={
                "settings": {
                    "proxy_mode": "custom",
                    "proxy_url": "http://user:secret@proxy.test",
                }
            },
        )
        assert invalid.status_code == 422
        assert invalid.json()["error"]["code"] == "tool_config_invalid"
        assert "secret" not in invalid.text


def test_web_search_uses_same_network_configuration(monkeypatch):
    seen = []

    class Response:
        text = '<a class="result__a" href="https://example.com">Paper</a>'

        def raise_for_status(self):
            pass

        def close(self):
            pass

    def request(client, method, url, **kwargs):
        seen.append((method, url, kwargs))
        return Response()

    monkeypatch.setattr("sr_harness.runtime.tool_http.requests.Session.request", request)
    context = AgentContext(
        args=argparse.Namespace(
            tool_configurations={
                "evaluator:web_search": {
                    "settings": {
                        "proxy_mode": "custom",
                        "proxy_url": "http://proxy.test:8888",
                        "timeout_seconds": 4,
                    }
                },
            }
        )
    )
    tool = WebSearchTool(context=context)
    tool.agent_role = "evaluator"
    assert tool.execute("scientific paper")["results"][0]["title"] == "Paper"
    method, _, options = seen[0]
    assert method == "POST"
    assert options["timeout"] == 4
    assert options["proxies"] == {
        "http": "http://proxy.test:8888",
        "https": "http://proxy.test:8888",
    }
