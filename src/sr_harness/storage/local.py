"""Local user directories with atomic state writes and legacy flat-layout migration."""

import hashlib
import json
import os
from pathlib import Path
import re
import uuid
from typing import Iterator

from .base import SessionLocation, WorkspaceStorage

LOCAL_NAMESPACE = "local"
_SESSION_ID = re.compile(r"[a-f0-9]{32}")
_STATE_NAMES = {"metadata.json", "snapshot.json"}
_PRIVATE_FILES = {"metadata.json", ".env", "tool-configurations.json"}
_RESERVED_NAMES = {
    "con",
    "prn",
    "aux",
    "nul",
    *[f"com{i}" for i in range(1, 10)],
    *[f"lpt{i}" for i in range(1, 10)],
}


class LocalDiskWorkspaceStorage(WorkspaceStorage):
    """Store every user's sessions below root/users/<namespace-key>/<session-id>."""

    def __init__(self, root: str | Path):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.users = self.root / "users"
        self._directory(self.users)

    @staticmethod
    def namespace_key(namespace: str) -> str:
        """Keep canonical user IDs readable; hash other opaque IDs without path traversal."""
        if not isinstance(namespace, str) or not namespace or len(namespace) > 256:
            raise ValueError(
                "Storage namespace must be a nonempty string of at most 256 characters"
            )
        if (
            re.fullmatch(r"[a-z0-9_][a-z0-9_-]{0,63}", namespace)
            and namespace not in _RESERVED_NAMES
        ):
            return namespace
        # '~' cannot appear in a readable key, avoiding collisions between the two forms.
        return "~" + hashlib.sha256(namespace.encode("utf8")).hexdigest()

    @staticmethod
    def _linked(path: Path) -> bool:
        return path.is_symlink() or path.is_junction()

    def _directory(self, path: Path, *, create=True):
        if self._linked(path):
            raise ValueError("Storage directories must not be symbolic links or junctions")
        path.resolve().relative_to(self.root)
        if create:
            path.mkdir(mode=0o700, parents=False, exist_ok=True)
        if not path.is_dir():
            raise ValueError("Storage directory is unavailable")

    def _location(self, namespace, session_id, *, create_user=False):
        if not isinstance(session_id, str) or not _SESSION_ID.fullmatch(session_id):
            raise ValueError("Invalid storage session ID")
        self._directory(self.users)
        user = self.users / self.namespace_key(namespace)
        self._directory(user, create=create_user)
        return SessionLocation(namespace, session_id, user / session_id)

    def _validate(self, location):
        expected = self._location(location.namespace, location.session_id)
        if location != expected:
            raise ValueError("Session storage location does not match its owner")
        self._directory(location.directory, create=False)
        for child in (location.workspace, location.runs):
            if self._linked(child) or (child.exists() and not child.is_dir()):
                raise ValueError("Session workspace and run roots must be ordinary directories")

    @staticmethod
    def _read(path):
        if LocalDiskWorkspaceStorage._linked(path):
            raise ValueError("Session state must not be a symbolic link or junction")
        if not path.exists():
            return None
        value = json.loads(path.read_text(encoding="utf8"))
        if not isinstance(value, dict):
            raise ValueError("Session state must be a JSON object")
        return value

    @staticmethod
    def _write(path, value):
        if LocalDiskWorkspaceStorage._linked(path):
            raise ValueError("Session state must not be a symbolic link or junction")
        temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
        try:
            descriptor = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            with os.fdopen(descriptor, "w", encoding="utf8") as output:
                json.dump(value, output, ensure_ascii=False, allow_nan=False)
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)

    def create_session(self, namespace: str, session_id: str, metadata: dict) -> SessionLocation:
        """Allocate a session directory and atomically save its immutable ownership record."""
        if metadata.get("id") != session_id or metadata.get("storage_namespace") != namespace:
            raise ValueError("Session metadata does not match its storage allocation")
        if (metadata["tags"].get("user_ref") or LOCAL_NAMESPACE) != namespace:
            raise ValueError("Session owner tag does not match its storage namespace")
        location = self._location(namespace, session_id, create_user=True)
        location.directory.mkdir(mode=0o700)
        try:
            self.write_json(location, "metadata.json", metadata)
        except BaseException:
            location.directory.rmdir()
            raise
        return location

    def read_json(self, location: SessionLocation, name: str) -> dict | None:
        """Read a state document from its verified session allocation."""
        if name not in _STATE_NAMES:
            raise ValueError("Unknown session state document")
        self._validate(location)
        return self._read(location.directory / name)

    def write_json(self, location: SessionLocation, name: str, value: dict) -> None:
        """Write state using a private temporary file and atomic replacement."""
        if name not in _STATE_NAMES:
            raise ValueError("Unknown session state document")
        self._validate(location)
        self._write(location.directory / name, value)

    def _migrate_flat_sessions(self):
        for source in self.root.iterdir():
            if not _SESSION_ID.fullmatch(source.name):
                continue
            self._directory(source, create=False)
            record = self._read(source / "metadata.json")
            if record is None:
                continue
            if record.get("id") != source.name:
                raise ValueError("Legacy session metadata does not match its directory")
            namespace = (
                record.get("storage_namespace") or record["tags"].get("user_ref") or LOCAL_NAMESPACE
            )
            destination = self._location(namespace, source.name, create_user=True)
            if destination.directory.exists() or self._linked(destination.directory):
                raise ValueError(
                    "Legacy migration conflicts with an existing session; no merge performed"
                )
            snapshot = self._read(source / "snapshot.json")
            if snapshot is not None:
                evaluator = snapshot.get("evaluator")
                if isinstance(evaluator, dict) and evaluator.get("custom_file"):
                    old_file = Path(evaluator["custom_file"])
                    try:
                        relative = old_file.relative_to(source)
                    except ValueError:
                        pass
                    else:
                        evaluator["custom_file"] = str(destination.directory / relative)
                        self._write(source / "snapshot.json", snapshot)
            self._write(source / "metadata.json", {**record, "storage_namespace": namespace})
            # Local migration is an atomic same-filesystem rename; never copy or merge data.
            source.rename(destination.directory)

    def load_sessions(self) -> Iterator[tuple[SessionLocation, dict]]:
        """Migrate flat sessions and discover validated per-user session metadata."""
        self._migrate_flat_sessions()
        seen = set()
        for user in self.users.iterdir():
            self._directory(user, create=False)
            for directory in user.iterdir():
                if not _SESSION_ID.fullmatch(directory.name):
                    continue
                self._directory(directory, create=False)
                record = self._read(directory / "metadata.json")
                if record is None:
                    continue
                namespace = record.get("storage_namespace")
                if namespace != (record["tags"].get("user_ref") or LOCAL_NAMESPACE):
                    raise ValueError("Session owner tag does not match its storage namespace")
                location = self._location(namespace, directory.name)
                if location.directory != directory or record.get("id") != directory.name:
                    raise ValueError("Session metadata does not match its user directory")
                if directory.name in seen:
                    raise ValueError("Duplicate session ID across user directories")
                seen.add(directory.name)
                yield location, record

    def export_files(self, location: SessionLocation) -> Iterator[tuple[str, Path]]:
        """Enumerate ordinary export files without following links to other workspaces."""
        self._validate(location)
        for parent, directories, names in os.walk(location.directory, followlinks=False):
            directories[:] = [name for name in directories if not self._linked(Path(parent) / name)]
            for name in names:
                path = Path(parent) / name
                if name not in _PRIVATE_FILES and not self._linked(path) and path.is_file():
                    yield path.relative_to(location.directory).as_posix(), path
