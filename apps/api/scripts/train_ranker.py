"""Fit the ranker from the training log and store the weights. Run on the API host:

    python -m scripts.train_ranker

Searches under the 7-day rule log the 7-day facts; the visit report that follows labels the
row. Those rows train the learned ranker (RANKER=learned), and the script prints how well the
rule itself predicted the same visits beside the learned weights, so the switch is made only
when the learning beats the rule. Rows from the older activity ranker train that one as before.
Nothing is changed for customers until the next search."""

from __future__ import annotations

import asyncio
import json

from app.db.models import RankerModel, SearchImpression
from app.db.session import get_session_factory
from app.services.phrasing import now_utc
from app.services.ranker import (
    DEFAULT_WEIGHTS,
    WEEK_DEFAULT_WEIGHTS,
    WEEK_FEATURES,
    current_model,
    current_week_model,
    fit,
    log_loss,
    rule_log_loss,
)
from sqlalchemy import select

MIN_ROWS = 30


async def main() -> None:
    async with get_session_factory()() as db:
        rows = [
            (json.loads(i.features_json), int(i.label))
            for i in (
                await db.execute(
                    select(SearchImpression).where(SearchImpression.label.is_not(None))
                )
            )
            .scalars()
            .all()
        ]
        week_rows = [r for r in rows if "days_worked" in r[0]]
        activity_rows = [r for r in rows if "days_worked" not in r[0]]
        stored = False
        if week_rows:
            before = await current_week_model(db)
            print(f"7-day facts: {len(week_rows)} labelled visits · current: {before.label}")
            if len(week_rows) < MIN_ROWS:
                print(f"need at least {MIN_ROWS} to fit; keeping the current weights")
            else:
                weights = fit(week_rows, start=before.weights, keys=WEEK_FEATURES)
                rule = rule_log_loss(week_rows)
                learnt = log_loss(week_rows, weights, WEEK_FEATURES)
                start = log_loss(week_rows, WEEK_DEFAULT_WEIGHTS, WEEK_FEATURES)
                print(f"log-loss of the 7-day rule:  {rule:.3f}")
                print(f"log-loss starting weights:   {start:.3f}")
                print(f"log-loss learned weights:    {learnt:.3f}")
                verdict = "yes: RANKER=learned can be switched on" if learnt < rule else "not yet"
                print(f"beats the rule: {verdict}")
                db.add(
                    RankerModel(
                        at=now_utc(),
                        weights_json=json.dumps(weights),
                        trained_on=len(week_rows),
                        note="scripts/train_ranker.py · 7-day facts",
                    )
                )
                stored = True
        if activity_rows:
            before = await current_model(db)
            n = len(activity_rows)
            print(f"activity ranker: {n} labelled visits · current: {before.label}")
            if len(activity_rows) < MIN_ROWS:
                print(f"need at least {MIN_ROWS} to fit; keeping the current weights")
            else:
                weights = fit(activity_rows, start=before.weights)
                print(f"log-loss starting weights: {log_loss(activity_rows, DEFAULT_WEIGHTS):.3f}")
                print(f"log-loss current weights:  {log_loss(activity_rows, before.weights):.3f}")
                print(f"log-loss fitted weights:   {log_loss(activity_rows, weights):.3f}")
                db.add(
                    RankerModel(
                        at=now_utc(),
                        weights_json=json.dumps(weights),
                        trained_on=len(activity_rows),
                        note="scripts/train_ranker.py",
                    )
                )
                stored = True
        if not stored:
            return
        await db.commit()
        print("stored")


if __name__ == "__main__":
    asyncio.run(main())
