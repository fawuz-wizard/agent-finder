from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime

import pytest
from httpx import ASGITransport, AsyncClient

os.environ["APP_ENV"] = "test"
os.environ["OPERATOR_ADAPTER"] = "fake"

from app.core.settings import get_settings  # noqa: E402
from app.db import session as dbsession  # noqa: E402
from app.main import create_app  # noqa: E402

# Seeded agents run night mode 07:00–20:00 UTC. Every request and the seed itself read the
# clock through now_utc(), so tests pin it to midday: the suite is green at any hour.
FROZEN_NOW = datetime.now(UTC).replace(hour=12, minute=0, second=0, microsecond=0)

CLOCK_MODULES = (
    "app.services.phrasing",
    "app.seed",
    "app.api.v1.agent_app",
    "app.api.v1.agents",
    "app.api.v1.dealer",
    "app.api.v1.float_requests",
    "app.api.v1.reports",
    "app.api.v1.search",
)


class Clock:
    """The pinned clock, with a way for a test to move it forward between steps."""

    def __init__(self) -> None:
        self.now = FROZEN_NOW

    def advance(self, minutes: int) -> datetime:
        from datetime import timedelta

        self.now = self.now + timedelta(minutes=minutes)
        return self.now


@pytest.fixture(autouse=True)
def frozen_clock(monkeypatch):
    import importlib

    clock = Clock()
    for name in CLOCK_MODULES:
        monkeypatch.setattr(importlib.import_module(name), "now_utc", lambda: clock.now)
    return clock


@pytest.fixture
async def client(tmp_path, frozen_clock):
    """Every test gets its own fresh, seeded database file."""
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path}/test-{uuid.uuid4().hex[:8]}.db"
    get_settings.cache_clear()
    await dbsession.dispose_engine()
    app = create_app()
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c
    await dbsession.dispose_engine()


@pytest.fixture
async def agent(client):
    r = await client.post(
        "/api/v1/auth/sign-in", json={"ref": "Agent 024", "pin": "1234", "role": "agent"}
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture
async def dealer(client):
    r = await client.post(
        "/api/v1/auth/sign-in", json={"ref": "kissy", "pin": "1234", "role": "dealer"}
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}
