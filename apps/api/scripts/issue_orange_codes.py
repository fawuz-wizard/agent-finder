"""Issue a one-time sign-in code to every aggregator that came from Orange's file and has not
chosen a PIN yet, and print one line per aggregator: name, sign-in number, code.

The account names of these aggregators are their phone lines (agg-<digits>), so they are never
typed on a command line (AWS keeps command arguments). The output is meant to be stored
encrypted and read once into a private file, never shown in a chat. Each person signs in to
the Agent App with their number and the code, then chooses their own PIN; the code then stops
working.

Usage: python -m scripts.issue_orange_codes
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from app.core.auth import hash_pin, new_code
from app.core.limits import clear_sign_in_failures
from app.db.models import Dealer, Session
from app.db.session import get_session_factory
from sqlalchemy import select, update


def local_number(msisdn: str | None) -> str:
    """'+23276123456' → '076 123 456', as people type it on the sign-in screen."""
    digits = "".join(c for c in (msisdn or "") if c.isdigit())
    if digits.startswith("232"):
        digits = digits[3:]
    digits = "0" + digits if len(digits) == 8 else digits
    return f"{digits[:3]} {digits[3:6]} {digits[6:]}" if len(digits) == 9 else digits


async def issue() -> list[tuple[str, str, str]]:
    out: list[tuple[str, str, str]] = []
    async with get_session_factory()() as db:
        dealers = (
            (
                await db.execute(
                    select(Dealer)
                    .where(Dealer.source == "orange_file", Dealer.must_set_pin.is_(True))
                    .order_by(Dealer.name)
                )
            )
            .scalars()
            .all()
        )
        for d in dealers:
            if "VIEW_NATIONAL" in (d.permissions or "").split(","):
                continue
            code = new_code()
            d.pin_hash = hash_pin(code, d.id)
            d.code_issued_at = datetime.now(UTC)
            await db.execute(
                update(Session)
                .where(Session.role == "dealer", Session.subject == d.id)
                .values(revoked=True)
            )
            out.append((d.name, local_number(d.msisdn), f"{code[:3]} {code[3:]}"))
        await db.commit()
        for d in dealers:
            await clear_sign_in_failures(db, f"sign-in:dealer:{d.id}")
    return out


def main() -> None:
    rows = asyncio.run(issue())
    if not rows:
        print("No Orange aggregator is waiting for a code.")
        return
    for name, number, code in rows:
        print(f"{name} | sign in with {number} | one-time code {code}")
    print("Each code works once; the aggregator then chooses their own PIN.")


if __name__ == "__main__":
    main()
