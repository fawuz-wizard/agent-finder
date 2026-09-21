from __future__ import annotations


async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["service"] == "agent-finder-api"
    assert "X-Request-ID" in r.headers


async def test_api_v1_info_lists_resources(client):
    r = await client.get("/api/v1")
    assert r.status_code == 200
    res = r.json()["resources"]
    for name in (
        "search",
        "agents",
        "reports",
        "auth",
        "agent",
        "float-requests",
        "dealer",
        "financial",
        "audit",
    ):
        assert name in res


async def test_openapi_available(client):
    r = await client.get("/openapi.json")
    assert r.status_code == 200
    assert r.json()["info"]["title"] == "Agent Finder API"


async def test_error_envelope_on_404(client):
    r = await client.get("/api/v1/does-not-exist")
    assert r.status_code == 404
    body = r.json()
    assert body["error"]["code"] == "not_found"
    assert body["error"]["request_id"]


async def test_security_headers(client):
    r = await client.get("/health")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
    assert r.headers["Referrer-Policy"] == "no-referrer"


async def test_request_id_is_echoed(client):
    r = await client.get("/health", headers={"X-Request-ID": "abc-123"})
    assert r.headers["X-Request-ID"] == "abc-123"


async def test_cors_preflight_allows_client_key_header(client):
    """The browser sends X-Client on every request; refusing it in preflight breaks every user."""
    r = await client.options(
        "/api/v1/search",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-client,authorization",
        },
    )
    assert r.status_code == 200, r.text
    assert "x-client" in r.headers["access-control-allow-headers"].lower()
