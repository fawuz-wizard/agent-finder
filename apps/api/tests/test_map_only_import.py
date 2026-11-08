"""A map-only sheet (no agent phones, no money figures, a point per shop) puts Orange's agents
on the map for customers, and Orange's aggregators get codes to sign in with their number."""

from __future__ import annotations

import pytest
from app.db import session as dbsession
from app.db.models import Agent, Dealer
from app.services.points import on_map
from scripts.import_orange import apply, map_only, read_table, validate
from scripts.issue_orange_codes import issue, local_number

HEAD = "aggregator,aggregator_phone,agent_code,agent_name,phone,city,address,registered,status,grade,trnx_count,apr_ci,apr_co,LATITUDE,LONGITUDE\n"  # noqa: E501
SHEET = (
    HEAD
    + "Test Star Enterprise,076 400 001,300001,Test Corner Shop,,Freetown,4 Test Road Lumley,,Active,Agent,,,,8.4655,-13.2601\n"  # noqa: E501
    + "Test Star Enterprise,076 400 001,300002,Test Kiosk,073 000 002,Freetown,9 Sample Street,,Active,Agent,5,10,20,,\n"  # noqa: E501
)


def _results(tmp_path):
    p = tmp_path / "map.csv"
    p.write_text(SHEET, encoding="utf-8")
    results = validate(read_table(p), "map")
    map_only(results)
    return results


@pytest.mark.asyncio
async def test_a_map_only_sheet_shows_pinned_shops_to_customers_and_keeps_no_phones(
    client, tmp_path
):
    results = _results(tmp_path)
    assert all("bad_msisdn" not in r.issues for r in results)
    created = await apply(results)
    assert created["aggregators"] == 1 and created["agents"] == 2
    async with dbsession.get_session_factory()() as db:
        pinned = await db.get(Agent, "Agent 300001")
        unpinned = await db.get(Agent, "Agent 300002")
        assert on_map(pinned) and pinned.location_source == "orange"
        assert (pinned.lat, pinned.lng) == (8.4655, -13.2601)
        assert not on_map(unpinned)  # no point: the team pins it in the Agent App
        # The sheet's phone and figures were dropped, never written.
        assert unpinned.msisdn is None and unpinned.orange_cash_out is None
        assert unpinned.orange_tx_count is None


@pytest.mark.asyncio
async def test_orange_aggregators_get_a_code_and_sign_in_with_their_number(client, tmp_path):
    await apply(_results(tmp_path))
    rows = await issue()
    assert len(rows) == 1
    name, number, code = rows[0]
    assert name == "Test Star Enterprise" and number == "076 400 001"
    first = await client.post(
        "/api/v1/auth/sign-in", json={"ref": number, "pin": code.replace(" ", ""), "role": "dealer"}
    )
    assert first.status_code == 200 and first.json()["must_set_pin"] is True
    h = {"Authorization": f"Bearer {first.json()['token']}"}
    assert (
        await client.post("/api/v1/auth/pin", json={"pin": "2580"}, headers=h)
    ).status_code == 200
    again = await client.post(
        "/api/v1/auth/sign-in", json={"ref": number, "pin": "2580", "role": "dealer"}
    )
    assert again.status_code == 200 and again.json()["must_set_pin"] is False
    # Their own agents, and only them.
    h = {"Authorization": f"Bearer {again.json()['token']}"}
    refs = {a["ref"] for a in (await client.get("/api/v1/dealer/agents", headers=h)).json()}
    assert refs == {"Agent 300001", "Agent 300002"}
    # Once the PIN is chosen, no new code is issued without asking.
    assert await issue() == []


def test_numbers_read_the_way_people_type_them():
    assert local_number("+23276123456") == "076 123 456"
    assert local_number(None) == ""


@pytest.mark.asyncio
async def test_a_national_account_never_gets_a_code_here(client, tmp_path):
    async with dbsession.get_session_factory()() as db:
        db.add(
            Dealer(
                id="orange-x",
                name="Orange",
                pin_hash="x",
                must_set_pin=True,
                permissions="VIEW_NATIONAL",
                source="orange_file",
            )
        )
        await db.commit()
    assert await issue() == []
