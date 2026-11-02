"""Public, transport-neutral service contract. No browser or user authentication."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, BinaryIO, Callable, Iterator


class ServiceError(Exception):
    def __init__(self, status_code: int, detail: Any, *, code: str = "invalid_request"):
        super().__init__(str(detail))
        self.status_code, self.detail, self.code = status_code, detail, code


@dataclass
class Download:
    chunks: Iterator[bytes]
    filename: str
    media_type: str = "application/octet-stream"
    close: Callable[[], Any] = lambda: None


class HarnessService(ABC):
    @abstractmethod
    def create(self, *, tags: dict[str, str], idempotency_key: str) -> dict: ...

    @abstractmethod
    def list_sessions(self, tags: dict[str, str] | None = None) -> list[dict]: ...

    @abstractmethod
    def update(
        self, session_id: str, *, tags: dict[str, str] | None = None, archived: bool | None = None
    ) -> dict: ...

    @abstractmethod
    def invoke(
        self,
        session_id: str,
        operation: str,
        parameters: dict[str, Any],
        *,
        idempotency_key: str | None = None,
    ) -> Any: ...

    @abstractmethod
    def credentials(self, session_id: str, role: str, configuration: dict) -> None: ...

    @abstractmethod
    def tool_catalog(self) -> dict: ...

    @abstractmethod
    def discovery_catalog(self) -> dict: ...

    @abstractmethod
    def save_discovery_task(
        self, task: dict, expected_revision: int, *, create: bool = False
    ) -> dict: ...

    @abstractmethod
    def delete_discovery_task(self, name: str, expected_revision: int) -> dict: ...

    @abstractmethod
    def reorder_discovery_tasks(self, names: list[str], expected_revision: int) -> dict: ...

    @abstractmethod
    def tool_configuration(self, role: str, tool: str) -> dict: ...

    @abstractmethod
    def configure_tool(
        self,
        role: str,
        tool: str,
        settings: dict,
        expected_revision: int | None = None,
    ) -> dict: ...

    @abstractmethod
    def reset_tool_configuration(
        self,
        role: str,
        tool: str,
        expected_revision: int | None = None,
    ) -> dict: ...

    @abstractmethod
    def test_tool_configuration(self, role: str, tool: str, parameters: dict) -> dict: ...

    @abstractmethod
    def upload(self, session_id: str, path: str, stream: BinaryIO) -> dict: ...

    @abstractmethod
    def export(self, session_id: str) -> Download: ...

    @abstractmethod
    def close(self) -> None: ...
