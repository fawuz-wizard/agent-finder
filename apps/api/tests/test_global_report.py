"""Orange's daily Global Report, uploaded in the national console: read and previewed first,
applied only when a person says so; the same file twice is one upload; a cut-off report waits
for a second yes; personal columns never reach the database."""

from __future__ import annotations

import json

import pytest
from app.db import session as dbsession
from app.db.models import Agent, AgentDailyStat, ReportImport
from sqlalchemy import func, select

URL = "/api/v1/national/reports"
HEADER = (
    "USER_TYPE,USER_CATEGORY_CODE,PARENT_USER_MSISDN,PARENT_FIRST_NAME,MSISDN,AGENT_CODE,"
    "USER_FIRST_NAME,USER_LAST_NAME,CITY,ADDRESS1,ACCOUNT_STATUS,DOB,Latitude,Longitude,"
    "Cash In,Cash Out,TRNX COUNT,Float,Commission"
)


def row(code: str, line: str, lat: str = "", lng: str = "", status: str = "Y") -> str:
    return (
        f"CHANNEL,AGNT,076444433,Abjatal Star,{line},{code},Mariama,Sesay,Freetown,"
        f"12 Main Motor Road Lumley,{status},1990-01-01,{lat},{lng},5000,7000,12,250000,1500"
    )


def report(*rows: str) -> bytes:
    return ("\n".join([HEADER, *rows]) + "\n").encode()


THREE = report(
    row("700001", "077000001", "8.4210", "-13.2650"),
    row("700002", "077000002", "8.4300", "-13.2700"),
    row("700003", "077000003"),
)


