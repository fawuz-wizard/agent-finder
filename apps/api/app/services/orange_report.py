"""Orange's aggregator and agent file (the Global Report): read, validate, clean, and apply.

Used by the team's script (scripts/import_orange.py) and by the Global Report upload in the
national console (app/api/v1/global_report.py), so both clean a file the same way. Reads .xlsx
without any extra library and .csv in the team's cleaned shape. Validation names row numbers
and issue codes, never a value. Personal columns (date of birth, ID numbers, email, contact
person) are never read into the database. Every imported row carries the file's hash and its
row number.
"""

from __future__ import annotations

import io
import re
import secrets
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import hash_pin
from app.db.models import Agent, Dealer
from app.services.towns import region_for

AGENT_PERMS = ""
AGGREGATOR_PERMS = (
    "VIEW_AGENT,VIEW_AGENT_FINANCIAL_DETAIL,MANAGE_FLOAT_REQUEST,VIEW_AGENT_HISTORY,"
    "CONTACT_AGENT,ESCALATE_AGENT,MANAGE_AGENT"
)


# A real report is a few megabytes unpacked; a file that claims far more is refused before
# it is read (a "zip bomb" would otherwise fill the server's memory).
MAX_UNPACKED = 80 * 1024 * 1024


class UnreadableFileError(ValueError):
    """The file is not one this code can read as Orange's report. The message names the
    problem, never a value from the file."""


def read_xlsx(path: Path | bytes) -> list[dict[str, str]]:
    """First sheet as a list of {header: value}; empty cells are empty strings."""
    try:
        z = zipfile.ZipFile(io.BytesIO(path) if isinstance(path, bytes) else path)
    except zipfile.BadZipFile as e:
        raise UnreadableFileError("This is not an Excel (.xlsx) file.") from e
    names = z.namelist()
    if "xl/worksheets/sheet1.xml" not in names:
        raise UnreadableFileError("The Excel file has no first sheet.")
    if sum(i.file_size for i in z.infolist()) > MAX_UNPACKED:
        raise UnreadableFileError("The Excel file is too large once opened.")
    shared: list[str] = []
    if "xl/sharedStrings.xml" in z.namelist():
        ss = z.read("xl/sharedStrings.xml").decode("utf-8", "ignore")
        shared = [re.sub(r"<[^>]+>", "", m) for m in re.findall(r"<si>(.*?)</si>", ss, re.S)]
    sheet = z.read("xl/worksheets/sheet1.xml").decode("utf-8", "ignore")
    rows: list[dict[str, str]] = []
    for rm in re.finditer(r"<row[^>]*>(.*?)</row>", sheet, re.S):
        cells: dict[str, str] = {}
        for cm in re.finditer(r'<c r="([A-Z]+)\d+"([^>]*?)(?:/>|>(.*?)</c>)', rm.group(1), re.S):
            col, attrs, inner = cm.group(1), cm.group(2), cm.group(3) or ""
            v = re.search(r"<v>(.*?)</v>", inner, re.S)
            t = re.search(r't="(\w+)"', attrs)
            if v:
                val = v.group(1)
                if t and t.group(1) == "s":
                    val = shared[int(val)]
            else:
                isv = re.search(r"<is>.*?<t[^>]*>(.*?)</t>", inner, re.S)
                val = isv.group(1) if isv else ""
            cells[col] = val.strip()
        rows.append(cells)
    if not rows:
        return []
    header = rows[0]
    cols = sorted(header, key=lambda c: (len(c), c))
    return [{header[c]: r.get(c, "") for c in cols} for r in rows[1:]]


def readable(text: str) -> str:
    """Orange's export shouts some addresses (KISSI TOWN WATERLOO). Customers and aggregators
    read them the way a person writes them; a mixed-case address is left exactly as given."""
    return text.title() if text and text == text.upper() else text


def clean_city(city: str) -> str | None:
    c = " ".join(city.strip().split())
    if not c or re.search(r"\d", c) or c.lower() in ("sierra leone", "sl", "city"):
        return None
    return c.title()


