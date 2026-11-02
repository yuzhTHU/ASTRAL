"""CLI adapter for the same Harness tool configuration service used by Web."""

import argparse
import json
import os
from pathlib import Path


def setup_parser(parser=None):
    parser = parser or argparse.ArgumentParser(prog="astral tool-config")
    connection = parser.add_mutually_exclusive_group(required=True)
    connection.add_argument("--url", help="Running Harness HTTP URL")
    connection.add_argument(
        "--root", help="Offline local Harness root; do not use while serve is running"
    )
    scope = parser.add_mutually_exclusive_group()
    scope.add_argument(
        "--role",
        choices=["search", "data", "evaluator"],
        help="Configure an Agent type across all research sessions",
    )
    scope.add_argument(
        "--global",
        dest="global_defaults",
        action="store_true",
        help="Manage global defaults (default without --role)",
    )
    commands = parser.add_subparsers(dest="action", required=True)
    commands.add_parser("catalog")
    for action in ["get", "set", "reset", "test"]:
        sub = commands.add_parser(action)
        sub.add_argument("tool")
        if action == "set":
            sub.add_argument(
                "--file", required=True, help="JSON settings object or exported record"
            )
        if action in {"set", "reset"}:
            sub.add_argument("--expected-revision", type=int)
        if action == "test":
            sub.add_argument("--url-to-fetch")
            sub.add_argument("--query")
    return parser


def main(args):
    from ..service import LocalHarnessService, HttpHarnessService, ServiceError

    role = args.role or "global"
    service = (
        HttpHarnessService(args.url, os.environ.get("HARNESS_SERVICE_TOKEN", ""))
        if args.url
        else LocalHarnessService(args.root)
    )
    try:
        if args.action == "catalog":
            result = service.tool_catalog()
        elif args.action == "get":
            result = service.tool_configuration(role, args.tool)
        elif args.action == "set":
            value = json.loads(Path(args.file).read_text(encoding="utf8"))
            if not isinstance(value, dict) or value.get("schema_version", 1) != 1:
                raise ValueError("Expected a schema-version-1 tool configuration object")
            if "settings" in value and value.get("tool", args.tool) != args.tool:
                raise ValueError("Configuration record belongs to another tool")
            result = service.configure_tool(
                role,
                args.tool,
                value.get("settings", value),
                args.expected_revision,
            )
        elif args.action == "reset":
            result = service.reset_tool_configuration(role, args.tool, args.expected_revision)
        else:
            parameters = {"url": args.url_to_fetch} if args.url_to_fetch else {}
            if args.query:
                parameters["query"] = args.query
            result = service.test_tool_configuration(role, args.tool, parameters)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1 if result.get("ok") is False else 0
    except ServiceError as error:
        print(json.dumps({"error": {"code": error.code, "message": str(error.detail)}}))
        return 1
    finally:
        service.close()
