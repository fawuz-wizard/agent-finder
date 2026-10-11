"""Issue a one-time sign-in code for an agent or an aggregator, and print it once.
The person signs in with the code and chooses their own PIN; the code then stops working.
Usage: python scripts/issue_code.py "Agent 024"   |   python scripts/issue_code.py kissy"""

from __future__ import annotations

import asyncio
import sys

from app.core.auth import hash_pin, new_code
from app.db.models import Agent, Dealer, Session
from app.db.session import get_session_factory
from sqlalchemy import select


async def main(subject: str) -> None:
    code = new_code()
    async with get_session_factory()() as db:
        d = await db.get(Dealer, subject)
        if d:
            d.pin_hash = hash_pin(code, d.id)
            d.must_set_pin = True
            role, who = "dealer", d.id
        else:
            a = (await db.execute(select(Agent).where(Agent.ref == subject))).scalar_one_or_none()
            if a is None:
                raise SystemExit(f"no agent or dealer called {subject!r}")
            a.pin_hash = hash_pin(code, a.ref)
            a.must_set_pin = True
            role, who = "agent", a.ref
        for s in (
            await db.execute(select(Session).where(Session.role == role, Session.subject == who))
        ).scalars():
            s.revoked = True
        await db.commit()
    print(f"One-time code for {subject}: {code[:3]} {code[3:]}")
    print("Read it out in person. It works once; the person then chooses their own PIN.")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1]))
