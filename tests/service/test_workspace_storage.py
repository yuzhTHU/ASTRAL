"""Owner-scoped storage, safe legacy migration, and backend substitution."""

import io
import json
import uuid
import zipfile

import pytest
from fastapi.testclient import TestClient

from sr_harness.http.app import create_app
from sr_harness.service import LocalHarnessService, ServiceError
from sr_harness.storage import LocalDiskWorkspaceStorage, WorkspaceStorage

TOKEN = "workspace-storage-service-token-12345678"


def metadata(namespace, sid):
    return {
        "id": sid,
        "storage_namespace": namespace,
        "tags": {"user_ref": namespace},
        "archived": False,
        "created_at": 1,
        "creation_key": sid,
        "commands": {},
    }


def link(source, destination, *, directory=False):
    try:
        destination.symlink_to(source, target_is_directory=directory)
    except OSError:
        pytest.skip("Symlink creation is not permitted on this test host")


def test_local_store_groups_sessions_by_user_and_persists_state(tmp_path):
    storage = LocalDiskWorkspaceStorage(tmp_path)
    locations = []
    for owner in ("alice", "alice", "bob"):
        sid = uuid.uuid4().hex
        location = storage.create_session(owner, sid, metadata(owner, sid))
        locations.append(location)
        assert location.directory == tmp_path / "users" / owner / sid
        storage.write_json(location, "snapshot.json", {"marker": sid})
        assert storage.read_json(location, "snapshot.json") == {"marker": sid}
    assert locations[0].directory.parent == locations[1].directory.parent
    assert locations[0].directory.parent != locations[2].directory.parent
    restored = list(LocalDiskWorkspaceStorage(tmp_path).load_sessions())
    assert {location.session_id for location, _ in restored} == {x.session_id for x in locations}


@pytest.mark.parametrize(
    "namespace",
    ["../escape", "/absolute", "User", "user", "CON", "con", "lpt1", "a" * 200, "用户一"],
)
def test_opaque_namespace_values_cannot_escape_or_alias_directories(tmp_path, namespace):
    storage = LocalDiskWorkspaceStorage(tmp_path)
    sid = uuid.uuid4().hex
    location = storage.create_session(namespace, sid, metadata(namespace, sid))
    assert location.directory.is_relative_to(tmp_path / "users")
    assert location.directory.parent.name not in {".", "..", "CON"}
    assert len(location.directory.parent.name) <= 65
    assert storage.namespace_key("User") != storage.namespace_key("user")
    assert next(storage.load_sessions())[0].namespace == namespace


def test_backend_is_injected_without_service_path_assumptions(tmp_path):
    config = tmp_path / "config"
    storage = LocalDiskWorkspaceStorage(tmp_path / "mounted-user-volumes")
    assert isinstance(storage, WorkspaceStorage)
    service = LocalHarnessService(config, storage=storage)
    sid = service.create(tags={"user_ref": "alice"}, idempotency_key="injected")["id"]
    session = service._session(sid)
    assert session.workspace == storage.users / "alice" / sid / "workspace"
    assert session.run_dir == storage.users / "alice" / sid / "runs"
    service._checkpoint(sid)
    service.close()
    assert not (config / "users").exists()
    restored = LocalHarnessService(config, storage=LocalDiskWorkspaceStorage(storage.root))
    assert restored.list_sessions()[0]["id"] == sid
    assert restored.invoke(sid, "status", {})["state"] == "idle"
    restored.close()


def test_owner_is_immutable_and_metadata_stays_in_same_user_folder(tmp_path):
    service = LocalHarnessService(tmp_path)
    sid = service.create(tags={"user_ref": "alice"}, idempotency_key="owner")["id"]
    assert "storage_namespace" not in service.list_sessions()[0]
    with pytest.raises(ServiceError) as error:
        service.update(sid, tags={"user_ref": "bob"})
    assert error.value.status_code == 409
    assert error.value.code == "storage_owner_immutable"
    assert service.create(tags={"user_ref": "alice"}, idempotency_key="owner")["id"] == sid
    service.update(sid, tags={"user_ref": "alice", "note": "changed"}, archived=True)
    assert (tmp_path / "users" / "alice" / sid / "metadata.json").exists()
    assert not (tmp_path / "users" / "bob").exists()
    service.close()


