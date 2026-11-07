"""Back up the database to a dated, encrypted file, copy it to a second place, keep the last
14, and prove the newest one restores.

    python -m scripts.backup_db backup --dir /var/backups/agentfinder \
        [--encrypt-to KEY] [--copy-to s3://bucket/path | /other/disk] [--keep 14]
    python -m scripts.backup_db check  --dir /var/backups/agentfinder

On AWS the managed database's own backups (encrypted, point-in-time, copied to a second
region) are the first line; this script is the second, provider-independent copy, and the one
a laptop or a single server uses.

backup: SQLite is copied with SQLite's own online backup (safe while the API runs); PostgreSQL
is dumped with pg_dump (custom format). Next to each backup a small manifest records how many
rows every table held. With --encrypt-to (or BACKUP_GPG_RECIPIENT) the file is encrypted with
GnuPG to that public key and the plain copy removed: the server never holds the key that opens
it. With --copy-to (or BACKUP_COPY_TO) it is also copied to a second place. On a live server
(APP_ENV staging or production) both are required.

check: restores the newest backup into a scratch database (a temporary SQLite file, or for
PostgreSQL the empty database named by RESTORE_CHECK_URL, which must not be the live one) and
fails if any table is missing or holds fewer rows than the manifest says. An encrypted backup
is opened with the private key, so check runs where that key is kept, not on the server.
A backup nobody has restored is a hope, not a backup.

Passwords never appear on a command line (other users of the machine can read those): libpq
reads them from PGPASSWORD.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from app.core.settings import get_settings

REPO = Path(__file__).resolve().parents[3]
# Rows that come and go on their own (the limits' counters are pruned every few minutes): a
# restore may hold fewer of them than the manifest without anything being lost.
VOLATILE = {"rate_events"}
# Left in the scratch database after a check, so the next check knows it may overwrite it.
MARKER = "restore_check_marker"


def _sqlite_path(url: str) -> Path:
    return Path(url.split("///", 1)[1])


def _pg_parts(url: str) -> tuple[list[str], dict[str, str], tuple]:
    """libpq arguments without the password, the environment carrying it (decoded: a
    generated password arrives URL-encoded) and the URL's sslmode, and an identity
    (host, port, database) to tell two databases apart."""
    u = urlparse(url.replace("postgresql+asyncpg://", "postgresql://"))
    host, port, name = u.hostname or "localhost", u.port or 5432, unquote(u.path.lstrip("/"))
    args = [f"--host={host}", f"--port={port}", f"--dbname={name}"]
    if u.username:
        args.append(f"--username={unquote(u.username)}")
    env = {**os.environ, "PGPASSWORD": unquote(u.password or "")}
    query = parse_qs(u.query)
    if "sslmode" in query or "ssl" in query:
        env["PGSSLMODE"] = (query.get("sslmode") or query.get("ssl"))[0]
    return args, env, (host, port, name)


def _run(cmd: list[str], env: dict[str, str] | None = None) -> str:
    """A tool run without echoing its arguments or environment on failure."""
    done = subprocess.run(cmd, env=env, capture_output=True, text=True)
    if done.returncode != 0:
        tail = (done.stderr or "").strip().splitlines()[-1:] or ["no message"]
        raise SystemExit(f"{cmd[0]} failed: {tail[0]}")
    return done.stdout


def _live() -> bool:
    return get_settings().app_env in ("staging", "production")


def _counts_sqlite(path: Path) -> dict[str, int]:
    with closing(sqlite3.connect(path)) as db:
        names = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")]
        return {n: db.execute(f'SELECT COUNT(*) FROM "{n}"').fetchone()[0] for n in names}


def _counts_pg(args: list[str], env: dict[str, str]) -> dict[str, int]:
    """Exact row counts (count(*), not the planner's estimate) for every table."""
    sql = (
        "SELECT table_name, (xpath('/row/c/text()', query_to_xml("
        "format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')"
        "))[1]::text::bigint FROM information_schema.tables "
        "WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
    )
    out = _run(["psql", *args, "-At", "-F", "\t", "-c", sql], env)
    return {a: int(b) for a, b in (line.split("\t") for line in out.splitlines() if line)}


def _outside_repo(folder: Path) -> Path:
    folder = folder.expanduser().resolve()
    if folder == REPO or REPO in folder.parents:
        raise SystemExit(
            f"Keep backups outside the repository (not under {REPO}): they hold real data."
        )
    return folder


def backup(
    folder: Path, keep: int, recipient: str | None = None, copy_to: str | None = None
) -> Path:
    url = get_settings().database_url
    recipient = recipient or os.environ.get("BACKUP_GPG_RECIPIENT") or None
    copy_to = copy_to or os.environ.get("BACKUP_COPY_TO") or None
    if _live() and not (recipient and copy_to):
        raise SystemExit(
            "On a live server a backup must be encrypted and copied to a second place: "
            "set --encrypt-to (BACKUP_GPG_RECIPIENT) and --copy-to (BACKUP_COPY_TO)."
        )
    folder = _outside_repo(folder)
    os.umask(0o077)  # backups are created readable by this user only, from the first byte
    folder.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    if url.startswith("sqlite"):
        out = folder / f"agentfinder-{stamp}.db"
        src, dst = sqlite3.connect(_sqlite_path(url)), sqlite3.connect(out)
        try:
            src.backup(dst)
            # One self-contained file: no write-ahead log beside it to be left behind.
            dst.execute("PRAGMA journal_mode=DELETE")
        finally:
            dst.close()
            src.close()
        counts = _counts_sqlite(out)  # exactly what the file holds
    else:
        out = folder / f"agentfinder-{stamp}.dump"
        args, env, _ = _pg_parts(url)
        counts = _counts_pg(args, env)  # just before the dump; later rows only add
        _run(["pg_dump", "--format=custom", f"--file={out}", *args], env)
    os.chmod(out, 0o600)
    if recipient:
        sealed = out.with_name(out.name + ".gpg")
        _run(
            [
                "gpg", "--batch", "--yes", "--trust-model", "always",
                "--recipient", recipient, "--output", str(sealed), "--encrypt", str(out),
            ]
        )  # fmt: skip
        out.unlink()
        out = sealed
    manifest = out.with_name(f"agentfinder-{stamp}.manifest.json")
    manifest.write_text(json.dumps({"file": out.name, "tables": counts}, indent=1))
    if copy_to:
        _copy(out, copy_to)
        _copy(manifest, copy_to)
    _rotate(folder, keep)
    return out


def _copy(path: Path, dest: str) -> None:
    if dest.startswith("s3://"):
        _run(["aws", "s3", "cp", str(path), dest.rstrip("/") + "/" + path.name, "--sse", "aws:kms"])
    else:
        target = Path(dest).expanduser().resolve()
        target.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target / path.name)


