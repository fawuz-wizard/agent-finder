"""Pilot seed: one dealer, the demo agents with coarse business points, PIN 1234 everywhere.
Replace the PINs before real agents sign in (scripts/set_pin.py)."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select

from app.core.auth import hash_pin
from app.db.models import Agent, AvailabilityEvent, Dealer
from app.db.session import get_session_factory
from app.services.phrasing import now_utc

DEMO_PIN = "1234"
ALL_PERMS = "VIEW_AGENT,VIEW_AGENT_FINANCIAL_DETAIL,MANAGE_FLOAT_REQUEST,VIEW_AGENT_HISTORY,CONTACT_AGENT,ESCALATE_AGENT"  # noqa: E501

AGENTS = [
    (
        "Agent 024",
        "Fatmata Kamara",
        "Fatmata's Shop",
        "Lumley",
        "Lumley Junction",
        8.4405,
        -13.2795,
        "open",
        "most",
        "some",
        112,
        True,
    ),
    (
        "Agent 031",
        "Sento Bangura",
        "Sento Enterprise",
        "Aberdeen",
        "Sir Samuel Lewis Road",
        8.4842,
        -13.2711,
        "open",
        "some",
        "small",
        48,
        False,
    ),
    (
        "Agent 009",
        "Ibrahim Sesay",
        "Ibrahim Cash Point",
        "Wilberforce",
        "Wilberforce Street",
        8.4617,
        -13.2629,
        "hidden",
        "some",
        "some",
        20,
        False,
    ),
    (
        "Agent 017",
        "Salamatu Turay",
        "Salamatu Shop",
        "Lumley",
        "Wilkinson Road",
        8.4448,
        -13.2749,
        "closed",
        "most",
        "most",
        62,
        False,
    ),
    (
        "Agent 038",
        "Amadu Conteh",
        "Amadu Corner Shop",
        "Lumley",
        "Juba Road",
        8.4336,
        -13.2724,
        "open",
        "none",
        "most",
        4300,
        False,
    ),
    (
        "Agent 073",
        "Mohamed Koroma",
        "Mohamed's Store",
        "Lumley",
        "Lumley Road",
        8.4412,
        -13.2781,
        "open",
        "small",
        "most",
        25,
        False,
    ),
    (
        "Agent 019",
        "Aminata Jalloh",
        "Aminata Trading",
        "Lumley",
        "Lumley Junction",
        8.4399,
        -13.2808,
        "open",
        "most",
        "most",
        305,
        False,
    ),
    (
        "Agent 066",
        "Kadiatu Mansaray",
        "Kadiatu's Kiosk",
        "Lumley",
        "Lumley Beach Road",
        8.4371,
        -13.2852,
        "open",
        "most",
        "some",
        14,
        False,
    ),
]


async def seed_if_empty() -> None:
    async with get_session_factory()() as db:
        if (await db.execute(select(Dealer.id).limit(1))).first():
            return
        now = now_utc()
        db.add(
            Dealer(
                id="kissy",
                name="Kissy Distribution",
                pin_hash=hash_pin(DEMO_PIN, "kissy"),
                permissions=ALL_PERMS,
            )
        )
        for (
            ref,
            person,
            shop,
            area,
            street,
            lat,
            lng,
            presence,
            cash,
            dep,
            mins_ago,
            verified,
        ) in AGENTS:
            declared = now - timedelta(minutes=mins_ago)
            db.add(
                Agent(
                    ref=ref,
                    dealer_id="kissy",
                    person_name=person,
                    shop_name=shop,
                    area=area,
                    street=street,
                    lat=lat,
                    lng=lng,
                    phone="+23276000000",
                    phone_visible=(ref == "Agent 024"),
                    verified=verified,
                    pin_hash=hash_pin(DEMO_PIN, ref),
                    presence=presence,
                    cash_out=cash,
                    deposit=dep,
                    night_mode=True,
                    declared_at=declared,
                )
            )
            db.add(
                AvailabilityEvent(
                    agent_ref=ref,
                    at=declared,
                    kind="declare",
                    presence=presence,
                    cash_out=cash,
                    deposit=dep,
                    source="seed",
                )
            )
        await db.commit()
