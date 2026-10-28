"""The national map: Orange's account sees every agent, an aggregator only their own; the
counts add up at every level; no money field ever leaves; the CSV is safe in Excel."""

from __future__ import annotations

import pytest
from app.db import session as dbsession
from app.db.models import Agent, Dealer
from sqlalchemy import update

SEEDED = 8  # the demo seed's shops, all in Freetown under Kissy
MONEY = ("cash_in", "cash_out", "balance", "float", "orange_cash", "_sle")


async def _signin(client, ref: str) -> dict:
    r = await client.post(
        "/api/v1/auth/sign-in", json={"ref": ref, "pin": "1234", "role": "dealer"}
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


async def _summary(client, who: str) -> dict:
    return (
        await client.get("/api/v1/dealer/map/summary", headers=await _signin(client, who))
    ).json()


async def _second_aggregator() -> None:
    """Aggregator B in the North with one agent in Makeni and one in a village not on record."""
    from app.core.auth import hash_pin

    async with dbsession.get_session_factory()() as db:
        db.add(
            Dealer(
                id="agg-b",
                name="Aggregator B",
                pin_hash=hash_pin("1234", "agg-b"),
                permissions="VIEW_AGENT",
                region="north",
            )
        )
        for ref, city, region, tx in (
            ("Agent 901", "Makeni", "north", 40.0),
            ("Agent 902", "Somewhere Small", None, 0.0),
        ):
            db.add(
                Agent(
                    ref=ref,
                    dealer_id="agg-b",
                    person_name="P",
                    shop_name=f"Shop {ref}",
                    area=city,
                    street="Main road",
                    city=city,
                    region=region,
                    orange_tx_count=tx,
                    verified=True,
                    pin_hash="x",
                )
            )
        await db.commit()


def _sum(rows, key):
    return sum(r[key] for r in rows)


@pytest.mark.asyncio
async def test_orange_sees_the_country_and_the_counts_add_up(client):
    await _second_aggregator()
    s = (
        await client.get("/api/v1/dealer/map/summary", headers=await _signin(client, "orange"))
    ).json()
    assert s["scope"] == "national"
    t = s["totals"]
    assert t["registered"] == SEEDED + 2  # the seed, and two under Aggregator B
    for key in (
        "registered",
        "transacting",
        "no_file_figure",
        "app_active",
        "located",
        "confirmed",
    ):
        assert _sum(s["regions"], key) + s["unplaced"][key] == t[key], key
        assert _sum(s["towns"], key) + s["no_point"][key] == t[key], key
        for r in s["regions"]:
            assert _sum(r["aggregators"], key) == r[key], (r["region"], key)
    north = next(r for r in s["regions"] if r["region"] == "north")
    assert north["registered"] == 1 and north["transacting"] == 1
    assert s["unplaced"]["registered"] == 1
    assert s["unplaced"]["reasons"]["town_not_on_record"] == 1
    # The five seeded shops have no figure from Orange's file: counted apart, never as zero.
    assert t["no_file_figure"] == SEEDED


@pytest.mark.asyncio
async def test_an_aggregator_sees_only_their_own_and_an_agent_nothing(client, agent):
    await _second_aggregator()
    kissy = (
        await client.get("/api/v1/dealer/map/summary", headers=await _signin(client, "kissy"))
    ).json()
    assert kissy["scope"] == "aggregator" and kissy["totals"]["registered"] == SEEDED
    b = await _signin(client, "agg-b")
    rows = (await client.get("/api/v1/dealer/map/agents", headers=b)).json()
    assert {r["ref"] for r in rows} == {"Agent 901", "Agent 902"}
    # Asking for another aggregator's agents gives an empty list, never theirs.
    assert (await client.get("/api/v1/dealer/map/agents?aggregator=kissy", headers=b)).json() == []
    assert (await client.get("/api/v1/dealer/map/summary", headers=agent)).status_code == 404


@pytest.mark.asyncio
async def test_a_sub_aggregators_agents_count_for_the_aggregator_above(client):
    await _second_aggregator()
    async with dbsession.get_session_factory()() as db:
        await db.execute(update(Dealer).where(Dealer.id == "agg-b").values(parent_id="kissy"))
        await db.commit()
    kissy = (
        await client.get("/api/v1/dealer/map/summary", headers=await _signin(client, "kissy"))
    ).json()
    assert kissy["totals"]["registered"] == SEEDED + 2


@pytest.mark.asyncio
async def test_using_the_app_counts_what_the_agent_did_not_the_seed(client, agent):
    orange = await _signin(client, "orange")
    before = (await client.get("/api/v1/dealer/map/summary", headers=orange)).json()["totals"]
    assert before["app_active"] == 0  # the seed's own declarations do not count
    r = await client.post(
        "/api/v1/agent/transactions",
        json={"transaction": "cash_out", "amount_band": "≤2k", "client_token": "map-000001"},
        headers=agent,
    )
    assert r.status_code == 201, r.text
    after = (await client.get("/api/v1/dealer/map/summary", headers=orange)).json()["totals"]
    assert after["app_active"] == 1
    row = next(
        x
        for x in (await client.get("/api/v1/dealer/map/agents", headers=orange)).json()
        if x["ref"] == "Agent 024"
    )
    assert row["app_days"] == 1


@pytest.mark.asyncio
async def test_no_money_and_points_only_once_confirmed(client):
    await _second_aggregator()
    orange = await _signin(client, "orange")
    s = await client.get("/api/v1/dealer/map/summary", headers=orange)
    rows = await client.get("/api/v1/dealer/map/agents", headers=orange)
    for text in (s.text, rows.text):
        assert not any(m in text for m in MONEY), text[:200]
    for r in rows.json():
        if not r["confirmed"]:
            assert r["lat"] is None and r["lng"] is None
    west = (await client.get("/api/v1/dealer/map/agents?region=west", headers=orange)).json()
    assert len(west) == SEEDED and all(r["region"] == "west" for r in west)
    none = (await client.get("/api/v1/dealer/map/agents?region=none", headers=orange)).json()
    assert [r["ref"] for r in none] == ["Agent 902"]


@pytest.mark.asyncio
async def test_the_csv_opens_in_excel_without_running_a_formula(client):
    async with dbsession.get_session_factory()() as db:
        await db.execute(
            update(Agent).where(Agent.ref == "Agent 024").values(shop_name='=HYPERLINK("x")')
        )
        await db.commit()
    r = await client.get(
        "/api/v1/dealer/map/agents.csv?region=west", headers=await _signin(client, "orange")
    )
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    lines = r.text.splitlines()
    assert lines[0].startswith("Agent,Shop,Aggregator,Region")
    assert any("'=HYPERLINK" in line for line in lines)
    assert "no file figure" in r.text
