"""Bring a development SQLite database up to the current models by adding the columns they
declare and the database lacks. Tables are created by the app on startup; columns are not.
Usage: python -m scripts.add_missing_columns [path/to/agentfinder.db]"""

from __future__ import annotations

import sqlite3
import sys

from app.db import models  # noqa: F401  (registers the tables on Base)
from app.db.base import Base
from sqlalchemy.dialects import sqlite


def main(path: str) -> int:
    con = sqlite3.connect(path)
    added = 0
    for table in Base.metadata.sorted_tables:
        have = {row[1] for row in con.execute(f'pragma table_info("{table.name}")')}
        if not have:
            continue  # the app creates missing tables itself
        for col in table.columns:
            if col.name in have:
                continue
            kind = col.type.compile(dialect=sqlite.dialect())
            default = ""
            if (
                col.default is not None
                and getattr(col.default, "arg", None) is not None
                and not callable(col.default.arg)
            ):
                v = col.default.arg
                default = f" DEFAULT {int(v) if isinstance(v, bool) else repr(v)}"
            con.execute(f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {kind}{default}')
            print(f"added {table.name}.{col.name} {kind}{default}")
            added += 1
    con.commit()
    con.close()
    print(f"{added} column(s) added")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1] if len(sys.argv) > 1 else "agentfinder.db"))
