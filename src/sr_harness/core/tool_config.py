"""Transport-independent tool runtime settings, separate from model-call parameters."""

from dataclasses import asdict, dataclass
import math
from urllib.parse import urlsplit


def resolve_tool_configuration(tool, role, defaults, global_records, agent_records):
    """Resolve whole-record overrides in increasing specificity, shared by APIs and tools."""
    result = {"settings": dict(defaults), "source": "builtin", "source_revision": 0}
    layers = [(global_records, f"global:{tool}", "global")]
    if role in {"search", "data", "evaluator"}:
        layers.append((agent_records, f"{role}:{tool}", "agent"))
    for records, key, source in layers:
        record = records.get(key, {})
        if record.get("settings") is not None:
            result = {
                "settings": record["settings"],
                "source": source,
                "source_revision": record.get("revision", 0),
            }
    return result


class ToolConfigurationError(ValueError):
    """A safe, input-independent configuration validation error."""


@dataclass(frozen=True)
class NetworkToolConfiguration:
    """An immutable network policy captured at the start of one tool call."""

    timeout_seconds: float = 20
    proxy_mode: str = "direct"
    proxy_url: str | None = None

    @classmethod
    def parse(cls, value: dict, defaults: dict) -> "NetworkToolConfiguration":
        """Validate and replace a whole configuration using tool-owned defaults."""
        if not isinstance(value, dict) or set(value) - set(asdict(cls())):
            raise ToolConfigurationError("Unknown tool configuration fields")
        settings = {**defaults, **value}
        timeout = settings.get("timeout_seconds", 20)
        if (
            isinstance(timeout, bool)
            or not isinstance(timeout, (int, float))
            or not math.isfinite(timeout)
            or not 0.1 <= timeout <= 120
        ):
            raise ToolConfigurationError("timeout_seconds must be between 0.1 and 120")
        mode, proxy = settings.get("proxy_mode", "direct"), settings.get("proxy_url")
        if not isinstance(mode, str) or mode not in {"direct", "custom"}:
            raise ToolConfigurationError("proxy_mode must be direct or custom")
        if mode == "direct":
            if proxy is not None and proxy != "":
                raise ToolConfigurationError("Direct connection must not specify a proxy URL")
            proxy = None
        else:
            try:
                if not isinstance(proxy, str) or not proxy or len(proxy) > 2048:
                    raise ValueError()
                parsed = urlsplit(proxy)
                if (
                    parsed.scheme not in {"http", "https"}
                    or not parsed.hostname
                    or parsed.username is not None
                    or parsed.password is not None
                    or parsed.path not in {"", "/"}
                    or parsed.query
                    or parsed.fragment
                    or any(char.isspace() for char in proxy)
                ):
                    raise ValueError()
                if parsed.port is not None and not 1 <= parsed.port <= 65535:
                    raise ValueError()
            except (ValueError, TypeError):
                raise ToolConfigurationError(
                    "Proxy must be an HTTP/HTTPS address without credentials, "
                    "path, query or fragment"
                ) from None
        return cls(float(timeout), mode, proxy)

    @classmethod
    def schema(cls, defaults: dict) -> dict:
        """Describe the same validation rules to configuration clients, never the model."""
        return {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "timeout_seconds": {
                    "type": "number",
                    "title": "请求超时 / Timeout (seconds)",
                    "minimum": 0.1,
                    "maximum": 120,
                    "default": defaults["timeout_seconds"],
                },
                "proxy_mode": {
                    "type": "string",
                    "title": "连接方式 / Connection",
                    "enum": ["direct", "custom"],
                    "default": "direct",
                },
                "proxy_url": {
                    "type": ["string", "null"],
                    "title": "代理地址 / Proxy URL",
                    "maxLength": 2048,
                    "default": None,
                    "description": (
                        "HTTP/HTTPS proxy, no credentials. Address is resolved by Harness."
                    ),
                },
            },
        }