def normalise_msisdn(raw: str) -> str | None:
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 9 and digits.startswith("0"):
        digits = digits[1:]
    if len(digits) == 8:
        return "+232" + digits
    if len(digits) == 11 and digits.startswith("232"):
        return "+" + digits
    return None


def to_float(raw: str) -> float | None:
    try:
        return float(raw)
    except ValueError:
        return None


@dataclass
class RowResult:
    row: int  # 1-based row number in the sheet (header is row 1)
    kind: str  # agent | subaggregator | header | empty | invalid
    issues: list[str] = field(default_factory=list)
    agent: dict | None = None
    aggregator: dict | None = None
    ref: str | None = None  # the agent's ref once applied


def norm(header: str) -> str:
    """'Gps_Latitude ' → 'GPS LATITUDE': one spelling for a column, however it is typed."""
    return " ".join(re.sub(r"[_\-.]+", " ", header).upper().split())


# Columns the daily Global Report may carry beyond the first file: found by name, whatever
# order they come in; a column the report does not have is simply not used.
OPTIONAL = {
    "lat": ("LATITUDE", "LAT", "GPS LATITUDE", "GPS LAT", "AGENT LATITUDE"),
    "lng": ("LONGITUDE", "LONG", "LNG", "LON", "GPS LONGITUDE", "GPS LONG", "AGENT LONGITUDE"),
    "float": ("FLOAT", "E FLOAT", "EFLOAT", "FLOAT BALANCE", "BALANCE", "E VALUE", "EVALUE"),
    "commission": ("COMMISSION", "COMM", "COMMISSION EARNED", "TOTAL COMMISSION"),
    "cash_in": ("CASH IN", "CASHIN", "CI", "CASH IN VALUE", "CI VALUE"),
    "cash_out": ("CASH OUT", "CASHOUT", "CO", "CASH OUT VALUE", "CO VALUE"),
    "tx_count": ("TRNX COUNT", "TRANSACTION COUNT", "TX COUNT", "TRANSACTIONS", "TXN COUNT"),
}
# The first file named its month in the column ("APR CI"): any month is accepted.
MONTH_COLUMN = re.compile(r"^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]* (CI|CO)$")
# Sierra Leone, with a margin: a point outside is a typo, not a shop.
SL_BOUNDS = (6.85, 10.05, -13.35, -10.25)


def pick(row: dict[str, str], name: str) -> str:
    """The value of an optional column under any of its spellings, or ''."""
    keys = {norm(k): k for k in row}
    for alias in OPTIONAL[name]:
        if alias in keys and row[keys[alias]].strip():
            return row[keys[alias]].strip()
    if name in ("cash_in", "cash_out"):
        want = "CI" if name == "cash_in" else "CO"
        for k, original in keys.items():
            m = MONTH_COLUMN.match(k)
            if m and m.group(2) == want and row[original].strip():
                return row[original].strip()
    return ""


def columns_found(rows: list[dict[str, str]]) -> dict[str, bool]:
    """Which optional columns this report has, by header (not by value)."""
    headers = {norm(k) for r in rows[:1] for k in r}
    found = {name: any(a in headers for a in aliases) for name, aliases in OPTIONAL.items()}
    for want, name in (("CI", "cash_in"), ("CO", "cash_out")):
        found[name] = found[name] or any(
            (m := MONTH_COLUMN.match(h)) and m.group(2) == want for h in headers
        )
    return {
        "coordinates": found["lat"] and found["lng"],
        "float": found["float"],
        "commission": found["commission"],
        "activity": found["cash_in"] or found["cash_out"] or found["tx_count"],
    }


def point_of(row: dict[str, str]) -> tuple[float, float] | None | str:
    """(lat, lng) inside Sierra Leone; None when the report has no point for the row; 'bad'
    when it has one that cannot be right (not a number, swapped, or outside the country)."""
    lat_raw, lng_raw = pick(row, "lat"), pick(row, "lng")
    if not lat_raw and not lng_raw:
        return None
    lat, lng = to_float(lat_raw), to_float(lng_raw)
    if lat is None or lng is None or lat != lat or lng != lng:  # NaN
        return "bad"
    lo_lat, hi_lat, lo_lng, hi_lng = SL_BOUNDS
    if not (lo_lat <= lat <= hi_lat and lo_lng <= lng <= hi_lng):
        return "bad"
    return round(lat, 6), round(lng, 6)


