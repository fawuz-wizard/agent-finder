"""Create (or reset) an aggregator account and print its one-time sign-in code once.

For a real aggregator, or a test one to register agents with before Orange's data arrives. The
account gets the aggregator's full set of permissions (register and edit agents, float
requests, history, contact and escalate). It starts with no agents: the aggregator registers
them in the Agent App. The person signs in with their account name (or phone number) and the
code, then chooses their own PIN.

Usage:
  python -m scripts.create_aggregator test-agg "Mohira Test Aggregator" --region west \
      [--phone 076123456]

Regions: west, north, south, east. Re-running for the same account issues a new code and signs
out its phones; its agents are kept.
"""

from __future__ import annotations

import argparse
import asyncio
import re
from datetime import UTC, datetime

from app.api.v1.auth import as_msisdn
from app.core.auth import hash_pin, new_code
from app.db.models import Dealer, Session
from app.db.session import get_session_factory
from app.seed import ALL_PERMS
from sqlalchemy import select, update

REGIONS = ("west", "north", "south", "east")
ACCOUNT_ID = re.compile(r"^[a-z0-9][a-z0-9-]{1,38}$")


async def create(account_id: str, name: str, region: str, phone: str | None) -> str:
    """Create or reset the account; return the one-time code."""
    if not ACCOUNT_ID.match(account_id):
        raise SystemExit("Account name: 2-39 lower-case letters, digits or '-', e.g. test-agg")
    if account_id.startswith("agg-"):
        # Names starting "agg-" belong to aggregators created from Orange's report.
        raise SystemExit("Account names starting with 'agg-' are kept for Orange's report")
    if region not in REGIONS:
        raise SystemExit(f"Region must be one of {', '.join(REGIONS)}")
    msisdn = None
    if phone:
        msisdn = as_msisdn(phone)
        if msisdn is None:
            raise SystemExit("That phone number is not a Sierra Leone number")
    code = new_code()
    async with get_session_factory()() as db:
        if msisdn:
            other = (
                await db.execute(select(Dealer).where(Dealer.msisdn == msisdn))
            ).scalar_one_or_none()
            if other is not None and other.id != account_id:
                raise SystemExit("That phone number already belongs to another account")
        d = await db.get(Dealer, account_id)
        if d is None:
            d = Dealer(id=account_id, name=name, pin_hash="", permissions=ALL_PERMS)
            db.add(d)
        elif "VIEW_NATIONAL" in d.permissions.split(","):
            raise SystemExit(f"{account_id!r} is an Orange national account; choose another name")
        d.name = name
        d.region = region
        d.permissions = ALL_PERMS
        if msisdn:
            d.msisdn = msisdn
        d.pin_hash = hash_pin(code, account_id)
        d.must_set_pin = True
        d.code_issued_at = datetime.now(UTC)
        await db.execute(
            update(Session)
            .where(Session.role == "dealer", Session.subject == account_id)
            .values(revoked=True)
        )
        await db.commit()
    return code


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("account_id")
    ap.add_argument("name")
    ap.add_argument("--region", default="west", choices=REGIONS)
    ap.add_argument("--phone")
    a = ap.parse_args()
    account_id = a.account_id.strip().lower()
    code = asyncio.run(create(account_id, a.name.strip(), a.region, a.phone))
    print(f"Aggregator {account_id} ({a.name.strip()}). One-time code: {code[:3]} {code[3:]}")
    print("Sign in to the Agent App with the account name and this code, then choose a PIN.")
    print("It works once. Keep it out of chats and screenshots.")


if __name__ == "__main__":
    main()
