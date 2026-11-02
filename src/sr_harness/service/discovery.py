"""Scientific task loading: catalog definitions, read-only inputs and editable prompts."""

from __future__ import annotations


def prompts(case, paths, system_prompt):
    "Keep measurement preparation, evaluation design and the research question separate."
    inputs = "、".join(path.name for path in paths) or "、".join(case["files"]) or "所提供的目录"
    preparation = case["preparation"].replace("{inputs}", inputs)
    return {
        "data_agent": preparation,
        "problem_description": case["task"],
        "evaluator_agent": case["evaluation"],
        "system_prompt": system_prompt,
        "user_prompt": case["task"],
    }


def sources(case):
    from .discovery_catalog import source_paths

    return source_paths(case)


def ready(paths):
    try:
        return bool(paths) and all(
            p.is_file() and p.stat().st_size > 0 or p.is_dir() and any(p.iterdir()) for p in paths
        )
    except OSError:
        return False


def list_cases(store=None):
    if store is None:
        return []
    return [
        {
            k: v
            for k, v in case.items()
            if k not in {"files", "task", "preparation", "evaluation", "data_locations"}
        }
        | {"available": available(case)}
        for case in store.catalog()["tasks"]
        if case["enabled"]
    ]


def available(case):
    from .base import ServiceError

    try:
        return ready(sources(case))
    except (ServiceError, OSError):
        return False


def load_case(session, name):
    store = getattr(session, "discovery_catalog", None)
    if store is None:
        raise ValueError("No scientific task catalog configured")
    case, revision = store.selected(name)
    paths = sources(case)
    if not ready(paths):
        raise FileNotFoundError("任务数据尚未就绪；请先下载或接通原始数据目录。")
    with session.lock:
        if session.state != "idle" or any(
            t and t.is_alive() for t in (session.data_thread, session.evaluator_agent_thread)
        ):
            raise ValueError("请在空闲的新会话中加载科学发现任务。")
        context = session.workspace / "context.data"
        if (
            session.context.data
            or context.exists()
            and (not context.is_dir() or any(context.iterdir()))
        ):
            raise ValueError("当前已有处理后的数据，请新建会话后选择论文任务。")
        names = [p.name for p in paths]
        if len(names) != len(set(names)):
            raise ValueError("Task input names must be unique")
        for path in paths:
            logical = session.workspace / path.name
            if (logical.exists() or logical.is_symlink()) and not (
                logical.is_symlink() and logical.resolve() == path.resolve()
            ):
                raise FileExistsError(f"工作区已有同名文件：{path.name}；请新建会话。")
        preview = session.preview_initial_prompts({"problem_description": case["task"]})
        drafted = prompts(case, paths, preview["system_prompt"])
        mounted = [session.workspace_manager.mount(path, readonly=True).name for path in paths]
        session.initial_prompt = drafted["problem_description"]
        session.discovery_task = {"name": name, "revision": revision, "prompts": drafted}
        session.data_interaction_manager.publish_event(
            "workspace_changed", {"operation": "mounted", "paths": mounted, "read_only": True}
        )
        return {"name": name, "mounts": mounted, "read_only": True, "prompts": drafted}


def restore_mounts(session, name):
    "Restore only catalog-approved inputs, never arbitrary paths from a snapshot."
    store = getattr(session, "discovery_catalog", None)
    revision = (getattr(session, "discovery_task", None) or {}).get("revision")
    if store is None or revision is None:
        return
    from .base import ServiceError

    try:
        case, _ = store.selected(name, revision)
        paths = sources(case)
    except (ServiceError, OSError):
        return
    if not ready(paths) or session.workspace_manager.read_only:
        return
    for path in paths:
        logical = session.workspace / path.name
        if logical.is_symlink() and logical.resolve() == path.resolve():
            session.workspace_manager.mount(path, readonly=True)
