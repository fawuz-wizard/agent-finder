"""Import Orange's aggregator/agent file (meeting of 29 September 2026, steps 3–5).

    python -m scripts.import_orange ~/Downloads/Book2.xlsx            # validate and report only
    python -m scripts.import_orange ~/Downloads/Book2.xlsx --apply    # also write to the database

The same cleaning as the Global Report upload in the national console: the code lives in
app/services/orange_report.py. Run it with the server's PIN_PEPPER, or the PINs it sets for new
accounts will not match.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import sys
from pathlib import Path

from app.db.session import get_session_factory
from app.services import orange_report
from app.services.orange_report import (  # noqa: F401  (the tests and the cleaning sheet use these)
    RowResult,
    once,
    read_csv,
    read_table,
    read_xlsx,
    region_for,
    report,
    validate,
)


async def apply(results: list[RowResult]) -> dict:
    async with get_session_factory()() as db:
        return await orange_report.apply(db, results)


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 2
    path = Path(argv[0]).expanduser()
    do_apply = "--apply" in argv
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    rows = read_table(path)
    results = validate(rows, digest[:12])
    rep = report(results)
    rep["file_sha256"] = digest
    print(json.dumps({k: v for k, v in rep.items() if k != "rows_with_issues"}, indent=2))
    print(f"{len(rep['rows_with_issues'])} rows with issues (row numbers and codes only):")
    for item in rep["rows_with_issues"]:
        flag = "import" if item["importable"] else "HOLD  "
        print(f"  row {item['row']:4d} {item['kind']:14s} {flag} {', '.join(item['issues'])}")
    if do_apply:
        created = asyncio.run(apply(results))
        print("applied:", json.dumps(created))
    else:
        print("dry run — add --apply to write to the database")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