def _stamp(path: Path) -> str:
    return path.name.split("-", 1)[1][:15]


def _rotate(folder: Path, keep: int) -> None:
    stamps = sorted({_stamp(p) for p in folder.glob("agentfinder-*")})
    for old in stamps[:-keep]:
        for p in folder.glob(f"agentfinder-{old}*"):
            p.unlink()


def _newest(folder: Path) -> tuple[Path, dict[str, int]]:
    manifests = sorted(folder.glob("agentfinder-*.manifest.json"))
    if not manifests:
        raise SystemExit(f"No backup with a manifest in {folder}.")
    m = json.loads(manifests[-1].read_text())
    return folder / m["file"], m["tables"]


def check(folder: Path) -> dict[str, tuple[int, int]]:
    """Restore the newest backup and return {table: (rows in the manifest, rows restored)};
    stops with an error on a table missing or short in the restore."""
    newest, expected = _newest(folder.expanduser().resolve())
    with tempfile.TemporaryDirectory() as tmp:
        plain = newest
        if newest.suffix == ".gpg":
            plain = Path(tmp) / newest.stem
            _run(["gpg", "--batch", "--yes", "--output", str(plain), "--decrypt", str(newest)])
        if plain.suffix == ".db":
            scratch = Path(tmp) / "restore.db"
            shutil.copy(plain, scratch)
            restored = _counts_sqlite(scratch)
        else:
            target = os.environ.get("RESTORE_CHECK_URL")
            if not target:
                raise SystemExit("Set RESTORE_CHECK_URL to an empty scratch PostgreSQL database.")
            t_args, t_env, _ = _pg_parts(target)
            # Whatever its name or address, only an empty database, or one this check restored
            # into before (it carries the marker table), may be overwritten by --clean.
            tables = _run(
                [
                    "psql", *t_args, "-At", "-c",
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema = 'public' AND table_name <> 'spatial_ref_sys'",
                ],
                t_env,
            ).split()  # fmt: skip
            if tables and MARKER not in tables:
                raise SystemExit(
                    "RESTORE_CHECK_URL already holds data and is not a restore-check database. "
                    "Point it at an empty scratch database, never the live one."
                )
            _run(["pg_restore", "--clean", "--if-exists", "--no-owner", *t_args, str(plain)], t_env)
            restored = _counts_pg(t_args, t_env)
            restored.pop(MARKER, None)
            _run(["psql", *t_args, "-c", f"CREATE TABLE IF NOT EXISTS {MARKER} ()"], t_env)
    report = {t: (n, restored.get(t, -1)) for t, n in expected.items()}
    missing = sorted(t for t, (_, got) in report.items() if got < 0)
    short = sorted(t for t, (want, got) in report.items() if 0 <= got < want and t not in VOLATILE)
    if missing or short:
        raise SystemExit(
            f"Restore check FAILED for {newest.name}: "
            f"missing tables {missing}, short tables {short}"
        )
    return report


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("action", choices=["backup", "check"])
    p.add_argument("--dir", required=True, help="a folder outside the repository")
    p.add_argument("--keep", type=int, default=14)
    p.add_argument("--encrypt-to", help="GnuPG key (id or email) to encrypt to")
    p.add_argument("--copy-to", help="second place: s3://bucket/prefix or a folder")
    args = p.parse_args()
    folder = Path(args.dir)
    if args.action == "backup":
        print(f"Backed up to {backup(folder, args.keep, args.encrypt_to, args.copy_to)}")
    else:
        report = check(folder)
        print(f"Restore check OK: {len(report)} tables restored")
        for table, (want, got) in sorted(report.items()):
            print(f"  {table}: {got} restored, {want} in the manifest")


if __name__ == "__main__":
    sys.exit(main())
