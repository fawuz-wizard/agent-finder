"""Orange's file → validation report → aggregators, sub-aggregators and agents in the database.
Imported agents have no location and never reach a customer until a dealer pins them."""

from __future__ import annotations

import zipfile
from pathlib import Path

import pytest
from app.db import session as dbsession
from app.db.models import Agent, Dealer
from scripts.import_orange import apply, read_xlsx, region_for, report, validate
from sqlalchemy import select

COLS = [
    "PARENT_USER_MSISDN", "MSISDN", "APR CI", "APR CO", "TRNX COUNT", "USER_FIRST_NAME",
    "USER_LAST_NAME", "CITY", "ACCOUNT_STATUS", "USER_TYPE", "USER_CATEGORY_CODE", "AGENT_CODE",
    "ADDRESS1", "PARENT_FIRST_NAME", "PARENT_LAST_NAME", "DOB", "ID_NUMBER",
]  # fmt: skip


def write_xlsx(path: Path, rows: list[list[str]]) -> None:
    """A minimal .xlsx: one sheet, inline strings, enough for the importer's reader."""

    def col(i: int) -> str:
        return chr(ord("A") + i) if i < 26 else "A" + chr(ord("A") + i - 26)

    body = ""
    for r, row in enumerate(rows, start=1):
        cells = "".join(
            f'<c r="{col(i)}{r}" t="inlineStr"><is><t>{v}</t></is></c>'
            for i, v in enumerate(row)
            if v != ""
        )
        body += f'<row r="{r}">{cells}</row>'
    sheet = f'<?xml version="1.0"?><worksheet xmlns="x"><sheetData>{body}</sheetData></worksheet>'
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("xl/workbook.xml", "<workbook/>")
        z.writestr("xl/worksheets/sheet1.xml", sheet)


def row(**kw: str) -> list[str]:
    base = {c: "" for c in COLS}
    base.update(
        {
            "PARENT_USER_MSISDN": "76000001",
            "USER_TYPE": "CHANNEL",
            "USER_CATEGORY_CODE": "AGNT",
            "ACCOUNT_STATUS": "Y",
            "PARENT_FIRST_NAME": "Kissy",
            "PARENT_LAST_NAME": "Distribution",
            "DOB": "1990-01-01",
            "ID_NUMBER": "SECRET-ID",
        }
    )
    base.update(kw)
    return [base[c] for c in COLS]


def sample(tmp_path: Path) -> Path:
    p = tmp_path / "orange.xlsx"
    write_xlsx(
        p,
        [
            COLS,
            row(
                MSISDN="76111111",
                AGENT_CODE="100001",
                USER_FIRST_NAME="Mariama",
                USER_LAST_NAME="Sesay",
                CITY="FREETOWN",
                ADDRESS1="12 Lumley Road",
                **{"APR CI": "1200", "APR CO": "3400", "TRNX COUNT": "88"},
            ),  # noqa: E501
            row(
                MSISDN="76222222",
                AGENT_CODE="100002",
                USER_FIRST_NAME="Sorie",
                USER_LAST_NAME="Kamara",
                CITY="Bo",
                ACCOUNT_STATUS="N",
            ),  # noqa: E501
            row(
                MSISDN="76333333",
                AGENT_CODE="100003",
                USER_FIRST_NAME="Hawa",
                USER_LAST_NAME="Bah",
                CITY="",
            ),  # no city, region unknown
            row(
                MSISDN="7644",
                AGENT_CODE="1A4",
                USER_FIRST_NAME="Bad",
                USER_LAST_NAME="Row",
                CITY="Kenema",
            ),  # bad ids: held
            row(
                MSISDN="76555555",
                AGENT_CODE="100005",
                USER_FIRST_NAME="Sub",
                USER_LAST_NAME="Agg",
                CITY="Makeni",
                USER_CATEGORY_CODE="SUBAGG",
            ),  # noqa: E501
            [c for c in COLS],  # the repeated header row Orange's export carries
            row(
                MSISDN="76111111",
                AGENT_CODE="100006",
                USER_FIRST_NAME="Dup",
                USER_LAST_NAME="Line",
                CITY="Kono",
            ),  # duplicate MSISDN: held
        ],
    )
    return p


