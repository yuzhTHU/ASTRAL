"""Filesystem-backed session storage contract, independent of HTTP and user authentication."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator


@dataclass(frozen=True)
class SessionLocation:
    """A session's allocated filesystem, suitable for local disks or mounted user volumes."""

    namespace: str
    session_id: str
    directory: Path

    @property
    def workspace(self) -> Path:
        """Return the workspace shared by this session's scientific agents."""
        return self.directory / "workspace"

    @property
    def runs(self) -> Path:
        """Return the directory containing this session's run artifacts."""
        return self.directory / "runs"


class WorkspaceStorage(ABC):
    """Allocate per-user volumes and persist sessions on a mounted filesystem.

    Namespace values are opaque owner references supplied by the application. A future
    PVC adapter owns provisioning, mounting and discovering user volumes here. Scientific
    tools still require real filesystem paths for the existing sandbox/Workspace boundary.
    Implementations must reject unsafe links and duplicate session IDs during discovery.
    """

    @abstractmethod
    def load_sessions(self) -> Iterator[tuple[SessionLocation, dict]]:
        """Discover durable session metadata, including archived sessions."""

    @abstractmethod
    def create_session(self, namespace: str, session_id: str, metadata: dict) -> SessionLocation:
        """Allocate a session under its owner's volume and persist its initial metadata."""

    @abstractmethod
    def read_json(self, location: SessionLocation, name: str) -> dict | None:
        """Read session state, returning None when that state has not been saved yet."""

    @abstractmethod
    def write_json(self, location: SessionLocation, name: str, value: dict) -> None:
        """Atomically replace a session state document."""

    @abstractmethod
    def export_files(self, location: SessionLocation) -> Iterator[tuple[str, Path]]:
        """Yield relative archive names and ordinary files belonging to this session only."""