# The team's cleaned sheet: one row per agent with plain column names. Mapped onto the
# export's names so validation and import are the same code path for both.
CLEAN_COLUMNS = {
    "aggregator": "PARENT_FIRST_NAME",
    "aggregator_phone": "PARENT_USER_MSISDN",
    "agent_code": "AGENT_CODE",
    "agent_name": "USER_FIRST_NAME",
    "phone": "MSISDN",
    "city": "CITY",
    "address": "ADDRESS1",
    "registered": "REGISTERED_ON",
    "status": "ACCOUNT_STATUS",
    "grade": "USER_CATEGORY_CODE",
    "trnx_count": "TRNX COUNT",
    "apr_ci": "APR CI",
    "apr_co": "APR CO",
}
STATUS_WORDS = {"active": "Y", "inactive": "N", "y": "Y", "n": "N"}
GRADE_WORDS = {
    "agent": "AGNT",
    "sub-agent": "SUBAGG",
    "subagent": "SUBAGG",
    "sub-aggregator": "SUBAGG",
}


def read_csv(path: Path | bytes) -> list[dict[str, str]]:
    """The team's cleaned sheet (plain column names), or Orange's report saved as CSV (its own
    column names, read like the .xlsx)."""
    import csv

    raw = path if isinstance(path, bytes) else Path(path).read_bytes()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1252", errors="replace")  # Excel's own "CSV" on Windows
    reader = csv.DictReader(io.StringIO(text, newline=""))
    fields = set(reader.fieldnames or [])
    if not fields:
        raise UnreadableFileError("The CSV file has no header row.")
    if not set(CLEAN_COLUMNS) <= fields:
        if {"AGENT_CODE", "MSISDN"} & {norm(f).replace(" ", "_") for f in fields}:
            return canonical([{k: (v or "").strip() for k, v in r.items() if k} for r in reader])
        raise UnreadableFileError(
            "This file does not look like Orange's agent report: it has no column "
            "PARENT_USER_MSISDN, MSISDN, AGENT_CODE (nor the team's cleaned-sheet columns)."
        )
    rows = []
    for r in reader:
        m = {CLEAN_COLUMNS[k]: (v or "").strip() for k, v in r.items() if k in CLEAN_COLUMNS}
        m["ACCOUNT_STATUS"] = STATUS_WORDS.get(m["ACCOUNT_STATUS"].lower(), m["ACCOUNT_STATUS"])
        m["USER_CATEGORY_CODE"] = GRADE_WORDS.get(
            m["USER_CATEGORY_CODE"].lower(), m["USER_CATEGORY_CODE"]
        )
        m["USER_TYPE"] = "CHANNEL"
        # Optional columns pass through under their own names, read by pick().
        for k, v in r.items():
            if k and k not in CLEAN_COLUMNS:
                m[k] = (v or "").strip()
        rows.append(m)
    return rows


def read_table(path: Path) -> list[dict[str, str]]:
    """Orange's .xlsx export or the team's cleaned .csv, as the same rows."""
    return read_csv(path) if path.suffix.lower() == ".csv" else read_xlsx(path)


def read_upload(data: bytes) -> list[dict[str, str]]:
    """An uploaded file, told apart by its content, not its name: an .xlsx is a zip archive;
    anything else must be text (CSV)."""
    if data[:4] == b"PK\x03\x04":
        return canonical(read_xlsx(data))
    if b"\x00" in data[:4096]:
        raise UnreadableFileError("This is not an Excel or CSV file.")
    return canonical(read_csv(data))


