"""Error tracking with Sentry, off unless SENTRY_DSN is set.

What leaves the server is the error, the route and the release. Request bodies, headers,
cookies, query strings, the client's address and any user never do: a search carries a
customer's position and a sign-in carries a PIN, and neither belongs in an error report.
"""

from __future__ import annotations

from typing import Any

from app.core.settings import Settings

KEPT_REQUEST_FIELDS = ("method", "url")


def scrub(event: dict[str, Any], _hint: dict[str, Any] | None = None) -> dict[str, Any]:
    """Keep only the method and the path of the request; drop everything about the person."""
    request = event.get("request")
    if isinstance(request, dict):
        kept = {k: request[k] for k in KEPT_REQUEST_FIELDS if k in request}
        if isinstance(kept.get("url"), str):
            kept["url"] = kept["url"].split("?", 1)[0]
        event["request"] = kept
    event.pop("user", None)
    event.pop("breadcrumbs", None)
    return event


def init_monitoring(settings: Settings) -> bool:
    """Start Sentry when a DSN is configured. Returns whether it started."""
    if not settings.sentry_dsn:
        return False
    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.app_env,
        server_name=settings.app_name,  # never the machine's own name
        release=f"{settings.app_name}@{settings.app_version}",
        send_default_pii=False,
        max_request_body_size="never",
        traces_sample_rate=0.0,
        before_send=scrub,
    )
    return True
