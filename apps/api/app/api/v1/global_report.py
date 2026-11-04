"""Orange's daily Global Report, uploaded in the national console.

Two steps, so nothing changes by surprise:
1. Upload: the file is read, cleaned and compared with what is on record. The answer says what
   applying would do (new agents, updates, deactivations, locations, agents the report no
   longer lists) and which rows have problems, by row number and issue, never a value. Nothing
   in the network changes yet.
2. Apply (or discard): a person reads the preview and applies it. Aggregators, agents, their
   status, Orange's location for each shop and the day's figures are written in one go.

The same file twice is one upload. A report listing far fewer active agents than are on record
(a cut-off file) waits for an explicit confirmation before it is applied. The raw file is
never stored: only the cleaned rows, without the personal columns, until applied or discarded.
"""

from __future__ import annotations

import hashlib
import json
import re
import secrets
from dataclasses import asdict
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Header, Query, Request
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import Principal, require_permission
from app.core.errors import AppError, NotFoundError
from app.core.settings import get_settings
from app.db.models import ReportImport
from app.db.session import get_session
from app.services import orange_report
from app.services.orange_report import RowResult, UnreadableFileError

router = APIRouter(prefix="/national/reports", tags=["global report"])

PERMISSION = "IMPORT_GLOBAL_REPORT"
MAX_BYTES = 10 * 1024 * 1024  # a national report is a few megabytes
# Applying a report that lists fewer than this share of the active agents on record needs a
# second, explicit yes: a cut-off file must never quietly mark the network missing.
SHRINK_GUARD = 0.8


class ApplyBody(BaseModel):
    confirm_shrink: bool = False


def _today() -> date:
    return datetime.now(ZoneInfo(get_settings().app_timezone)).date()


def _safe_name(name: str | None) -> str:
    """A file name for the history list: plain characters only, never a path."""
    base = (name or "report").replace("\\", "/").rsplit("/", 1)[-1]
    return re.sub(r"[^A-Za-z0-9 ._()-]", "_", base)[:120] or "report"


def _out(r: ReportImport) -> dict:
    return {
        "id": r.id,
        "report_date": r.report_date.isoformat(),
        "file_name": r.file_name,
        "size_bytes": r.size_bytes,
        "uploaded_at": _aware(r.uploaded_at).isoformat(),
        "uploaded_by": r.uploaded_by,
        "status": r.status,
        "applied_at": _aware(r.applied_at).isoformat() if r.applied_at else None,
        "applied_by": r.applied_by,
        "summary": json.loads(r.summary),
    }


def _aware(at: datetime) -> datetime:
    return at if at.tzinfo else at.replace(tzinfo=UTC)


