"""Load a week of dummy pilot transactions for agents already on the map, or take them away.

    python -m scripts.load_pilot_week pilot_week.csv            # dry run: counts only
    python -m scripts.load_pilot_week pilot_week.csv --apply    # write them
    python -m scripts.load_pilot_week pilot_week.csv --apply --keep-dates
    python -m scripts.load_pilot_week --remove [--apply]        # take every pilot row away

The file: one row per agent and day, `date,agent_code,cash_in,cash_out` (SLE), no names or
numbers. Each agent-day becomes a handful of cash-in and cash-out transactions inside shop hours
that add up to the day's figures, so the 7-day rule (active days, sizes done) reads them as it
reads what agents record. Stored with source "pilot", so --remove takes away exactly these.

Only agents already on record are touched, matched by their Orange agent code; a code nobody
holds is skipped and counted, never created. Nothing else about an agent changes: not its
verification, address, place on the map or aggregator.

The 7-day rule counts the last seven days up to now, so by default the week is moved to end
yesterday, whenever this runs. --keep-dates keeps the file's own dates. Running it again
replaces the earlier pilot rows for the same agents and days, never doubling them.
Prints counts only, never names or codes.
"""

from __future__ import annotations

import asyncio
import csv
import random
import sys
from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path

from app.api.v1.agent_app import band_for_amount
from app.db.models import Agent, AgentTransaction
from app.db.session import get_session_factory
from sqlalchemy import delete, select

SOURCE = "pilot"
MAX_PER_SIDE = 12  # transactions an agent-day is split into, at most, per side
OPEN, CLOSE = 8, 19  # hours the generated transactions fall between (Freetown is UTC)


def read_week(path: Path) -> dict[date, dict[str, tuple[int, int]]]:
    """{day: {agent code: (cash in, cash out)}} in whole leones."""
    week: dict[date, dict[str, tuple[int, int]]] = defaultdict(dict)
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        need = {"date", "agent_code", "cash_in", "cash_out"}
        if not reader.fieldnames or not need <= set(reader.fieldnames):
            raise SystemExit(f"The file needs the columns: {', '.join(sorted(need))}")
        for n, row in enumerate(reader, start=2):
            try:
                day = date.fromisoformat(row["date"].strip())
                ci = round(float(row["cash_in"] or 0))
                co = round(float(row["cash_out"] or 0))
            except ValueError:
                raise SystemExit(f"Row {n}: the date or an amount is not readable") from None
            if ci < 0 or co < 0:
                raise SystemExit(f"Row {n}: an amount is below zero")
            week[day][row["agent_code"].strip()] = (ci, co)
    if not week:
        raise SystemExit("The file has no rows")
    return dict(week)


def split(total: int, rng: random.Random) -> list[int]:
    """A day's total as a few transaction amounts that add up to it exactly."""
    if total <= 0:
        return []
    typical = rng.choice((300, 500, 800, 1_500, 3_000))
    n = max(1, min(MAX_PER_SIDE, round(total / typical), total))
    cuts = sorted(rng.sample(range(1, total), n - 1)) if n > 1 else []
    edges = [0, *cuts, total]
    return [b - a for a, b in zip(edges, edges[1:], strict=False)]


def build(
    week: dict[date, dict[str, tuple[int, int]]], refs: dict[str, str], shift: timedelta
) -> list[AgentTransaction]:
    rows: list[AgentTransaction] = []
    for day, figures in sorted(week.items()):
        when = day + shift
        for code, (ci, co) in sorted(figures.items()):
            ref = refs.get(code)
            if ref is None:
                continue
            # The same file always gives the same transactions: seeded on the agent and day.
            rng = random.Random(f"{code}:{day.isoformat()}")
            for side, total in (("deposit", ci), ("cash_out", co)):
                for i, amount in enumerate(split(total, rng)):
                    minute = rng.randrange(OPEN * 60, CLOSE * 60)
                    at = datetime.combine(when, time(minute // 60, minute % 60), UTC)
                    rows.append(
                        AgentTransaction(
                            id=f"{SOURCE}-{code}-{when.isoformat()}-{side}-{i}",
                            agent_ref=ref,
                            at=at,
                            transaction=side,
                            amount_band=band_for_amount(amount),
                            amount_sle=amount,
                            source=SOURCE,
                        )
                    )
    return rows


async def load(path: Path, apply: bool, keep_dates: bool, today: date | None = None) -> dict:
    week = read_week(path)
    today = today or datetime.now(UTC).date()
    shift = timedelta(0) if keep_dates else (today - timedelta(days=1)) - max(week)
    codes = {c for figures in week.values() for c in figures}
    async with get_session_factory()() as db:
        found = (
            await db.execute(select(Agent.agent_code, Agent.ref).where(Agent.agent_code.in_(codes)))
        ).all()
        refs = {code: ref for code, ref in found}
        rows = build(week, refs, shift)
        first, last = min(week) + shift, max(week) + shift
        out = {
            "days": len(week),
            "from": first.isoformat(),
            "to": last.isoformat(),
            "agents_in_file": len(codes),
            "agents_on_record": len(refs),
            "agents_skipped_not_on_record": len(codes - set(refs)),
            "transactions": len(rows),
            "applied": False,
        }
        if apply and rows:
            start = datetime.combine(first, time.min, UTC)
            end = datetime.combine(last + timedelta(days=1), time.min, UTC)
            await db.execute(
                delete(AgentTransaction).where(
                    AgentTransaction.source == SOURCE,
                    AgentTransaction.agent_ref.in_(set(refs.values())),
                    AgentTransaction.at >= start,
                    AgentTransaction.at < end,
                )
            )
            db.add_all(rows)
            await db.commit()
            out["applied"] = True
    return out


async def remove(apply: bool) -> dict:
    async with get_session_factory()() as db:
        n = len(
            (
                await db.execute(
                    select(AgentTransaction.id).where(AgentTransaction.source == SOURCE)
                )
            ).all()
        )
        if apply and n:
            await db.execute(delete(AgentTransaction).where(AgentTransaction.source == SOURCE))
            await db.commit()
    return {"pilot_transactions": n, "removed": bool(apply and n)}


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 2
    apply = "--apply" in argv
    if "--remove" in argv:
        out = asyncio.run(remove(apply))
    else:
        out = asyncio.run(load(Path(argv[0]).expanduser(), apply, "--keep-dates" in argv))
    for k, v in out.items():
        print(f"{k}: {v}")
    if not apply:
        print("Dry run: nothing written. Add --apply to write.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
