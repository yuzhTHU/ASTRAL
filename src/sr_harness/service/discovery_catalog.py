"""Durable scientific task catalog, independent of HTTP and Web authentication."""

from copy import deepcopy
import json
import os
from pathlib import Path
import threading
import uuid
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from .base import ServiceError


class DiscoveryTask(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    name: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
    topic: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=1024)
    publisher_url: str = Field(default="", max_length=2048)
    subject_zh: str = Field(min_length=1, max_length=1024)
    relation_zh: str = Field(default="", max_length=20000)
    description_zh: str = Field(default="", max_length=20000)
    description_en: str = Field(default="", max_length=20000)
    data_stage: str = Field(default="", max_length=2048)
    files: list[str] = Field(default_factory=list, max_length=128)
    task: str = Field(min_length=1, max_length=20000)
    preparation: str = Field(min_length=1, max_length=20000)
    evaluation: str = Field(min_length=1, max_length=20000)
    citation: str = Field(default="", max_length=1024)
    summary_zh: str = Field(default="", max_length=20000)
    summary_en: str = Field(default="", max_length=20000)
    data_locations: list[str] = Field(default_factory=list, max_length=128)
    enabled: bool = False

    @model_validator(mode="after")
    def validate_content(self):
        if self.name == "order":
            raise ValueError("Task identifier is reserved")
        if self.publisher_url:
            url = urlsplit(self.publisher_url)
            if url.scheme not in {"https", "http"} or not url.netloc or url.username:
                raise ValueError("Publisher URL must use HTTP/HTTPS without credentials")
        if any(not v.strip() or len(v) > 4096 or "\0" in v for v in self.data_locations):
            raise ValueError("Invalid data location")
        if any(len(v) > 4096 or "\0" in v for v in self.files):
            raise ValueError("Invalid file name")
        return self


def sample_root():
    """Explicit deployment root, shared by the catalog and the data loader."""
    configured = os.environ.get("ASTRAL_SAMPLE_DATA_ROOT")
    if configured:
        return Path(configured).expanduser().resolve()
    configured = os.environ.get("ASTRAL_PROJECT_ROOT")
    if configured:
        return Path(configured).expanduser().resolve() / "data"
    for path in (Path.cwd(), *Path(__file__).resolve().parents):
        if (path / "data").is_dir() and (path / "pyproject.toml").exists():
            return path / "data"
    return Path.cwd() / "data"


def source_paths(task):
    root = sample_root().resolve()
    paths = []
    for value in task["data_locations"]:
        path = Path(value).expanduser()
        path = (path if path.is_absolute() else root / path).resolve()
        if path == root or not path.is_relative_to(root):
            raise ServiceError(
                422,
                "Data locations must be inside the shared sample data root",
                code="discovery_invalid_location",
            )
        paths.append(path)
    if len({p.name for p in paths}) != len(paths):
        raise ServiceError(422, "Input basenames must be unique", code="discovery_invalid_location")
    # Mounting a directory and its descendant twice creates ambiguous workspace inputs.
    if any(a != b and a.is_relative_to(b) for a in paths for b in paths):
        raise ServiceError(422, "Overlapping data locations", code="discovery_invalid_location")
    return paths


