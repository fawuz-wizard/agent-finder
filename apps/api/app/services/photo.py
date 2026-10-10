"""The shop's photo: one JPEG or PNG the agent took on the phone, shrunk there before it was
sent. The server checks what it is and how big, nothing more."""

from __future__ import annotations

import base64
import binascii
from datetime import datetime

from app.core.errors import AppError

PHOTO_MAX_BYTES = 400_000  # a 1024 px JPEG at quality 0.75 is well under this

_MAGIC = {
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"RIFF": "image/webp",
}


def decode_photo(data_url: str) -> bytes:
    """A data URL (data:image/jpeg;base64,...) or a bare base64 body, to bytes. Refuses
    anything that is not a picture, or too big to be one that was shrunk on the phone."""
    body = data_url.split(",", 1)[1] if data_url.startswith("data:") else data_url
    try:
        raw = base64.b64decode(body, validate=True)
    except (binascii.Error, ValueError):
        raise AppError("That is not a picture the app can read.", code="bad_photo") from None
    if mime_of(raw) is None:
        raise AppError("That is not a picture the app can read.", code="bad_photo")
    if len(raw) > PHOTO_MAX_BYTES:
        raise AppError("That picture is too big. Take it again in the app.", code="photo_too_big")
    return raw


def mime_of(raw: bytes) -> str | None:
    for magic, mime in _MAGIC.items():
        if raw.startswith(magic):
            if mime == "image/webp" and raw[8:12] != b"WEBP":
                continue
            return mime
    return None


def to_data_url(raw: bytes | None) -> str | None:
    if not raw:
        return None
    return f"data:{mime_of(raw) or 'image/jpeg'};base64,{base64.b64encode(raw).decode()}"


def public_photo_url(agent) -> str | None:
    """Where a customer's app fetches the picture, with the time as a cache key."""
    if not agent.photo:
        return None
    at: datetime | None = agent.photo_at
    public_id = agent.ref.replace("Agent ", "af-")
    return f"/api/v1/agents/{public_id}/photo?v={int(at.timestamp()) if at else 0}"