def test_regions_come_from_the_city():
    assert region_for("FREETOWN") == "west"
    assert region_for("Bo") == "south"
    assert region_for("Kono") == "east"
    assert region_for("Kambia") == "north"
    assert region_for("Port Loko Town") == "north"
    assert region_for("14 Bulky Street") is None
    assert region_for("") is None


def test_validation_report_names_rows_and_codes_never_values(tmp_path):
    results = validate(read_xlsx(sample(tmp_path)), "abc123")
    rep = report(results)
    assert rep["by_kind"] == {"agent": 5, "subaggregator": 1, "header": 1, "empty": 0, "invalid": 0}
    assert rep["aggregators"] == 1 and rep["importable"] == 4 and rep["held_back"] == 2
    assert rep["issues"]["repeated_header"] == 1
    assert rep["issues"]["bad_msisdn"] == 1 and rep["issues"]["bad_agent_code"] == 1
    assert rep["issues"]["duplicate_msisdn"] == 1
    assert rep["issues"]["no_city"] == 1 and rep["issues"]["region_unknown"] == 1
    assert rep["regions"] == {"west": 1, "south": 1, "unknown": 1, "north": 1}
    text = str(rep)
    for private in ("SECRET-ID", "1990", "76111111", "Mariama", "Sesay"):
        assert private not in text, private


@pytest.mark.asyncio
async def test_apply_creates_aggregators_and_unlocated_agents_that_customers_never_see(
    client, dealer, tmp_path
):
    results = validate(read_xlsx(sample(tmp_path)), "abc123")
    created = await apply(results)
    assert created == {"aggregators": 1, "subaggregators": 1, "agents": 3, "updated_agents": 0}
    # Running it again updates, never duplicates.
    again = await apply(results)
    assert again["agents"] == 0 and again["updated_agents"] == 3 and again["aggregators"] == 0
    async with dbsession.get_session_factory()() as db:
        agg = await db.get(Dealer, "agg-000001")
        assert agg is not None and agg.msisdn == "+23276000001" and agg.region == "west"
        assert "MANAGE_AGENT" in agg.permissions
        sub = (
            await db.execute(select(Dealer).where(Dealer.parent_id == "agg-000001"))
        ).scalar_one()
        assert sub.region == "north"
        a = await db.get(Agent, "Agent 100001")
        assert a is not None and a.lat is None and a.dealer_id == "agg-000001"
        assert a.agent_code == "100001" and a.msisdn == "+23276111111"
        assert a.region == "west" and a.city == "Freetown" and a.verified and a.active
        assert a.orange_cash_out == 3400.0 and a.source_row == "abc123:2"
        inactive = await db.get(Agent, "Agent 100002")
        assert inactive is not None and inactive.active is False
        assert await db.get(Agent, "Agent 100006") is None  # held back: duplicate MSISDN
    # Nothing imported reaches a customer: no location, and one is inactive.
    r = await client.post(
        "/api/v1/search",
        json={"transaction": "cash_out", "amount_sle": 2000, "area": "Freetown"},
        headers={"X-Client": "cust-import"},
    )
    assert "100001" not in r.text and "Mariama" not in r.text
    assert (await client.get("/api/v1/agents/af-100001")).status_code == 404
    # The seeded dealer does not see another aggregator's agents; the new aggregator cannot
    # sign in until someone sets a PIN.
    rows = (await client.get("/api/v1/dealer/agents", headers=dealer)).json()
    assert all(x["ref"] != "Agent 100001" for x in rows)
    s = await client.post(
        "/api/v1/auth/sign-in", json={"ref": "agg-000001", "pin": "1234", "role": "dealer"}
    )
    assert s.status_code == 401
