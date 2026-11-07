"""The pilot team's export of the 7-day rule at work: the three checks as points again, the
percentage shown and the visit result; no customer key, no position, no money."""

from __future__ import annotations

import csv
import io
import json
from datetime import UTC, datetime

from app.db.models import SearchImpression
from app.services.ranker import week_features
from scripts.export_week_rule import COLUMNS, calibration, row_from, write


def impression(label=None, pct=80, **facts) -> SearchImpression:
    f = week_features(
        active_days=facts.get("days", 4),
        size_done=facts.get("size", 1.0),
        served=facts.get("served", 3),
        failed=facts.get("failed", 0),
        distance_m=350,
        low=facts.get("low", False),
    )
    return SearchImpression(
        at=datetime(2026, 11, 3, 12, 0, tzinfo=UTC),
        client_key="device-key-never-exported",
        agent_ref="Agent 024",
        transaction="deposit",
        amount_band="≤2k",
        features_json=json.dumps({**f, "rule_pct": float(pct)}),
        outcome_shown="likely" if pct >= 50 else "limited",
        probability=0.8,
        label=label,
    )


def test_the_briefing_example_2_reads_back_as_its_three_checks():
    r = row_from(impression(label=1))
    assert r["days_worked"] == 4
    assert r["check1_active_points"] == 22.9
    assert r["check2_size_points"] == 35
    assert r["check3_customer_points"] == 20
    assert (r["percentage_shown"], r["shown_as"], r["visit_result"]) == (80, "likely", "served")
    assert r["customer_asked"] == "Cash in"


def test_fewer_than_three_reports_give_no_customer_points_and_low_today_is_named():
    r = row_from(impression(served=2, low=True, pct=35))
    assert r["check3_customer_points"] == 0
    assert r["low_today_on_this_side"] == "yes"
    assert r["visit_result"] == "no report"


def test_rows_from_the_older_ranker_are_left_out():
    old = impression()
    old.features_json = json.dumps({"ceiling": 1.0})
    assert row_from(old) is None


def test_visits_are_grouped_by_the_percentage_shown():
    rows = [
        row_from(impression(label=1, pct=80)),
        row_from(impression(label=0, pct=80)),
        row_from(impression(label=1, pct=85)),
        row_from(impression(label=0, pct=40)),
        row_from(impression(label=None, pct=40)),  # no report: not counted
    ]
    table = {name: (n, served, share) for name, n, served, share in calibration(rows)}
    assert table["70-95%"] == (3, 2, "67%")
    assert table["35-49%"] == (1, 0, "0%")
    assert table["5-34%"] == (0, 0, "-")


def test_the_csv_holds_the_columns_and_never_the_customer_key():
    buf = io.StringIO()
    write([row_from(impression(label=1))], buf)
    text = buf.getvalue()
    assert next(csv.reader(io.StringIO(text))) == list(COLUMNS)
    assert "device-key" not in text and "distance" not in text and "lat" not in text
