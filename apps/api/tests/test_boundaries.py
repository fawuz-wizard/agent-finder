"""Architectural rules that must hold for the life of the project."""

from __future__ import annotations

import ast
import pathlib

APP = pathlib.Path(__file__).resolve().parents[1] / "app"

FORBIDDEN_IN_DOMAIN = (
    "sqlalchemy",
    "asyncpg",
    "httpx",
    "fastapi",
    "supabase",
    "requests",
    "app.db",
    "app.api",
    "app.services",
    "app.integrations",
)
FORBIDDEN_PUBLIC_FIELD_FRAGMENTS = ("category", "threshold", "capacity", "balance")


def _imports(path: pathlib.Path) -> set[str]:
    tree = ast.parse(path.read_text())
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.update(a.name for a in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module)
    return names


def test_domain_layer_performs_no_io():
    for path in (APP / "domain").glob("*.py"):
        for name in _imports(path):
            assert not name.startswith(FORBIDDEN_IN_DOMAIN), f"{path.name} imports {name}"


def test_public_schemas_never_import_internal():
    for path in (APP / "schemas" / "public").glob("*.py"):
        for name in _imports(path):
            assert not name.startswith("app.schemas.internal"), f"{path.name} imports {name}"


def test_public_schemas_carry_no_private_fields():
    for path in (APP / "schemas" / "public").glob("*.py"):
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
                field = node.target.id.lower()
                for frag in FORBIDDEN_PUBLIC_FIELD_FRAGMENTS:
                    assert frag not in field, f"public field '{field}' in {path.name} looks private"
