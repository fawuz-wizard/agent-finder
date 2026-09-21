from __future__ import annotations

from datetime import datetime, time, timedelta

from app.domain.visibility import AgentVisibilityInputs, NightSchedule, VisibilityDecision, decide

DAY = datetime(2026, 9, 14, 12, 0)
NIGHT = datetime(2026, 9, 14, 21, 0)
EARLY = datetime(2026, 9, 15, 6, 30)


def inputs(**kw):
    base = dict(is_open=True, hidden_by_agent=False, night=NightSchedule())
    base.update(kw)
    return AgentVisibilityInputs(**base)


def test_visible_by_day():
    assert decide(inputs(), DAY) is VisibilityDecision.VISIBLE


def test_closed_wins_over_everything():
    assert decide(inputs(is_open=False, hidden_by_agent=True), NIGHT) is VisibilityDecision.CLOSED


def test_hidden_by_agent():
    assert decide(inputs(hidden_by_agent=True), DAY) is VisibilityDecision.HIDDEN_BY_AGENT


def test_night_hides_across_midnight():
    assert decide(inputs(), NIGHT) is VisibilityDecision.HIDDEN_NIGHT
    assert decide(inputs(), EARLY) is VisibilityDecision.HIDDEN_NIGHT


def test_night_override_until():
    assert (
        decide(inputs(night_override_until=NIGHT + timedelta(hours=1)), NIGHT)
        is VisibilityDecision.VISIBLE
    )
    assert (
        decide(inputs(night_override_until=NIGHT - timedelta(minutes=1)), NIGHT)
        is VisibilityDecision.HIDDEN_NIGHT
    )


def test_night_disabled():
    assert decide(inputs(night=NightSchedule(enabled=False)), NIGHT) is VisibilityDecision.VISIBLE


def test_same_day_window():
    sched = NightSchedule(start=time(1, 0), end=time(5, 0))
    assert sched.is_night(datetime(2026, 9, 14, 3, 0))
    assert not sched.is_night(datetime(2026, 9, 14, 6, 0))
