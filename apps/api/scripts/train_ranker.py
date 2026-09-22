"""Fit the ranker from the training log and store the weights. Run on the API host:

    python -m scripts.train_ranker

Prints how many labelled visits taught the model and the log-loss before and after, so the
learning curve can be shown. Nothing is changed for customers until the next search."""

from __future__ import annotations

import asyncio
import json

from app.db.models import RankerModel, SearchImpression
from app.db.session import get_session_factory
from app.services.phrasing import now_utc
from app.services.ranker import DEFAULT_WEIGHTS, current_model, fit, log_loss
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
        before = await current_model(db)
        print(f"labelled visits: {len(rows)} · current: {before.label}")
        if len(rows) < MIN_ROWS:
            print(f"need at least {MIN_ROWS} to fit; keeping the current weights")
            return
        weights = fit(rows, start=before.weights)
        print(f"log-loss starting weights: {log_loss(rows, DEFAULT_WEIGHTS):.3f}")
        print(f"log-loss current weights:  {log_loss(rows, before.weights):.3f}")
        print(f"log-loss fitted weights:   {log_loss(rows, weights):.3f}")
        db.add(
            RankerModel(
                at=now_utc(),
                weights_json=json.dumps(weights),
                trained_on=len(rows),
                note="scripts/train_ranker.py",
            )
        )
        await db.commit()
        print("stored")


if __name__ == "__main__":
    asyncio.run(main())
