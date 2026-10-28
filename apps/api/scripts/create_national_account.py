"""Create (or reset) an Orange national account and print its one-time sign-in code once.
The account sees every agent on the national map and in its counts and changes nothing:
permissions VIEW_AGENT and VIEW_NATIONAL only, no region, no agents of its own. The person
signs in with the code and chooses their own PIN.

Usage: python -m scripts.create_national_account orange-sales "Orange Sierra Leone, Sales"
"""

from __future__ import annotations

import asyncio
import sys

from app.core.auth import hash_pin, new_code
from app.db.models import Dealer, Session
from app.db.session import get_session_factory
from sqlalchemy import select

NATIONAL_PERMS = "VIEW_AGENT,VIEW_NATIONAL"


async def main(account_id: str, name: str) -> None:
    code = new_code()
    async with get_session_factory()() as db:
        d = await db.get(Dealer, account_id)
        if d is None:
            d = Dealer(id=account_id, name=name, pin_hash="", permissions=NATIONAL_PERMS)
            db.add(d)
        elif d.permissions != NATIONAL_PERMS:
            raise SystemExit(f"{account_id!r} is an aggregator account; choose another id")
        d.name = name
        d.pin_hash = hash_pin(code, account_id)
        d.must_set_pin = True
        for s in (
            await db.execute(
                select(Session).where(Session.role == "dealer", Session.subject == account_id)
            )
        ).scalars():
            s.revoked = True
        await db.commit()
    print(f"National account {account_id} ({name}). One-time code: {code[:3]} {code[3:]}")
    print("Read it out in person. It works once; the person then chooses their own PIN.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    asyncio.run(main(sys.argv[1].strip().lower(), sys.argv[2].strip()))
