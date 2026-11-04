"""Error tracking is off without a DSN, and an error report never carries the person."""

from __future__ import annotations

from app.core.monitoring import init_monitoring, scrub
from app.core.settings import Settings


def test_off_without_a_dsn():
    assert init_monitoring(Settings(app_env="test", sentry_dsn=None)) is False
    assert init_monitoring(Settings(app_env="test", sentry_dsn="")) is False


def test_scrub_keeps_only_method_and_path():
    event = {
        "request": {
            "method": "POST",
            "url": "https://api.example/api/v1/search?lat=8.48&lng=-13.23",
            "data": {"pin": "1234", "lat": 8.48},
            "headers": {"Authorization": "Bearer secret", "X-Client": "device"},
            "cookies": {"s": "x"},
            "query_string": "lat=8.48&lng=-13.23",
            "env": {"REMOTE_ADDR": "10.0.0.1"},
        },
        "user": {"ip_address": "10.0.0.1"},
        "breadcrumbs": {"values": [{"message": "PIN 1234"}]},
        "exception": {"values": [{"type": "ValueError"}]},
    }
    out = scrub(event)
    assert out["request"] == {"method": "POST", "url": "https://api.example/api/v1/search"}
    assert "user" not in out and "breadcrumbs" not in out
    assert out["exception"] == {"values": [{"type": "ValueError"}]}
    assert "1234" not in str(out) and "8.48" not in str(out) and "secret" not in str(out)


def test_scrub_without_a_request():
    assert scrub({"message": "boom"}) == {"message": "boom"}


def test_starts_with_a_dsn_and_the_app_still_builds():
    """Sentry 2.19 crashed on start with this Starlette; switching it on must not stop the API."""
    import sentry_sdk
    from app.main import create_app

    settings = Settings(app_env="test", sentry_dsn="http://public@127.0.0.1:9/1")
    try:
        assert init_monitoring(settings) is True
        assert create_app(settings) is not None
    finally:
        sentry_sdk.get_client().close(timeout=0)
        sentry_sdk.init(dsn=None)


def test_reports_under_the_same_release_and_environment_as_the_web_apps():
    import sentry_sdk

    settings = Settings(app_env="test", sentry_dsn="http://public@127.0.0.1:9/1")
    try:
        init_monitoring(settings)
        options = sentry_sdk.get_client().options
        assert options["release"] == "agent-finder@" + settings.app_version
        assert options["environment"] == "test"
    finally:
        sentry_sdk.get_client().close(timeout=0)
        sentry_sdk.init(dsn=None)


def test_the_server_and_the_web_apps_carry_the_same_version():
    """Both report as agent-finder@<version>; the numbers must move together."""
    import json
    from pathlib import Path

    web = Path(__file__).resolve().parents[2] / "web" / "package.json"
    assert json.loads(web.read_text())["version"] == Settings(app_env="test").app_version