async def _orange(client) -> dict:
    r = await client.post(
        "/api/v1/auth/sign-in", json={"ref": "orange", "pin": "123456", "role": "dealer"}
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


async def _upload(client, h, data: bytes, day: str = "2026-11-03", name: str = "report.csv"):
    return await client.post(
        f"{URL}?report_date={day}",
        content=data,
        headers={**h, "Content-Type": "application/octet-stream", "X-File-Name": name},
    )


async def _count(model) -> int:
    async with dbsession.get_session_factory()() as db:
        return (await db.execute(select(func.count()).select_from(model))).scalar_one()


@pytest.mark.asyncio
async def test_upload_previews_without_changing_anything_then_apply_writes_it(client):
    h = await _orange(client)
    agents_before = await _count(Agent)
    r = await _upload(client, h, THREE)
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["status"] == "previewed" and out["duplicate"] is False
    s = out["summary"]
    assert s["importable"] == 3 and s["aggregators"] == 1
    assert s["columns"] == {
        "coordinates": True,
        "float": True,
        "commission": True,
        "activity": True,
    }
    assert s["changes"]["counts"]["new"] == 3 and s["changes"]["counts"]["located"] == 2
    assert await _count(Agent) == agents_before  # a preview changes nothing

    r = await client.post(f"{URL}/{out['id']}/apply", json={}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "applied" and r.json()["applied_by"]
    async with dbsession.get_session_factory()() as db:
        a = (await db.execute(select(Agent).where(Agent.agent_code == "700001"))).scalar_one()
        assert (a.lat, a.lng, a.location_source, a.location_confirmed) == (
            8.421,
            -13.265,
            "orange",
            True,
        )
        day = (
            await db.execute(select(AgentDailyStat).where(AgentDailyStat.agent_ref == a.ref))
        ).scalar_one()
        assert (day.cash_in, day.cash_out, day.tx_count, day.float_balance, day.commission) == (
            5000,
            7000,
            12,
            250000,
            1500,
        )
        rec = await db.get(ReportImport, out["id"])
        assert rec.rows is None  # the cleaned rows are not kept once applied


@pytest.mark.asyncio
async def test_personal_columns_never_reach_the_database(client):
    h = await _orange(client)
    r = await _upload(client, h, THREE)
    async with dbsession.get_session_factory()() as db:
        rec = await db.get(ReportImport, r.json()["id"])
    assert "1990-01-01" not in (rec.rows or "") and "1990-01-01" not in rec.summary


@pytest.mark.asyncio
async def test_the_same_file_twice_is_one_upload(client):
    h = await _orange(client)
    first = (await _upload(client, h, THREE)).json()
    again = await _upload(client, h, THREE)
    assert again.json()["id"] == first["id"] and again.json()["duplicate"] is True
    assert await _count(ReportImport) == 1


@pytest.mark.asyncio
async def test_only_accounts_with_the_permission_can_upload(client, dealer):
    r = await _upload(client, dealer, THREE)
    assert r.status_code == 404
    assert (await client.get(URL, headers=dealer)).status_code == 404
    assert (await client.post(URL, content=THREE)).status_code == 401


@pytest.mark.asyncio
async def test_files_that_are_not_the_report_are_refused_with_a_reason(client):
    h = await _orange(client)
    r = await _upload(client, h, b"name,phone\nAminata,076000000\n")
    assert r.status_code == 422 and "PARENT_USER_MSISDN" in r.json()["error"]["message"]
    r = await _upload(client, h, b"PK\x03\x04 not really a zip")
    assert r.status_code == 422 and "Excel" in r.json()["error"]["message"]
    r = await _upload(client, h, b"\x00\x01\x02binary")
    assert r.status_code == 422
    r = await _upload(client, h, b"x" * (10 * 1024 * 1024 + 1))
    assert r.status_code == 413
    r = await _upload(client, h, THREE, day="2999-01-01")
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_a_cut_off_report_waits_for_a_second_yes(client):
    h = await _orange(client)
    first = (await _upload(client, h, THREE)).json()
    await client.post(f"{URL}/{first['id']}/apply", json={}, headers=h)
    short = (await _upload(client, h, report(row("700001", "077000001")), day="2026-11-04")).json()
    assert short["summary"]["changes"]["counts"]["not_in_report"] >= 2
    r = await client.post(f"{URL}/{short['id']}/apply", json={}, headers=h)
    assert r.status_code == 409 and r.json()["error"]["code"] == "report_shrunk"
    r = await client.post(f"{URL}/{short['id']}/apply", json={"confirm_shrink": True}, headers=h)
    assert r.status_code == 200 and r.json()["status"] == "applied"


@pytest.mark.asyncio
async def test_a_report_is_applied_once_and_a_discarded_one_not_at_all(client):
    h = await _orange(client)
    up = (await _upload(client, h, THREE)).json()
    assert (await client.post(f"{URL}/{up['id']}/apply", json={}, headers=h)).status_code == 200
    again = await client.post(f"{URL}/{up['id']}/apply", json={}, headers=h)
    assert again.status_code == 409 and again.json()["error"]["code"] == "report_applied"
    other = (await _upload(client, h, report(row("700009", "077000009")), day="2026-11-02")).json()
    r = await client.post(f"{URL}/{other['id']}/discard", headers=h)
    assert r.status_code == 200 and r.json()["status"] == "discarded"
    r = await client.post(f"{URL}/{other['id']}/apply", json={"confirm_shrink": True}, headers=h)
    assert r.status_code == 409
    async with dbsession.get_session_factory()() as db:
        assert (
            await db.execute(select(Agent).where(Agent.agent_code == "700009"))
        ).scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_a_location_outside_sierra_leone_is_flagged_and_not_used(client):
    h = await _orange(client)
    up = (await _upload(client, h, report(row("700021", "077000021", "51.5", "-0.12")))).json()
    issues = {i for item in up["summary"]["rows_with_issues"] for i in item["issues"]}
    assert "bad_coordinates" in issues
    await client.post(f"{URL}/{up['id']}/apply", json={}, headers=h)
    async with dbsession.get_session_factory()() as db:
        a = (await db.execute(select(Agent).where(Agent.agent_code == "700021"))).scalar_one()
    assert a.lat is None and a.location_source != "orange"


@pytest.mark.asyncio
async def test_an_agent_confirmed_at_the_shop_keeps_their_point(client, dealer):
    h = await _orange(client)
    async with dbsession.get_session_factory()() as db:
        a = (await db.execute(select(Agent).where(Agent.ref == "Agent 024"))).scalar_one()
        a.agent_code, a.location_source, a.location_confirmed = "700024", "dealer", True
        kept = (a.lat, a.lng)
        await db.commit()
    up = (await _upload(client, h, report(row("700024", "077000024", "8.40", "-13.20")))).json()
    await client.post(f"{URL}/{up['id']}/apply", json={"confirm_shrink": True}, headers=h)
    async with dbsession.get_session_factory()() as db:
        a = (await db.execute(select(Agent).where(Agent.ref == "Agent 024"))).scalar_one()
    assert (a.lat, a.lng) == kept and a.location_source == "dealer"


@pytest.mark.asyncio
async def test_history_lists_uploads_newest_first(client):
    h = await _orange(client)
    await _upload(client, h, THREE, day="2026-11-01")
    await _upload(client, h, report(row("700031", "077000031")), day="2026-11-02")
    r = await client.get(URL, headers=h)
    assert [x["report_date"] for x in r.json()] == ["2026-11-02", "2026-11-01"]
    assert all("rows" not in x for x in r.json())
    assert json.dumps(r.json()).count("1990-01-01") == 0
