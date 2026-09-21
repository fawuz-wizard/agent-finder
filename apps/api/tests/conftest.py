from __future__ import annotations

import os
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

os.environ["APP_ENV"] = "test"
os.environ["OPERATOR_ADAPTER"] = "fake"

from app.core.settings import get_settings  # noqa: E402
from app.db import session as dbsession  # noqa: E402
from app.main import create_app  # noqa: E402


@pytest.fixture
async def client(tmp_path):
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