def test_flat_sessions_are_migrated_once_with_snapshots_and_artifacts(tmp_path):
    sid = uuid.uuid4().hex
    old = tmp_path / sid
    (old / "workspace" / "context.evaluator").mkdir(parents=True)
    (old / "runs").mkdir()
    (old / "workspace" / "notes.txt").write_text("Original research", encoding="utf8")
    evaluator = old / "workspace" / "context.evaluator" / "custom.py"
    evaluator.write_text("# preserved evaluator", encoding="utf8")
    record = metadata("alice", sid)
    record.pop("storage_namespace")
    (old / "metadata.json").write_text(json.dumps(record), encoding="utf8")
    (old / "snapshot.json").write_text(
        json.dumps({"evaluator": {"custom_file": str(evaluator)}}), encoding="utf8"
    )
    (old / "runs" / "nodes.jsonl").write_text('{"node":1}\n', encoding="utf8")
    storage = LocalDiskWorkspaceStorage(tmp_path)
    location, restored = next(storage.load_sessions())
    assert location.namespace == "alice" and location.session_id == sid
    assert restored["storage_namespace"] == "alice"
    assert not old.exists()
    assert (location.workspace / "notes.txt").read_text() == "Original research"
    assert (location.runs / "nodes.jsonl").read_text() == '{"node":1}\n'
    assert storage.read_json(location, "snapshot.json")["evaluator"]["custom_file"] == str(
        location.workspace / "context.evaluator" / "custom.py"
    )
    assert len(list(storage.load_sessions())) == 1


def test_migration_preserves_runtime_state_and_idempotency(tmp_path):
    service = LocalHarnessService(tmp_path)
    sid = service.create(tags={"user_ref": "alice"}, idempotency_key="original-key")["id"]
    session = service._session(sid)
    session.data_interaction_manager.publish_event(
        "prompt_added", {"content": "Saved conversation"}
    )
    service.close()
    location = service._locations[sid]
    record = json.loads((location.directory / "metadata.json").read_text())
    record.pop("storage_namespace")
    (location.directory / "metadata.json").write_text(json.dumps(record), encoding="utf8")
    location.directory.rename(tmp_path / sid)
    restored = LocalHarnessService(tmp_path)
    assert restored.create(tags={"user_ref": "alice"}, idempotency_key="original-key")["id"] == sid
    state = restored._session(sid)
    events = state.data_interaction_manager.get_recent_events(0)["events"]
    assert any(e["payload"].get("content") == "Saved conversation" for e in events)
    restored.close()


def test_migration_refuses_conflicting_destination_without_merging(tmp_path):
    storage = LocalDiskWorkspaceStorage(tmp_path)
    sid = uuid.uuid4().hex
    location = storage.create_session("alice", sid, metadata("alice", sid))
    old = tmp_path / sid
    old.mkdir()
    (old / "metadata.json").write_text(json.dumps(metadata("alice", sid)), encoding="utf8")
    with pytest.raises(ValueError, match="conflicts"):
        list(storage.load_sessions())
    assert (old / "metadata.json").exists()
    assert (location.directory / "metadata.json").exists()


def test_atomic_state_write_failure_keeps_previous_snapshot(tmp_path):
    storage = LocalDiskWorkspaceStorage(tmp_path)
    sid = uuid.uuid4().hex
    location = storage.create_session("alice", sid, metadata("alice", sid))
    storage.write_json(location, "snapshot.json", {"previous": True})
    with pytest.raises(ValueError):
        storage.write_json(location, "snapshot.json", {"invalid": float("nan")})
    assert storage.read_json(location, "snapshot.json") == {"previous": True}
    assert not list(location.directory.glob("*.tmp"))


def test_duplicate_session_ids_across_users_are_rejected_on_discovery(tmp_path):
    storage = LocalDiskWorkspaceStorage(tmp_path)
    sid = uuid.uuid4().hex
    storage.create_session("alice", sid, metadata("alice", sid))
    storage.create_session("bob", sid, metadata("bob", sid))
    with pytest.raises(ValueError, match="Duplicate session"):
        list(storage.load_sessions())


