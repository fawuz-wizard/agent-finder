"""The pilot team's view of the 7-day rule at work. Run on the API host:

    python -m scripts.export_week_rule --since 2026-11-03 --out week-rule.csv

One row per agent shown in a search under the 7-day rule: what each of the three checks gave,
the agent's own Low / None today, the percentage the customer read, and, once the customer
reported the visit, whether they were served. Below it on the screen, the same visits grouped
by the percentage shown: do agents shown at 80% really serve more customers than agents shown
at 40%? If not, the numbers in services/week_rule.py need changing.

For the team only. Agents and aggregators never see the percentage or the points, so this is
a script on the server, not a screen or an API route. It carries no customer key, no position
and no money figure: the agent, the request type and size, the points and the result."""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import sys
from datetime import UTC, datetime

from app.db.models import SearchImpression
from app.db.session import get_session_factory
from app.services.csv_safe import safe_text
from sqlalchemy import select

COLUMNS = (
    "searched_at",
    "agent",
    "customer_asked",
    "amount_size",
    "days_worked",
    "check1_active_points",
    "check2_size_points",
    "check3_customer_points",
    "low_today_on_this_side",
    "percentage_shown",
    "shown_as",
    "visit_result",
)
TX_WORDS = {"cash_out": "Cash out", "withdraw": "Cash out", "deposit": "Cash in", "send": "Send"}
BUCKETS = ((0, 34, "5-34%"), (35, 49, "35-49%"), (50, 69, "50-69%"), (70, 95, "70-95%"))


def row_from(i: SearchImpression) -> dict | None:
    """The three checks as points again, from the facts the search logged. None for rows the
    older activity ranker wrote: they hold no 7-day facts."""
    f = json.loads(i.features_json)
    if "days_worked" not in f:
        return None
    size = f.get("size_done", 0.0)
    known = f.get("reports_known", 0.0) >= 1.0
    return {
        "searched_at": i.at.astimezone(UTC).strftime("%Y-%m-%d %H:%M"),
        "agent": i.agent_ref,
        "customer_asked": TX_WORDS.get(i.transaction, i.transaction),
        "amount_size": i.amount_band or "any",
        "days_worked": round(f["days_worked"] * 7),
        "check1_active_points": round(40 * f["days_worked"], 1),
        "check2_size_points": 35 if size >= 1 else 15 if size > 0 else 0,
        "check3_customer_points": round(20 * f.get("report_balance", 0.0), 1) if known else 0,
        "low_today_on_this_side": "yes" if f.get("low_today", 0.0) >= 1.0 else "no",
        "percentage_shown": int(f["rule_pct"]) if "rule_pct" in f else "",
        "shown_as": i.outcome_shown,
        "visit_result": {1: "served", 0: "not served"}.get(i.label, "no report"),
    }


def calibration(rows: list[dict]) -> list[tuple[str, int, int, str]]:
    """Per band of percentage shown: reported visits, served, and the share served."""
    out = []
    for lo, hi, name in BUCKETS:
        seen = [
            r
            for r in rows
            if r["percentage_shown"] != ""
            and lo <= r["percentage_shown"] <= hi
            and r["visit_result"] != "no report"
        ]
        served = sum(1 for r in seen if r["visit_result"] == "served")
        share = f"{round(100 * served / len(seen))}%" if seen else "-"
        out.append((name, len(seen), served, share))
    return out


async def collect(since: datetime) -> list[dict]:
    async with get_session_factory()() as db:
        found = (
            (
                await db.execute(
                    select(SearchImpression)
                    .where(SearchImpression.at >= since)
                    .order_by(SearchImpression.at, SearchImpression.id)
                )
            )
            .scalars()
            .all()
        )
    return [r for r in (row_from(i) for i in found) if r is not None]


def write(rows: list[dict], out) -> None:
    w = csv.DictWriter(out, fieldnames=COLUMNS)
    w.writeheader()
    for r in rows:
        w.writerow({k: safe_text(v) for k, v in r.items()})


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--since", required=True, help="first day, YYYY-MM-DD (UTC)")
    ap.add_argument("--out", help="CSV file to write; the screen if left out")
    args = ap.parse_args()
    since = datetime.strptime(args.since, "%Y-%m-%d").replace(tzinfo=UTC)
    rows = asyncio.run(collect(since))
    if args.out:
        with open(args.out, "w", newline="", encoding="utf-8") as fh:
            write(rows, fh)
    else:
        write(rows, sys.stdout)
    print(f"\n{len(rows)} agents shown since {args.since}.", file=sys.stderr)
    print("Shown at      Visits reported  Served  Share served", file=sys.stderr)
    for name, n, served, share in calibration(rows):
        print(f"{name:<14}{n:>15}{served:>8}{share:>14}", file=sys.stderr)


if __name__ == "__main__":
    main()
