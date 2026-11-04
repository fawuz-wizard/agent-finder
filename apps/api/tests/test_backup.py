"""One command backs the database up (encrypted, copied to a second place); another proves the
newest backup restores, table by table, against the rows the backup recorded. Old backups
beyond the kept number are deleted."""

from __future__ import annotations

import importlib.util
import shutil
import sqlite3
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "backup_db.py"


def _load():
    spec = importlib.util.spec_from_file_location("backup_db", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _fixed_stamps(b, monkeypatch, stamps: list[str]) -> None:
    it = iter(stamps)

    class FakeNow:
        @staticmethod
        def now(tz=None):  # noqa: ARG004
            from datetime import datetime

            return datetime.strptime(next(it), "%Y%m%d-%H%M%S")

    monkeypatch.setattr(b, "datetime", FakeNow)


@pytest.mark.asyncio
async def test_back_up_keep_the_newest_and_prove_it_restores(client, tmp_path, monkeypatch):
    b = _load()
    folder = tmp_path / "backups"
    second = tmp_path / "second-place"
    _fixed_stamps(b, monkeypatch, ["20261101-010000", "20261101-020000", "20261101-030000"])
    for _ in range(3):
        b.backup(folder, keep=2, copy_to=str(second))
    kept = sorted(p.name for p in folder.glob("*.db"))
    assert kept == ["agentfinder-20261101-020000.db", "agentfinder-20261101-030000.db"]
    assert len(list(folder.glob("*.manifest.json"))) == 2
    # The second place holds every copy made.
    assert (second / "agentfinder-20261101-030000.db").exists()
    report = b.check(folder)
    # The seeded database restores whole: the agents and the aggregator are in the backup.
    assert report["agents"][1] >= 1 and report["dealers"][1] >= 1
    assert all(got == want for want, got in report.values())


@pytest.mark.asyncio
async def test_a_restore_missing_rows_fails_the_check(client, tmp_path):
    b = _load()
    folder = tmp_path / "backups"
    out = b.backup(folder, keep=2)
    db = sqlite3.connect(out)
    db.execute("DELETE FROM agents")
    db.commit()
    db.close()
    with pytest.raises(SystemExit, match="short tables \\['agents'\\]"):
        b.check(folder)


@pytest.mark.asyncio
async def test_backups_stay_out_of_the_repository_and_live_ones_are_sealed(
    client, tmp_path, monkeypatch
):
    b = _load()
    with pytest.raises(SystemExit, match="outside the repository"):
        b.backup(b.REPO / "backups", keep=2)
    monkeypatch.setattr(b, "_live", lambda: True)
    with pytest.raises(SystemExit, match="encrypted and copied"):
        b.backup(tmp_path / "backups", keep=2)


@pytest.mark.asyncio
@pytest.mark.skipif(shutil.which("gpg") is None, reason="GnuPG is not installed")
async def test_an_encrypted_backup_leaves_no_plain_copy_and_restores_with_the_key(
    client, tmp_path, monkeypatch
):
    b = _load()
    home = tmp_path / "gnupg"
    home.mkdir(mode=0o700)
    monkeypatch.setenv("GNUPGHOME", str(home))
    subprocess.run(
        ["gpg", "--batch", "--passphrase", "", "--quick-gen-key", "backup-test@example.invalid",
         "default", "default", "never"],
        check=True, capture_output=True,
    )  # fmt: skip
    folder = tmp_path / "backups"
    out = b.backup(folder, keep=2, recipient="backup-test@example.invalid")
    assert out.suffix == ".gpg"
    assert not list(folder.glob("*.db"))  # no plain copy left behind
    assert b"SQLite format" not in out.read_bytes()[:64]
    report = b.check(folder)
    assert report["agents"][1] >= 1
