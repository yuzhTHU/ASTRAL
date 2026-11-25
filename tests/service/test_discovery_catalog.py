"""Catalog migration, administrator contract, and scientific read-only inputs."""

from copy import deepcopy
import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from sr_harness.http.app import create_app
from sr_harness.service import HttpHarnessService, LocalHarnessService, ServiceError
from sr_harness.service import discovery_catalog
from sr_harness.service.discovery import list_cases, prompts
from sr_harness.service.discovery_catalog import DiscoveryTaskStore, source_paths

TOKEN = "discovery-catalog-internal-token-12345678"


@pytest.fixture
def setup(tmp_path, monkeypatch):
    samples = tmp_path / "samples"
    samples.mkdir()
    source = samples / "observations.csv"
    source.write_text("x,y\n1,2\n2,4\n")
    monkeypatch.setenv("ASTRAL_SAMPLE_DATA_ROOT", str(samples))
    service = LocalHarnessService(tmp_path / "harness")
    yield service, source
    service.close()


def configured(service, source):
    value = service.discovery_catalog()
    task = value["tasks"][0]
    task.update(enabled=True, data_locations=[str(source)])
    service.save_discovery_task(task, value["revision"])
    return task


def test_migration_seeds_disabled_tasks_once_and_preserves_edits(setup):
    service, source = setup
    catalog = service.discovery_catalog()
    assert catalog["revision"] == 0
    assert len(catalog["tasks"]) == 7
    assert all(t["enabled"] is False and t["data_locations"] == [] for t in catalog["tasks"])
    assert all(t["citation"] and t["summary_zh"] and t["preparation"] for t in catalog["tasks"])
    assert list_cases(service._discovery_store) == []
    task = configured(service, source)
    task["title"] = "An edited study"
    service.save_discovery_task(task, 1)
    service.delete_discovery_task(catalog["tasks"][1]["name"], 2)
    restored = DiscoveryTaskStore(service.root / "discovery-tasks.json")
    assert len(restored.catalog()["tasks"]) == 6
    assert restored.catalog()["tasks"][0]["title"] == "An edited study"
    assert restored.value["migration_version"] == 2
    assert all(t["name"] != catalog["tasks"][1]["name"] for t in restored.catalog()["tasks"])


def test_research_prompts_in_fresh_catalog(setup):
    service, sample = setup
    tasks = {t["name"]: t for t in service.discovery_catalog()["tasks"]}
    chen = prompts(tasks["Chen_NatureAstronomy2023"], [sample], "test")
    assert all(term in chen["data_agent"] for term in (sample.name, "SDSS", "LAMOST", "独立检验"))
    assert all(term in chen["evaluator_agent"] for term in ("误差", "固有弥散", "30%"))
    xiang = tasks["Xiang_Nature2022"]
    assert "厚盘序列" in xiang["preparation"] and "离群" in xiang["evaluation"]
    li = tasks["Li_Nature2021"]
    assert "6 小时" in li["preparation"] and "70%" in li["evaluation"]
    chiang = tasks["Chiang_NatureAstronomy2026"]
    assert "逐个留一" in chiang["evaluation"]
    assert chiang["files"] == ["rho_CO_CII--8_z_bins.ecsv", "rho_CO_CII--dense_z_fiducial.ecsv"]


def test_upgrading_seed_prompts_preserves_custom_fields_deletions_and_history(tmp_path):
    seed = Path(discovery_catalog.__file__).with_name("migrations") / "0001_discovery_tasks.json"
    tasks = json.loads(seed.read_text(encoding="utf8"))["tasks"]
    chen = tasks[0]
    chen.update(preparation="Custom preparation", enabled=True, data_locations=["custom.csv"])
    deleted = tasks.pop(1)["name"]
    old = deepcopy(chen)
    previous = {
        "schema_version": 1, "migration_version": 1, "revision": 8, "tasks": tasks,
        "history": {chen["name"]: {"7": old}, deleted: {}},
    }
    path = tmp_path / "discovery-tasks.json"
    path.write_text(json.dumps(previous), encoding="utf8")
    upgraded = DiscoveryTaskStore(path)
    current, revision = upgraded.selected(chen["name"])
    assert revision == upgraded.catalog()["revision"] == 9
    assert current == {**old, "evaluation": current["evaluation"]}
    assert "30%" in current["evaluation"] and current["evaluation"] != old["evaluation"]
    assert upgraded.selected(chen["name"], 7) == (old, 7)
    assert upgraded.selected(chen["name"], 9) == (current, 9)
    assert [t["name"] for t in upgraded.catalog()["tasks"]] == [t["name"] for t in tasks]
    assert upgraded.value["history"][deleted] == {}
    assert DiscoveryTaskStore(path).value == upgraded.value