REQUIRED_HEADERS = ("PARENT_USER_MSISDN", "MSISDN", "AGENT_CODE")
# Orange's own column names this code reads; a report may type them in another case or with
# spaces ("Agent Code"), so they are brought to one spelling first.
KNOWN_HEADERS = {
    *REQUIRED_HEADERS,
    "USER_TYPE", "USER_CATEGORY_CODE", "CITY", "ADDRESS1", "ACCOUNT_STATUS",
    "USER_FIRST_NAME", "USER_LAST_NAME", "PARENT_FIRST_NAME", "PARENT_LAST_NAME",
}  # fmt: skip


def canonical(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    def key(k: str) -> str:
        n = norm(k).replace(" ", "_")
        return n if n in KNOWN_HEADERS else k

    return [{key(k): v for k, v in r.items()} for r in rows]


def missing_headers(rows: list[dict[str, str]]) -> list[str]:
    """Columns the report must have, by Orange's names; none of the file's values."""
    if not rows:
        return list(REQUIRED_HEADERS)
    have = {norm(k).replace(" ", "_") for k in rows[0]}
    return [h for h in REQUIRED_HEADERS if h not in have]


def once(name: str) -> str:
    """'Abjatal Enterprise Abjatal Enterprise' → 'Abjatal Enterprise': the export repeats a
    business name in both name columns."""
    words = name.split()
    half = len(words) // 2
    if half and words[:half] == words[half:]:
        return " ".join(words[:half])
    return name


def validate(rows: list[dict[str, str]], file_tag: str) -> list[RowResult]:
    out: list[RowResult] = []
    seen_codes: dict[str, int] = {}
    seen_msisdns: dict[str, int] = {}
    for i, r in enumerate(rows, start=2):
        res = RowResult(row=i, kind="agent")
        if not any(v for v in r.values()):
            res.kind = "empty"
            out.append(res)
            continue
        if r.get("USER_TYPE") == "USER_TYPE":
            res.kind = "header"
            res.issues.append("repeated_header")
            out.append(res)
            continue
        cat = r.get("USER_CATEGORY_CODE", "")
        if cat == "SUBAGG":
            res.kind = "subaggregator"
        elif cat != "AGNT":
            res.kind = "invalid"
            res.issues.append("unknown_category")
        parent = normalise_msisdn(r.get("PARENT_USER_MSISDN", ""))
        if parent is None:
            res.issues.append("no_aggregator")
        msisdn = normalise_msisdn(r.get("MSISDN", ""))
        if msisdn is None:
            res.issues.append("bad_msisdn")
        elif msisdn in seen_msisdns:
            res.issues.append("duplicate_msisdn")
        else:
            seen_msisdns[msisdn] = i
        code = r.get("AGENT_CODE", "").strip()
        if not re.fullmatch(r"\d{6}", code):
            res.issues.append("bad_agent_code")
        elif code in seen_codes:
            res.issues.append("duplicate_agent_code")
        else:
            seen_codes[code] = i
        city = clean_city(r.get("CITY", ""))
        if city is None:
            res.issues.append("no_city")
        region = region_for(city or "")
        if region is None:
            res.issues.append("region_unknown")
        first = once(" ".join(r.get("USER_FIRST_NAME", "").split()).title())
        last = once(" ".join(r.get("USER_LAST_NAME", "").split()).title())
        if not (first or last):
            res.issues.append("no_name")
        status = r.get("ACCOUNT_STATUS", "").strip().upper()
        if status not in ("Y", "N"):
            res.issues.append("bad_status")
        # The address is what a customer reads under the shop name: it must be a real one.
        address = " ".join(r.get("ADDRESS1", "").split())
        if not address:
            res.issues.append("no_address")
        elif city and address.lower() == city.lower():
            res.issues.append("address_is_city_only")
        elif len(address) < 6 or not re.search(r"[a-z]", address, re.I):
            res.issues.append("short_address")
        if re.search(r"\d", first + last):
            res.issues.append("name_has_digits")
        point = point_of(r)
        if point == "bad":
            res.issues.append("bad_coordinates")
        res.aggregator = {
            "msisdn": parent,
            # Orange's export repeats a business name in both name columns; say it once.
            "name": " ".join(
                dict.fromkeys(
                    x
                    for x in (
                        r.get("PARENT_FIRST_NAME", "").title(),
                        r.get("PARENT_LAST_NAME", "").title(),
                    )
                    if x
                )
            ).strip()
            or "Aggregator",
            "region": region,
        }
        res.agent = {
            "agent_code": code if re.fullmatch(r"\d{6}", code) else None,
            "msisdn": msisdn,
            "person_name": once(f"{first} {last}".strip()),
            "street": readable(" ".join(r.get("ADDRESS1", "").split()))[:120]
            or (city or "Unknown"),
            "city": city,
            "region": region,
            "active": status == "Y",
            "cash_in": to_float(pick(r, "cash_in")),
            "cash_out": to_float(pick(r, "cash_out")),
            "tx_count": to_float(pick(r, "tx_count")),
            "float_balance": to_float(pick(r, "float")),
            "commission": to_float(pick(r, "commission")),
            "lat": point[0] if isinstance(point, tuple) else None,
            "lng": point[1] if isinstance(point, tuple) else None,
            "source_row": f"{file_tag}:{i}",
        }
        out.append(res)
    return out


BLOCKING = {
    "repeated_header",
    "unknown_category",
    "no_aggregator",
    "bad_agent_code",
    "duplicate_agent_code",
    "duplicate_msisdn",
}


# What an aggregator reads against a row the import could not verify. Clean rows are verified
# and shown to customers once pinned; rows with any of these wait for someone to check them.
PENDING_TEXT = {
    "bad_msisdn": "Orange Money number is not 8 digits",
    "no_city": "no city",
    "region_unknown": "region unknown",
    "no_name": "no name",
    "bad_status": "status not Y or N",
    "no_address": "no address",
    "address_is_city_only": "address is only the city",
    "short_address": "address too short",
    "name_has_digits": "name contains digits",
    "bad_coordinates": "location in the report is not in Sierra Leone",
}


def pending_note(issues: list[str]) -> str | None:
    """None for a clean row; otherwise the reasons, in the file's words, never its values."""
    if not issues:
        return None
    return "Pending: " + "; ".join(PENDING_TEXT.get(i, i.replace("_", " ")) for i in issues)


def importable(res: RowResult) -> bool:
    return res.kind in ("agent", "subaggregator") and not (set(res.issues) & BLOCKING)


def report(results: list[RowResult]) -> dict:
    counts = {k: 0 for k in ("agent", "subaggregator", "header", "empty", "invalid")}
    issues: dict[str, int] = {}
    rows_with_issues = []
    for res in results:
        counts[res.kind] += 1
        for code in res.issues:
            issues[code] = issues.get(code, 0) + 1
        if res.issues:
            rows_with_issues.append(
                {
                    "row": res.row,
                    "kind": res.kind,
                    "issues": res.issues,
                    "importable": importable(res),
                }
            )
    aggregators = {
        res.aggregator["msisdn"] for res in results if res.aggregator and res.aggregator["msisdn"]
    }
    regions: dict[str, int] = {}
    for res in results:
        if res.agent and importable(res):
            regions[res.agent["region"] or "unknown"] = (
                regions.get(res.agent["region"] or "unknown", 0) + 1
            )
    return {
        "rows": len(results),
        "by_kind": counts,
        "aggregators": len(aggregators),
        "importable": sum(1 for res in results if importable(res)),
        "held_back": sum(
            1 for res in results if res.kind in ("agent", "subaggregator") and not importable(res)
        ),
        "issues": dict(sorted(issues.items())),
        "regions": regions,
        "rows_with_issues": rows_with_issues,
    }


def dealer_id_for(msisdn: str) -> str:
    return "agg-" + msisdn[-6:]


async def apply(db: AsyncSession, results: list[RowResult]) -> dict:
    created = {"aggregators": 0, "subaggregators": 0, "agents": 0, "updated_agents": 0}
    # Aggregators first: one dealer per parent line, with a PIN nobody knows until it is set.
    parents: dict[str, dict] = {}
    for res in results:
        if importable(res) and res.aggregator and res.aggregator["msisdn"]:
            parents.setdefault(res.aggregator["msisdn"], res.aggregator)
    for msisdn, agg in parents.items():
        did = dealer_id_for(msisdn)
        d = await db.get(Dealer, did)
        if d is None:
            d = Dealer(
                id=did,
                name=agg["name"],
                pin_hash=hash_pin(secrets.token_hex(4), did),
                must_set_pin=True,
                permissions=AGGREGATOR_PERMS,
                msisdn=msisdn,
                source="orange_file",
            )
            db.add(d)
            created["aggregators"] += 1
        d.region = d.region or agg["region"]
    await db.flush()
    for res in results:
        if not importable(res) or res.agent is None or res.aggregator is None:
            continue
        parent_id = dealer_id_for(res.aggregator["msisdn"])
        a = res.agent
        if res.kind == "subaggregator":
            sid = "agg-" + (a["msisdn"] or a["agent_code"])[-6:]
            if await db.get(Dealer, sid) is None:
                db.add(
                    Dealer(
                        id=sid,
                        name=a["person_name"] or "Sub-aggregator",
                        pin_hash=hash_pin(secrets.token_hex(4), sid),
                        must_set_pin=True,
                        permissions=AGGREGATOR_PERMS,
                        region=a["region"],
                        msisdn=a["msisdn"],
                        parent_id=parent_id,
                        source="orange_file",
                        source_row=a["source_row"],
                    )
                )
                created["subaggregators"] += 1
            continue
        existing = None
        if a["agent_code"]:
            existing = (
                await db.execute(select(Agent).where(Agent.agent_code == a["agent_code"]))
            ).scalar_one_or_none()
        if existing is None and a["msisdn"]:
            existing = (
                await db.execute(select(Agent).where(Agent.msisdn == a["msisdn"]))
            ).scalar_one_or_none()
        ref = f"Agent {a['agent_code']}"
        if existing is None and await db.get(Agent, ref) is not None:
            existing = await db.get(Agent, ref)
        if existing is None:
            existing = Agent(
                ref=ref,
                dealer_id=parent_id,
                person_name=a["person_name"] or "Agent",
                shop_name=a["person_name"] or ref,
                area=a["city"] or "City not given",
                street=a["street"],
                lat=None,
                lng=None,
                pin_hash=hash_pin(secrets.token_hex(4), ref),
                must_set_pin=True,
                # Not open until the agent says so: nobody has signed in yet.
                presence="closed",
                source="orange_file",
            )
            db.add(existing)
            created["agents"] += 1
        else:
            created["updated_agents"] += 1
        if existing.source == "orange_file":
            # Orange's record is the truth for what it holds; a re-run restores it.
            existing.person_name = a["person_name"] or existing.person_name
            if existing.shop_name == existing.ref or existing.shop_name == existing.person_name:
                existing.shop_name = a["person_name"] or existing.shop_name
            existing.street = a["street"]
            existing.area = a["city"] or "City not given"
        existing.agent_code = a["agent_code"]
        existing.msisdn = a["msisdn"] or existing.msisdn
        existing.region = a["region"] or existing.region
        existing.city = a["city"] or existing.city
        existing.active = a["active"]
        if existing.declared_at is None:
            existing.presence = "closed"  # never declared: not open, whatever an older import wrote
        # A clean row is verified by the file itself; a row with issues waits, and the
        # note says why. Every run re-reads the file, so fixing the file fixes the agent.
        existing.verified = not res.issues
        existing.verification_note = pending_note(res.issues)
        existing.source_row = a["source_row"]
        existing.orange_cash_in = a["cash_in"]
        existing.orange_cash_out = a["cash_out"]
        existing.orange_tx_count = a["tx_count"]
        # Orange's own record of where the shop is goes on the map as confirmed, unless the
        # agent or their aggregator has confirmed a point standing at the shop.
        if a.get("lat") is not None and a.get("lng") is not None:
            stood_there = existing.location_confirmed and existing.location_source in (
                "agent",
                "dealer",
            )
            if not stood_there:
                existing.lat, existing.lng = a["lat"], a["lng"]
                existing.location_source = "orange"
                existing.location_confirmed = True
                created["located"] = created.get("located", 0) + 1
        res.ref = existing.ref
        if existing.dealer_id != parent_id and existing.source == "orange_file":
            existing.dealer_id = parent_id
    await db.commit()
    return created


async def find_existing(db: AsyncSession, a: dict) -> Agent | None:
    """The agent a row is about, as apply() matches it: agent code, then line, then ref."""
    if a.get("agent_code"):
        hit = (
            await db.execute(select(Agent).where(Agent.agent_code == a["agent_code"]))
        ).scalar_one_or_none()
        if hit:
            return hit
    if a.get("msisdn"):
        hit = (
            await db.execute(select(Agent).where(Agent.msisdn == a["msisdn"]))
        ).scalar_one_or_none()
        if hit:
            return hit
    if a.get("agent_code"):
        return await db.get(Agent, f"Agent {a['agent_code']}")
    return None


LIST_LIMIT = 50  # names listed per kind of change; the counts are always whole


async def preview(db: AsyncSession, results: list[RowResult]) -> dict:
    """What applying would change, read only: new agents, agents updated, deactivated or
    reactivated by Orange, moved to another aggregator, given a location by the report, and
    agents on record from an earlier report that this one no longer lists."""
    kinds = ("new", "updated", "deactivated", "reactivated", "moved", "located")
    changes: dict[str, list[dict]] = {k: [] for k in kinds}
    seen: set[str] = set()
    for res in results:
        if not importable(res) or res.kind != "agent" or res.agent is None:
            continue
        a = res.agent
        parent = dealer_id_for(res.aggregator["msisdn"]) if res.aggregator else None
        item = {"row": res.row, "agent_code": a["agent_code"], "name": a["person_name"]}
        hit = await find_existing(db, a)
        has_point = a.get("lat") is not None and a.get("lng") is not None
        if hit is None:
            changes["new"].append(item)
            if has_point:
                changes["located"].append(item)
            continue
        seen.add(hit.ref)
        item["ref"] = hit.ref
        changes["updated"].append(item)
        if hit.active and not a["active"]:
            changes["deactivated"].append(item)
        if not hit.active and a["active"]:
            changes["reactivated"].append(item)
        if hit.source == "orange_file" and parent and hit.dealer_id != parent:
            changes["moved"].append(item)
        stood = hit.location_confirmed and hit.location_source in ("agent", "dealer")
        if has_point and not stood and (hit.lat, hit.lng) != (a["lat"], a["lng"]):
            changes["located"].append(item)
    on_record = (
        await db.execute(
            select(Agent.ref, Agent.agent_code, Agent.person_name).where(
                Agent.source == "orange_file", Agent.active.is_(True)
            )
        )
    ).all()
    missing = [
        {"ref": ref, "agent_code": code, "name": name}
        for ref, code, name in on_record
        if ref not in seen
    ]
    return {
        "counts": {k: len(v) for k, v in changes.items()} | {"not_in_report": len(missing)},
        "lists": {k: v[:LIST_LIMIT] for k, v in changes.items()}
        | {"not_in_report": missing[:LIST_LIMIT]},
        "active_on_record": len(on_record),
    }


async def record_day(
    db: AsyncSession, results: list[RowResult], report_date, import_id: str
) -> int:
    """Each applied agent's figures for the report's day: one row per agent and day, so a
    corrected report for the same day replaces the figures rather than adding to them."""
    from app.db.models import AgentDailyStat

    n = 0
    for res in results:
        if res.ref is None or res.agent is None:
            continue
        a = res.agent
        row = (
            await db.execute(
                select(AgentDailyStat).where(
                    AgentDailyStat.agent_ref == res.ref, AgentDailyStat.report_date == report_date
                )
            )
        ).scalar_one_or_none()
        if row is None:
            row = AgentDailyStat(agent_ref=res.ref, report_date=report_date, import_id=import_id)
            db.add(row)
        row.cash_in = a.get("cash_in")
        row.cash_out = a.get("cash_out")
        row.tx_count = a.get("tx_count")
        row.float_balance = a.get("float_balance")
        row.commission = a.get("commission")
        row.import_id = import_id
        n += 1
    return n
