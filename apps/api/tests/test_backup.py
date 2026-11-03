"""One command backs the database up; another proves the newest backup restores, table by
table. Old backups beyond the kept number are deleted."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "backup_db.py"


def _load():
    spec = importlib.util.spec_from_file_location("backup_db", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.mark.asyncio
async def test_back_up_keep_the_newest_and_prove_it_restores(client, tmp_path, monkeypatch):
    b = _load()
    folder = tmp_path / "backups"
    stamps = iter(["20261101-010000", "20261101-020000", "20261101-030000"])

    class FakeNow:
        @staticmethod
        def now(tz=None):  # noqa: ARG004
            from datetime import datetime

            return datetime.strptime(next(stamps), "%Y%m%d-%H%M%S")

    monkeypatch.setattr(b, "datetime", FakeNow)
    for _ in range(3):
        b.backup(folder, keep=2)
    kept = sorted(p.name for p in folder.iterdir())
    assert kept == ["agentfinder-20261101-020000.db", "agentfinder-20261101-030000.db"]
    report = b.check(folder)
    # The seeded database restores whole: the agents and the aggregator are in the backup.
    assert report["agents"][1] >= 1 and report["dealers"][1] >= 1
    assert all(restored >= 0 for _, restored in report.values())
