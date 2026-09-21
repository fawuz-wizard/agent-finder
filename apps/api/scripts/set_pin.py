"""Set a real PIN for an agent or the dealer before the pilot.
Usage: python scripts/set_pin.py "Agent 024" 4821   |   python scripts/set_pin.py kissy 9090"""

from __future__ import annotations

import asyncio
import sys

from app.core.auth import hash_pin
from app.db.models import Agent, Dealer
from app.db.session import get_session_factory
from sqlalchemy import select


async def main(subject: str, pin: str) -> None:
    if not pin.isdigit() or not 4 <= len(pin) <= 6:
        raise SystemExit("PIN must be 4–6 digits")
    async with get_session_factory()() as db:
        d = await db.get(Dealer, subject)
        if d:
            d.pin_hash = hash_pin(pin, d.id)
        else:
            a = (await db.execute(select(Agent).where(Agent.ref == subject))).scalar_one_or_none()
            if a is None:
                raise SystemExit(f"no agent or dealer called {subject!r}")
            a.pin_hash = hash_pin(pin, a.ref)
        await db.commit()
    print(f"PIN set for {subject}")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2]))
