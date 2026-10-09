"""Import Orange's aggregator/agent file (meeting of 29 September 2026, steps 3–5).

    python -m scripts.import_orange ~/Downloads/Book2.xlsx            # validate and report only
    python -m scripts.import_orange ~/Downloads/Book2.xlsx --apply    # also write to the database

Reads the .xlsx without any extra library. Validates every row, prints a report that names
row numbers and issue codes but never a value, and with --apply creates or updates:
aggregators (dealers) matched by their Orange Money line, sub-aggregators under them, and
agents matched by agent code, then MSISDN. Imported agents have no location (the file has
none): they stay off the customer map until a dealer pins them, and they cannot sign in until
a PIN is set. The personal columns (date of birth, ID numbers, email, contact person) are
never read into the database. Every imported row carries the file's hash and its row number.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import re
import secrets
import sys
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

from app.core.auth import hash_pin
from app.db.models import Agent, Dealer
from app.db.session import get_session_factory
from sqlalchemy import select

REGION_BY_CITY = {
    # Western Area
    "freetown": "west",
    "wellington": "west",
    "waterloo": "west",
    "lumley": "west",
    "kissy": "west",
    "goderich": "west",
    "hastings": "west",
    "aberdeen": "west",
    # Southern Province
    "bo": "south",
    "moyamba": "south",
    "bonthe": "south",
    "pujehun": "south",
    # Eastern Province
    "kenema": "east",
    "kono": "east",
    "koidu": "east",
    "kailahun": "east",
    # Northern Province (and North West)
    "makeni": "north",
    "kambia": "north",
    "port loko": "north",
    "lunsar": "north",
    "magburaka": "north",
    "kabala": "north",
    "bombali": "north",
    "tonkolili": "north",
    "koinadugu": "north",
    "falaba": "north",
    "karene": "north",
    # Towns and villages seen in Orange's file, placed by district. Unmatched values stay
    # "region unknown" in the report until Orange confirms them.
    "lungi": "north",
    "masiaka": "north",
    "rokon": "north",
    "petifu": "north",
    "patifu": "north",
    "makali": "north",
    "nimikoro": "east",
    "ft": "west",
}
AGENT_PERMS = ""
AGGREGATOR_PERMS = (
    "VIEW_AGENT,VIEW_AGENT_FINANCIAL_DETAIL,MANAGE_FLOAT_REQUEST,VIEW_AGENT_HISTORY,"
    "CONTACT_AGENT,ESCALATE_AGENT,MANAGE_AGENT"
)


def read_xlsx(path: Path) -> list[dict[str, str]]:
    """First sheet as a list of {header: value}; empty cells are empty strings."""
    z = zipfile.ZipFile(path)
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


def region_for(city: str) -> str | None:
    key = city.strip().lower()
    if not key:
        return None
    for name, region in REGION_BY_CITY.items():
        if key == name or key.startswith(name + " ") or name in key.split():
            return region
    return None


def clean_city(city: str) -> str | None:
    c = " ".join(city.strip().split())
    if not c or re.search(r"\d", c) or c.lower() in ("sierra leone", "sl", "city"):
        return None
    return c.title()


def normalise_msisdn(raw: str) -> str | None:
    digits = re.sub(r"\D", "", raw)
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
        first = " ".join(r.get("USER_FIRST_NAME", "").split()).title()
        last = " ".join(r.get("USER_LAST_NAME", "").split()).title()
        if not (first or last):
            res.issues.append("no_name")
        status = r.get("ACCOUNT_STATUS", "").strip().upper()
        if status not in ("Y", "N"):
            res.issues.append("bad_status")
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
            "person_name": f"{first} {last}".strip(),
            "street": " ".join(r.get("ADDRESS1", "").split())[:120] or (city or "Unknown"),
            "city": city,
            "region": region,
            "active": status == "Y",
            "cash_in": to_float(r.get("APR CI", "")),
            "cash_out": to_float(r.get("APR CO", "")),
            "tx_count": to_float(r.get("TRNX COUNT", "")),
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


async def apply(results: list[RowResult]) -> dict:
    created = {"aggregators": 0, "subaggregators": 0, "agents": 0, "updated_agents": 0}
    async with get_session_factory()() as db:
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
                    area=a["city"] or "Unknown",
                    street=a["street"],
                    lat=None,
                    lng=None,
                    pin_hash=hash_pin(secrets.token_hex(4), ref),
                    verified=True,
                    presence="open",
                    source="orange_file",
                )
                db.add(existing)
                created["agents"] += 1
            else:
                created["updated_agents"] += 1
            existing.agent_code = a["agent_code"]
            existing.msisdn = a["msisdn"] or existing.msisdn
            existing.region = a["region"] or existing.region
            existing.city = a["city"] or existing.city
            existing.active = a["active"]
            existing.verified = True
            existing.source_row = a["source_row"]
            existing.orange_cash_in = a["cash_in"]
            existing.orange_cash_out = a["cash_out"]
            existing.orange_tx_count = a["tx_count"]
            if existing.dealer_id != parent_id and existing.source == "orange_file":
                existing.dealer_id = parent_id
        await db.commit()
    return created


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 2
    path = Path(argv[0]).expanduser()
    do_apply = "--apply" in argv
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    rows = read_xlsx(path)
    results = validate(rows, digest[:12])
    rep = report(results)
    rep["file_sha256"] = digest
    print(json.dumps({k: v for k, v in rep.items() if k != "rows_with_issues"}, indent=2))
    print(f"{len(rep['rows_with_issues'])} rows with issues (row numbers and codes only):")
    for item in rep["rows_with_issues"]:
        flag = "import" if item["importable"] else "HOLD  "
        print(f"  row {item['row']:4d} {item['kind']:14s} {flag} {', '.join(item['issues'])}")
    if do_apply:
        created = asyncio.run(apply(results))
        print("applied:", json.dumps(created))
    else:
        print("dry run — add --apply to write to the database")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