class DiscoveryTaskStore:
    """Single-Harness atomic catalog with CAS and immutable versions for loaded sessions."""

    def __init__(self, path):
        self.path = Path(path)
        self.lock = threading.RLock()
        if self.path.exists():
            self.value = json.loads(self.path.read_text(encoding="utf8"))
            if self.value.get("schema_version") != 1:
                raise ValueError("Unsupported discovery catalog version")
        else:
            self.value = {
                "schema_version": 1,
                "migration_version": 0,
                "revision": 0,
                "tasks": [],
                "history": {},
            }
        # Migrations run once. Deleted seeds never reappear on subsequent starts.
        value = deepcopy(self.value)
        for migration in sorted(Path(__file__).with_name("migrations").glob("*.json")):
            payload = json.loads(migration.read_text(encoding="utf8"))
            if payload["version"] <= value["migration_version"]:
                continue
            value["tasks"].extend(
                DiscoveryTask.model_validate(t).model_dump() for t in payload["tasks"]
            )
            value["migration_version"] = payload["version"]
        if value != self.value or not self.path.exists():
            self._commit(value)

    def _commit(self, value):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix("." + uuid.uuid4().hex + ".tmp")
        try:
            with temporary.open("x", encoding="utf8") as stream:
                json.dump(value, stream, ensure_ascii=False)
                stream.flush()
                os.fsync(stream.fileno())
            temporary.replace(self.path)
            self.value = value
        finally:
            temporary.unlink(missing_ok=True)

    def catalog(self):
        with self.lock:
            return deepcopy({"revision": self.value["revision"], "tasks": self.value["tasks"]})

    def _edit(self, expected_revision):
        if type(expected_revision) is not int or expected_revision != self.value["revision"]:
            raise ServiceError(
                409, "Task catalog changed; reload before saving", code="discovery_conflict"
            )
        value = deepcopy(self.value)
        value["revision"] += 1
        return value

    def save(self, task, expected_revision, *, create=False):
        try:
            task = DiscoveryTask.model_validate(task).model_dump()
        except ValidationError as error:
            raise ServiceError(422, "Invalid task fields", code="discovery_invalid") from error
        paths = source_paths(task)
        from .discovery import ready

        if task["enabled"] and not ready(paths):
            raise ServiceError(
                422,
                "Configure readable data locations before enabling the task",
                code="discovery_data_unavailable",
            )
        task["data_locations"] = [str(p) for p in paths]
        with self.lock:
            value = self._edit(expected_revision)
            index = next(
                (i for i, t in enumerate(value["tasks"]) if t["name"] == task["name"]), None
            )
            if create and (index is not None or task["name"] in value["history"]):
                raise ServiceError(409, "Task identifier already used", code="discovery_exists")
            if not create and index is None:
                raise ServiceError(404, "Task not found", code="discovery_not_found")
            if create:
                value["tasks"].append(task)
            else:
                value["tasks"][index] = task
            # Versions are trusted server state, never source paths supplied by a session snapshot.
            value["history"].setdefault(task["name"], {})[str(value["revision"])] = task
            self._commit(value)
            return self.catalog()

    def delete(self, name, expected_revision):
        with self.lock:
            value = self._edit(expected_revision)
            if not any(t["name"] == name for t in value["tasks"]):
                raise ServiceError(404, "Task not found", code="discovery_not_found")
            # Reserve the identifier and retain versions used by existing sessions.
            value["history"].setdefault(name, {})
            value["tasks"] = [t for t in value["tasks"] if t["name"] != name]
            self._commit(value)
            return self.catalog()

    def reorder(self, names, expected_revision):
        with self.lock:
            value = self._edit(expected_revision)
            tasks = {t["name"]: t for t in value["tasks"]}
            if len(names) != len(tasks) or set(names) != set(tasks):
                raise ServiceError(
                    422,
                    "Order must contain every task exactly once",
                    code="discovery_invalid_order",
                )
            value["tasks"] = [tasks[name] for name in names]
            self._commit(value)
            return self.catalog()

    def selected(self, name, revision=None):
        with self.lock:
            if revision is not None:
                task = self.value["history"].get(name, {}).get(str(revision))
            else:
                task = next((t for t in self.value["tasks"] if t["name"] == name), None)
                if task is not None and not task["enabled"]:
                    task = None
            if task is None:
                raise ServiceError(404, "Task not found or disabled", code="discovery_not_found")
            if revision is None:
                versions = self.value["history"].get(name, {})
                revision = max((int(r) for r in versions), default=0)
            return deepcopy(task), revision
