"""A worksheet for the team to clean Orange's file by hand: one line per thing to fix, with
the row, the field, the value as it is, and what to do. Written next to the file, never into
the repository; it carries the file's own values, so treat it as the file itself.

Usage:
  python -m scripts.orange_cleaning_sheet ~/Downloads/Book2.xlsx \\
      ~/Downloads/orange-cleaning-sheet.csv
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

from scripts.import_orange import read_xlsx, validate

WHAT: dict[str, tuple[str, str]] = {
    "repeated_header": ("whole row", "Delete this row: it repeats the column headings."),
    "unknown_category": (
        "USER_CATEGORY_CODE",
        "Should be AGNT (agent) or SUBAGG (sub-aggregator).",
    ),
    "no_aggregator": (
        "PARENT_USER_MSISDN",
        "Fill in the aggregator's Orange Money number.",
    ),
    "bad_msisdn": ("MSISDN", "An Orange Money number has 8 digits (076…, 077…, 078…, 079…)."),
    "duplicate_msisdn": ("MSISDN", "Another row has this number; one of the two is wrong."),
    "bad_agent_code": ("AGENT_CODE", "An agent code has 6 digits."),
    "duplicate_agent_code": ("AGENT_CODE", "Another row has this code; one of the two is wrong."),
    "no_city": ("CITY", "Fill in the town or city."),
    "region_unknown": (
        "CITY",
        "Add the district or town the app can place in East / North / West / South, e.g. 'Lungi, Port Loko'.",
    ),  # noqa: E501
    "no_name": ("USER_FIRST_NAME / USER_LAST_NAME", "Fill in the agent's name."),
    "name_has_digits": ("USER_FIRST_NAME / USER_LAST_NAME", "A name should not contain digits."),
    "bad_status": ("ACCOUNT_STATUS", "Y for active, N for inactive."),
    "no_address": (
        "ADDRESS1",
        "Fill in the street or landmark customers read under the shop name.",
    ),
    "address_is_city_only": (
        "ADDRESS1",
        "The address only repeats the city; add the street or landmark.",
    ),
    "short_address": ("ADDRESS1", "Too short to be a street or landmark; complete it."),
}


def main(src: str, dst: str) -> int:
    rows = read_xlsx(Path(src).expanduser())
    results = validate(rows, "sheet")
    n = 0
    with open(Path(dst).expanduser(), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            [
                "row",
                "kind",
                "agent_code",
                "msisdn",
                "name",
                "issue",
                "field",
                "value_now",
                "what_to_do",
            ]
        )
        for res, r in zip(results, rows, strict=True):
            for issue in res.issues:
                field, what = WHAT.get(issue, (issue, "Check this row."))
                value = ""
                for col in field.split(" / "):
                    value = r.get(col.strip(), "") if col != "whole row" else ""
                    if value:
                        break
                w.writerow(
                    [
                        res.row,
                        res.kind,
                        r.get("AGENT_CODE", ""),
                        r.get("MSISDN", ""),
                        (r.get("USER_FIRST_NAME", "") + " " + r.get("USER_LAST_NAME", "")).strip(),
                        issue,
                        field,
                        value,
                        what,
                    ]
                )
                n += 1
    print(f"{n} lines to check, written to {dst}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1], sys.argv[2]))
