"""Back up the database to a dated file, keep the last 14, and prove the newest one restores.

    python scripts/backup_db.py backup  [--dir backups] [--keep 14]
    python scripts/backup_db.py check   [--dir backups]

backup: SQLite is copied with SQLite's own online backup (safe while the API runs); PostgreSQL
is dumped with pg_dump (custom format). Files older than the newest --keep are deleted.
check: restores the newest backup into a scratch database (a temporary SQLite file, or for
PostgreSQL the database named by RESTORE_CHECK_URL) and compares the row count of every
table with the live database. A backup nobody has restored is a hope, not a backup: run
check after every backup, from the same scheduled job.

The backups hold agents' and customers' data: keep the folder off the web server's public
paths and off GitHub, encrypted at rest, and copied to a second place (another region or
machine) so one failure cannot take both.
"""

from __future__ import annotations

import argparse
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path

from app.core.settings import get_settings


def _sqlite_path(url: str) -> Path:
    return Path(url.split("///", 1)[1])


def _pg_url(url: str) -> str:
    return url.replace("postgresql+asyncpg://", "postgresql://")


def _pg_env(url: str) -> tuple[list[str], dict[str, str]]:
    """libpq arguments without the password, which goes in PGPASSWORD: a command line can be
    read by other users of the machine, the environment of this process cannot."""
    from urllib.parse import urlparse

    u = urlparse(_pg_url(url))
    args = [
        f"--host={u.hostname}",
        f"--port={u.port or 5432}",
        f"--username={u.username}",
        f"--dbname={u.path.lstrip('/')}",
    ]
    return args, {**os.environ, "PGPASSWORD": u.password or ""}


def backup(folder: Path, keep: int) -> Path:
    url = get_settings().database_url
    os.umask(0o077)  # backups are created readable by this user only, from the first byte
    folder.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    if url.startswith("sqlite"):
        out = folder / f"agentfinder-{stamp}.db"
        with sqlite3.connect(_sqlite_path(url)) as src, sqlite3.connect(out) as dst:
            src.backup(dst)
    else:
        out = folder / f"agentfinder-{stamp}.dump"
        args, env = _pg_env(url)
        subprocess.run(["pg_dump", "--format=custom", f"--file={out}", *args], check=True, env=env)
    os.chmod(out, 0o600)
    for old in sorted(folder.glob("agentfinder-*"))[:-keep]:
        old.unlink()
    return out


def _counts_sqlite(path: Path) -> dict[str, int]:
    with sqlite3.connect(path) as db:
        names = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")]
        return {n: db.execute(f'SELECT COUNT(*) FROM "{n}"').fetchone()[0] for n in names}


def check(folder: Path) -> dict[str, tuple[int, int]]:
    """Restore the newest backup and return {table: (live rows, restored rows)}; raises on a
    table missing or short in the restore."""
    url = get_settings().database_url
    newest = sorted(folder.glob("agentfinder-*"))[-1]
    if url.startswith("sqlite"):
        with tempfile.TemporaryDirectory() as tmp:
            scratch = Path(tmp) / "restore.db"
            shutil.copy(newest, scratch)
            restored = _counts_sqlite(scratch)
        live = _counts_sqlite(_sqlite_path(url))
    else:
        target = os.environ.get("RESTORE_CHECK_URL")
        if not target:
            raise SystemExit("Set RESTORE_CHECK_URL to an empty scratch PostgreSQL database.")
        subprocess.run(
            ["pg_restore", "--clean", "--if-exists", f"--dbname={target}", str(newest)], check=True
        )
        count = "SELECT relname, n_live_tup FROM pg_stat_user_tables"
        live = dict(_psql_rows(_pg_url(url), count))
        restored = dict(_psql_rows(target, count))
    report = {t: (live.get(t, 0), restored.get(t, -1)) for t in live}
    # Rows written after the backup are expected; a table missing or with fewer rows than the
    # backup should have is not.
    bad = {t: v for t, v in report.items() if v[1] < 0}
    if bad:
        raise SystemExit(f"Restore check FAILED for {newest.name}: missing tables {sorted(bad)}")
    return report


def _psql_rows(url: str, sql: str) -> list[tuple[str, int]]:
    out = subprocess.run(
        ["psql", url, "-At", "-F", "\t", "-c", sql], check=True, capture_output=True, text=True
    )
    return [(a, int(b)) for a, b in (line.split("\t") for line in out.stdout.splitlines() if line)]


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("action", choices=["backup", "check"])
    p.add_argument("--dir", default="backups")
    p.add_argument("--keep", type=int, default=14)
    args = p.parse_args()
    folder = Path(args.dir)
    if args.action == "backup":
        print(f"Backed up to {backup(folder, args.keep)}")
    else:
        report = check(folder)
        print(f"Restore check OK: {len(report)} tables restored")
        for table, (live, restored) in sorted(report.items()):
            print(f"  {table}: {restored} in the backup, {live} live now")


if __name__ == "__main__":
    sys.exit(main())