def test_crud_order_conflicts_validation_and_public_filtering(setup):
    service, source = setup
    task = configured(service, source)
    assert source_paths({"data_locations": [source.name]}) == [source]
    task.update(name="new-study", subject_zh="New study", summary_zh="$$y=2x$$")
    catalog = service.save_discovery_task(task, 1, create=True)
    order = [t["name"] for t in reversed(catalog["tasks"])]
    catalog = service.reorder_discovery_tasks(order, 2)
    assert [t["name"] for t in catalog["tasks"]] == order
    public = list_cases(service._discovery_store)
    assert public[0]["name"] == "new-study"
    assert public[0]["summary_zh"] == "$$y=2x$$"
    assert all("data_locations" not in t and "preparation" not in t for t in public)
    for command in (
        lambda: service.save_discovery_task(task, 1),
        lambda: service.delete_discovery_task(task["name"], 1),
        lambda: service.reorder_discovery_tasks(order, 1),
    ):
        with pytest.raises(ServiceError) as error:
            command()
        assert error.value.status_code == 409
    with pytest.raises(ServiceError):
        service.reorder_discovery_tasks(order[:-1] + [order[0]], 3)
    with pytest.raises(ServiceError):
        service.save_discovery_task({**task, "publisher_url": "javascript:alert(1)"}, 3)
    with pytest.raises(ServiceError):
        service.save_discovery_task({**task, "data_locations": []}, 3)
    service.delete_discovery_task(task["name"], 3)
    with pytest.raises(ServiceError):
        service.save_discovery_task(task, 4, create=True)


def test_paths_cannot_escape_shared_root_or_overlap(setup, tmp_path):
    service, source = setup
    task = service.discovery_catalog()["tasks"][0]
    for paths in (
        [str(tmp_path / "secret")],
        ["../secret"],
        [str(source.parent)],
        [str(source), str(source)],
        ["group", "group/nested.csv"],
    ):
        with pytest.raises(ServiceError):
            service.save_discovery_task({**task, "data_locations": paths}, 0)
    link = source.parent / "escaped"
    try:
        link.symlink_to(tmp_path, target_is_directory=True)
    except OSError:
        pytest.skip("Host cannot create symlinks")
    with pytest.raises(ServiceError):
        service.save_discovery_task({**task, "data_locations": [str(link / "secret")]}, 0)


def test_http_admin_contract_and_disabled_cannot_load(setup):
    service, source = setup
    with TestClient(create_app(service, token=TOKEN)) as client:
        assert client.get("/v1/discovery-tasks").status_code == 401
        client.headers["Authorization"] = "Bearer " + TOKEN
        catalog = client.get("/v1/discovery-tasks").json()
        task = catalog["tasks"][0]
        sid = service.create(tags={"user_ref": "alice"}, idempotency_key="alice")["id"]
        path = f"/v1/sessions/{sid}/data/discovery-tasks"
        assert client.get(path).json() == {"tasks": []}
        assert client.post(path + "/load", json={"name": task["name"]}).status_code == 404
        task.update(data_locations=[str(source)], enabled=True)
        result = client.put(
            "/v1/discovery-tasks/" + task["name"], json={"task": task, "expected_revision": 0}
        )
        assert result.status_code == 200, result.text
        assert client.get(path).json()["tasks"][0]["available"]
        assert (
            client.put(
                "/v1/discovery-tasks/order",
                json={
                    "names": [t["name"] for t in reversed(catalog["tasks"])],
                    "expected_revision": 1,
                },
            ).status_code
            == 200
        )
        assert (
            client.put(
                "/v1/discovery-tasks/other",
                json={
                    "task": task,
                    "expected_revision": 2,
                },
            ).status_code
            == 422
        )
        assert (
            client.delete(
                "/v1/discovery-tasks/" + task["name"], params={"expected_revision": 2}
            ).status_code
            == 200
        )