async def _read_body(request: Request) -> bytes:
    """The upload, refused as soon as it passes MAX_BYTES (never read whole first)."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_BYTES:
        raise _too_big()
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > MAX_BYTES:
            raise _too_big()
    if not data:
        raise AppError("Choose the report file first.", code="validation", status_code=422)
    return bytes(data)


def _too_big() -> AppError:
    return AppError(
        "That file is larger than 10 MB. Send the report as Excel (.xlsx) or CSV.",
        code="too_large",
        status_code=413,
    )


@router.post("", status_code=201, summary="Upload Orange's Global Report: read and preview it")
async def upload(
    request: Request,
    report_date: date | None = Query(default=None, description="The day the report covers"),
    x_file_name: str | None = Header(default=None),
    p: Principal = Depends(require_permission(PERMISSION)),
    db: AsyncSession = Depends(get_session),
) -> dict:
    data = await _read_body(request)
    digest = hashlib.sha256(data).hexdigest()
    same = (
        await db.execute(select(ReportImport).where(ReportImport.sha256 == digest))
    ).scalar_one_or_none()
    if same is not None:
        return {**_out(same), "duplicate": True}
    day = report_date or _today()
    if day > _today():
        raise AppError(
            "The report's day cannot be in the future.", code="validation", status_code=422
        )
    try:
        rows = orange_report.read_upload(data)
    except UnreadableFileError as e:
        raise AppError(str(e), code="unreadable", status_code=422) from None
    missing = orange_report.missing_headers(rows)
    if missing:
        raise AppError(
            "This file does not look like Orange's agent report: it has no column "
            + ", ".join(missing)
            + ".",
            code="unreadable",
            status_code=422,
        )
    results = orange_report.validate(rows, digest[:12])
    summary = orange_report.report(results)
    summary["columns"] = orange_report.columns_found(rows)
    summary["changes"] = await orange_report.preview(db, results)
    record = ReportImport(
        id=f"gr-{secrets.token_hex(8)}",
        sha256=digest,
        report_date=day,
        file_name=_safe_name(x_file_name),
        size_bytes=len(data),
        uploaded_at=datetime.now(UTC),
        uploaded_by=p.name,
        uploaded_by_id=p.subject,
        status="previewed",
        summary=json.dumps(summary),
        rows=json.dumps([asdict(r) for r in results]),
    )
    db.add(record)
    await db.commit()
    return {**_out(record), "duplicate": False}


@router.get("", summary="Global Reports uploaded so far, newest first")
async def history(
    p: Principal = Depends(require_permission(PERMISSION)),
    db: AsyncSession = Depends(get_session),
) -> list[dict]:
    rows = (
        await db.execute(select(ReportImport).order_by(ReportImport.uploaded_at.desc()).limit(60))
    ).scalars()
    return [_out(r) for r in rows]


async def _load(db: AsyncSession, import_id: str) -> ReportImport:
    r = await db.get(ReportImport, import_id)
    if r is None:
        raise NotFoundError("Not available.")
    return r


@router.get("/{import_id}", summary="One uploaded report and its preview")
async def one(
    import_id: str,
    p: Principal = Depends(require_permission(PERMISSION)),
    db: AsyncSession = Depends(get_session),
) -> dict:
    return _out(await _load(db, import_id))


async def _claim(db: AsyncSession, import_id: str, to: str) -> None:
    """previewed → `to`, only if still previewed: two people applying at once get one winner
    and a clear answer for the other."""
    moved = await db.execute(
        update(ReportImport)
        .where(ReportImport.id == import_id, ReportImport.status == "previewed")
        .values(status=to)
        .execution_options(synchronize_session=False)
    )
    await db.commit()
    if moved.rowcount != 1:
        r = await _load(db, import_id)
        raise AppError(
            f"This report was already {r.status}.", code="report_" + r.status, status_code=409
        )


@router.post("/{import_id}/apply", summary="Apply a previewed report to the network")
async def apply(
    import_id: str,
    body: ApplyBody,
    p: Principal = Depends(require_permission(PERMISSION)),
    db: AsyncSession = Depends(get_session),
) -> dict:
    r = await _load(db, import_id)
    summary = json.loads(r.summary)
    changes = summary.get("changes", {})
    active = changes.get("active_on_record", 0)
    in_file = changes.get("counts", {}).get("updated", 0)
    if active and in_file < SHRINK_GUARD * active and not body.confirm_shrink:
        raise AppError(
            f"This report lists {in_file} of the {active} active agents on record. If that is "
            "right, apply it again and confirm; if the file was cut off, ask Orange for it again.",
            code="report_shrunk",
            status_code=409,
        )
    await _claim(db, import_id, "applying")
    try:
        results = [RowResult(**row) for row in json.loads(r.rows or "[]")]
        created = await orange_report.apply(db, results)
        days = await orange_report.record_day(db, results, r.report_date, r.id)
        r = await _load(db, import_id)
        summary["applied"] = created | {"daily_figures": days}
        r.summary = json.dumps(summary)
        r.status = "applied"
        r.rows = None  # the cleaned rows are in the network now; no second copy is kept
        r.applied_at = datetime.now(UTC)
        r.applied_by = p.name
        await db.commit()
    except Exception:
        await db.rollback()
        await db.execute(
            update(ReportImport).where(ReportImport.id == import_id).values(status="previewed")
        )
        await db.commit()
        raise
    return _out(r)


@router.post("/{import_id}/discard", summary="Set a previewed report aside without applying it")
async def discard(
    import_id: str,
    p: Principal = Depends(require_permission(PERMISSION)),
    db: AsyncSession = Depends(get_session),
) -> dict:
    await _claim(db, import_id, "discarded")
    r = await _load(db, import_id)
    r.rows = None
    await db.commit()
    return _out(r)