@pytest.mark.skipif(
    __import__("os").name != "posix", reason="Custom evaluator sandbox requires Linux"
)
def test_migration_restores_a_custom_evaluator_from_its_new_path(tmp_path):
    from sr_harness.evaluator import load_custom_evaluator

    service = LocalHarnessService(tmp_path)
    sid = service.create(tags={"user_ref": "alice"}, idempotency_key="custom")["id"]
    session = service._session(sid)
    directory = session.workspace / "context.evaluator"
    directory.mkdir()
    evaluator = directory / "stored_evaluator.py"
    evaluator.write_text(
        "from sr_harness.evaluator import DefaultEvaluator\n"
        "class StoredEvaluator(DefaultEvaluator):\n    pass\n",
        encoding="utf8",
    )
    session.context.evaluator = load_custom_evaluator(
        file=evaluator, workspace=session.workspace_manager
    )
    service.close()
    location = service._locations[sid]
    old = tmp_path / sid
    location.directory.rename(old)
    snapshot = json.loads((old / "snapshot.json").read_text())
    snapshot["evaluator"]["custom_file"] = str(
        old / "workspace" / "context.evaluator" / evaluator.name
    )
    (old / "snapshot.json").write_text(json.dumps(snapshot), encoding="utf8")
    restored = LocalHarnessService(tmp_path)
    try:
        restored_session = restored._session(sid)
        assert type(restored_session.context.evaluator).__name__ == "StoredEvaluator"
        assert restored_session._evaluator_metadata()["custom_file"] == str(evaluator)
    finally:
        restored.close()


def test_user_directory_links_and_state_document_links_are_rejected(tmp_path):
    storage = LocalDiskWorkspaceStorage(tmp_path / "storage")
    outside = tmp_path / "outside"
    outside.mkdir()
    link(outside, storage.users / "alice", directory=True)
    sid = uuid.uuid4().hex
    with pytest.raises(ValueError, match="symbolic"):
        storage.create_session("alice", sid, metadata("alice", sid))
    assert list(outside.iterdir()) == []
    location = storage.create_session("bob", sid, metadata("bob", sid))
    document = outside / "state.json"
    document.write_text('{"untouched":true}', encoding="utf8")
    link(document, location.directory / "snapshot.json")
    with pytest.raises(ValueError, match="symbolic"):
        storage.write_json(location, "snapshot.json", {"overwrite": True})
    assert json.loads(document.read_text()) == {"untouched": True}


@pytest.mark.skipif(
    __import__("os").name != "posix", reason="Scientific file access requires Linux"
)
def test_http_files_and_export_stay_within_session_under_user_volume(tmp_path):
    service = LocalHarnessService(tmp_path)
    with TestClient(
        create_app(service, token=TOKEN), headers={"Authorization": f"Bearer {TOKEN}"}
    ) as client:
        first = client.post(
            "/v1/sessions", json={"tags": {"user_ref": "alice"}, "idempotency_key": "a"}
        ).json()["id"]
        second = client.post(
            "/v1/sessions", json={"tags": {"user_ref": "alice"}, "idempotency_key": "b"}
        ).json()["id"]
        other = client.post(
            "/v1/sessions", json={"tags": {"user_ref": "bob"}, "idempotency_key": "c"}
        ).json()["id"]
        for sid, text in ((first, b"first"), (second, b"second"), (other, b"other-user")):
            assert (
                client.put(
                    f"/v1/sessions/{sid}/workspace/upload?path=notes.txt", content=text
                ).status_code
                == 200
            )
        for sid, text in ((first, b"first"), (second, b"second"), (other, b"other-user")):
            assert (
                client.get(f"/v1/sessions/{sid}/workspace/download?path=notes.txt").content == text
            )
        link(
            service._session(other).workspace,
            service._session(first).workspace / "other-user",
            directory=True,
        )
        result = client.get(f"/v1/sessions/{first}/export")
        assert result.status_code == 200
        with zipfile.ZipFile(io.BytesIO(result.content)) as archive:
            assert archive.read("workspace/notes.txt") == b"first"
            assert all("other-user" not in name for name in archive.namelist())
            assert "metadata.json" not in archive.namelist()
        assert client.get(
            f"/v1/sessions/{first}/workspace/download?path=../{other}/workspace/notes.txt"
        ).status_code in (400, 422)