@pytest.mark.skipif(__import__("os").name == "nt", reason="Requires POSIX scientific sandbox")
def test_loaded_session_keeps_prompts_and_mounts_after_edit_delete_restart(setup, tmp_path):
    service, source = setup
    task = configured(service, source)
    sid = service.create(tags={"user_ref": "alice"}, idempotency_key="loaded")["id"]
    result = service.invoke(sid, "load_discovery_task", {"payload": {"name": task["name"]}})
    assert result["mounts"] == [source.name]
    assert "-173" not in json.dumps(result["prompts"])
    assert source.name in result["prompts"]["data_agent"]
    session = service._session(sid)
    assert (session.workspace / source.name).is_symlink()
    assert session.workspace_manager.mount_mode(source.name) == "read-only"
    with pytest.raises(PermissionError):
        session.workspace_manager.open_for_write(source.name, "w")
    # The second version points at different data and contains literal braces in its prompt.
    other = source.with_name("other.csv")
    other.write_text("x,y\n3,6\n")
    changed = deepcopy(task)
    changed.update(
        task="A changed question",
        preparation='Input {inputs}; JSON {"x": 1}',
        data_locations=[str(other)],
    )
    service.save_discovery_task(changed, 1)
    service.delete_discovery_task(task["name"], 2)
    service.close()
    restarted = LocalHarnessService(service.root)
    try:
        restored = restarted._session(sid)
        assert restored.discovery_task["prompts"] == result["prompts"]
        assert restored.workspace_manager.mount_mode(source.name) == "read-only"
        assert (restored.workspace / source.name).resolve() == source
        assert not (restored.workspace / other.name).exists()
        assert restarted.invoke(sid, "discovery_tasks", {}) == {"tasks": []}
    finally:
        restarted.close()


def test_failed_atomic_save_keeps_previous_catalog(setup, monkeypatch):
    service, source = setup
    previous = service.discovery_catalog()
    from pathlib import Path

    monkeypatch.setattr(Path, "replace", lambda *args: (_ for _ in ()).throw(OSError("disk full")))
    with pytest.raises(OSError):
        configured(service, source)
    assert service.discovery_catalog() == previous
    assert DiscoveryTaskStore(service.root / "discovery-tasks.json").catalog() == previous
    assert not list(service.root.glob("discovery-tasks.*.tmp"))


def test_remote_python_client_shares_catalog_and_errors(setup):
    service, source = setup
    with TestClient(create_app(service, token=TOKEN)) as client:

        def send(request):
            response = client.request(
                request.method,
                str(request.url),
                headers=dict(request.headers),
                content=request.content,
            )
            return httpx.Response(
                response.status_code, content=response.content, headers=response.headers
            )

        remote = HttpHarnessService("http://testserver", TOKEN, transport=httpx.MockTransport(send))
        try:
            value = remote.discovery_catalog()
            task = {
                **value["tasks"][0],
                "name": "remote-task",
                "data_locations": [str(source)],
                "enabled": True,
            }
            assert len(remote.save_discovery_task(task, 0, create=True)["tasks"]) == 8
            task["title"] = "Remote update"
            value = remote.save_discovery_task(task, 1)
            assert value == service.discovery_catalog()
            names = [t["name"] for t in reversed(value["tasks"])]
            assert remote.reorder_discovery_tasks(names, 2)["tasks"][0]["name"] == "remote-task"
            with pytest.raises(ServiceError) as error:
                remote.delete_discovery_task("remote-task", 1)
            assert error.value.code == "discovery_conflict"
            assert len(remote.delete_discovery_task("remote-task", 3)["tasks"]) == 7
        finally:
            remote.close()
