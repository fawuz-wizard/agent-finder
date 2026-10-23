"""The likelihood of being served, as the customer reads it: a round figure from the activity
ranker, never 100, present only where the question applies, the same on the search and on
the shop's own page."""

from __future__ import annotations

import pytest
from app.core.settings import get_settings
from app.services.ranker import served_pct

# The older ranker and the ledger phrases; the 7-day rule has its own file.
pytestmark = pytest.mark.usefixtures("activity_ranker")

HDR = {"X-Client": "cust-pct"}
POINT = {"lat": 8.439, "lng": -13.283}
SEARCH = {"transaction": "cash_out", "area": "Lumley", **POINT}


def test_served_pct_is_a_round_figure_that_never_promises():
    assert served_pct(0.0) == 5 and served_pct(0.01) == 5
    assert served_pct(0.999) == 95 and served_pct(1.0) == 95
    assert served_pct(0.87) == 85 and served_pct(0.88) == 90
    assert served_pct(0.5) == 50
    for p in (0.13, 0.29, 0.61, 0.94):
        assert served_pct(p) % 5 == 0 and 5 <= served_pct(p) <= 95


def _rows(body: dict) -> list[dict]:
    return body["recommended"] + body["results"] + body["closer_not_serving"]


@pytest.mark.asyncio
async def test_search_carries_a_rounded_likelihood_on_every_open_agent(client):
    r = await client.post("/api/v1/search", json={**SEARCH, "amount_sle": 2000}, headers=HDR)
    assert r.status_code == 200, r.text
    body = r.json()
    rows = _rows(body)
    assert rows
    for x in rows:
        if x["outcome"] in ("likely", "limited", "unknown"):
            assert isinstance(x["served_pct"], int)
            assert 5 <= x["served_pct"] <= 95 and x["served_pct"] % 5 == 0
            assert x["served_text"] == f"{x['served_pct']}% likely to serve you"
        else:
            assert x["served_pct"] is None and x["served_text"] is None
    # The recommendation is the highest figure, and the order never puts a lower one first.
    pcts = [x["served_pct"] for x in body["recommended"]]
    assert pcts == sorted(pcts, reverse=True)
    # Nothing in the payload names the model behind the figure.
    assert "probability" not in r.text and "features" not in r.text and "weights" not in r.text


@pytest.mark.asyncio
async def test_an_agent_who_may_not_cover_the_amount_reads_lower(client):
    # From the area's centre, so the seed's "small" agent is inside the 500 m core.
    r = await client.post(
        "/api/v1/search",
        json={"transaction": "cash_out", "area": "Lumley", "amount_sle": 5000},
        headers=HDR,
    )
    rows = {x["name"]: x for x in _rows(r.json())}
    mohamed, fatmata = rows["Mohamed's Store"], rows["Fatmata's Shop"]
    assert mohamed["outcome"] == "limited" and fatmata["outcome"] == "likely"
    assert mohamed["served_pct"] < fatmata["served_pct"]
    assert mohamed["served_pct"] >= 5


@pytest.mark.asyncio
async def test_the_shops_page_shows_the_same_figure_as_the_search(client):
    s = await client.post("/api/v1/search", json={**SEARCH, "amount_sle": 2000}, headers=HDR)
    top = s.json()["recommended"][0]
    d = await client.get(
        f"/api/v1/agents/{top['id']}",
        params={"transaction": "cash_out", "amount_sle": 2000, "area": "Lumley", **POINT},
    )
    assert d.status_code == 200, d.text
    assert d.json()["served_pct"] == top["served_pct"]
    assert d.json()["served_text"] == top["served_text"]
    assert d.json()["outcome_text"] == "Likely to serve you"


@pytest.fixture
def rules_ranker(monkeypatch):
    monkeypatch.setenv("RANKER", "rules")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_with_the_ranker_off_there_is_no_figure_only_the_phrase(rules_ranker, client):
    r = await client.post("/api/v1/search", json={**SEARCH, "amount_sle": 2000}, headers=HDR)
    rows = _rows(r.json())
    assert rows and all(x["served_pct"] is None and x["served_text"] is None for x in rows)
    top = r.json()["recommended"][0]
    d = await client.get(f"/api/v1/agents/{top['id']}", params={"transaction": "cash_out"})
    assert d.json()["served_pct"] is None
