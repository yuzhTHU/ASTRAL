"""Global defaults and shared Agent-type overrides owned entirely by Harness."""

from copy import deepcopy
from dataclasses import asdict
import json
from pathlib import Path
import threading
import uuid

from ..core.tool_config import ToolConfigurationError, resolve_tool_configuration
from ..tools import BaseTool
from .base import ServiceError

ROLES = ("search", "data", "evaluator", "global")


def configurable_tools():
    return {
        tool.metadata.name: tool
        for tool in BaseTool.load_tool_classes()
        if getattr(tool, "configuration_model", None) is not None
    }


def catalog():
    return {
        "schema_version": 1,
        "tools": [
            {
                "name": name,
                "description": cls.metadata.description,
                "configuration_schema": cls.configuration_model.schema(cls.configuration_defaults),
                "defaults": asdict(cls.configuration_model.parse({}, cls.configuration_defaults)),
            }
            for name, cls in sorted(configurable_tools().items())
        ],
    }


class ToolConfigurationStore:
    def __init__(self, path: Path, *, parent=None):
        self.path = path
        self.parent = parent
        self.lock = threading.RLock()
        self.records = {}
        if path.is_file():
            value = json.loads(path.read_text(encoding="utf8"))
            if value.get("schema_version") != 1:
                raise ServiceError(409, "Unsupported tool configuration file version")
            self.records.update(value["records"])

    @staticmethod
    def definition(role, tool):
        if role not in ROLES or tool not in configurable_tools():
            raise ServiceError(
                404, "Unknown configurable tool or agent", code="tool_config_not_found"
            )
        return configurable_tools()[tool]

    def get(self, role, tool):
        cls = self.definition(role, tool)
        with self.lock:
            own = self.records.get(f"{role}:{tool}", {})
            resolved = resolve_tool_configuration(
                tool,
                role,
                asdict(cls.configuration_model.parse({}, cls.configuration_defaults)),
                self.parent.records if self.parent is not None else self.records,
                self.records if self.parent is not None else {},
            )
            return deepcopy(
                {
                    "schema_version": 1,
                    "role": role,
                    "tool": tool,
                    "revision": own.get("revision", 0),
                    "overridden": own.get("settings") is not None,
                    **resolved,
                }
            )

    def put(self, role, tool, settings, expected_revision=None):
        cls = self.definition(role, tool)
        try:
            parsed = asdict(
                cls.configuration_model.parse(settings, self.get(role, tool)["settings"])
            )
        except ToolConfigurationError as error:
            raise ServiceError(422, str(error), code="tool_config_invalid") from None
        with self.lock:
            previous = self.get(role, tool)
            if expected_revision is not None and expected_revision != previous["revision"]:
                raise ServiceError(
                    409,
                    "Tool configuration changed; reload before saving",
                    code="tool_config_conflict",
                )
            return self._save(role, tool, parsed, previous)

    def reset(self, role, tool, expected_revision=None):
        with self.lock:
            previous = self.get(role, tool)
            if expected_revision is not None and expected_revision != previous["revision"]:
                raise ServiceError(
                    409,
                    "Tool configuration changed; reload before saving",
                    code="tool_config_conflict",
                )
            # Keep the revision tombstone to prevent stale writes after removing an override.
            return self._save(role, tool, None, previous)

    def _save(self, role, tool, settings, previous):
        value = {
            "schema_version": 1,
            "role": role,
            "tool": tool,
            "revision": previous["revision"] + 1,
            "settings": settings,
        }
        records = {**self.records, f"{role}:{tool}": value}
        temporary = self.path.with_suffix("." + uuid.uuid4().hex + ".tmp")
        temporary.write_text(json.dumps({"schema_version": 1, "records": records}), encoding="utf8")
        temporary.replace(self.path)
        # Updating one mapping entry is atomic; branches share the same args view.
        self.records[f"{role}:{tool}"] = value
        return self.get(role, tool)
