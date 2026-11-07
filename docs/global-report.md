# Orange's daily Global Report

Orange sends its Global Report every day: the whole agent network as one Excel (.xlsx) or CSV
file. The platform takes it in through the national console and fills everything from it:
aggregators, agents, which aggregator each agent belongs to, Orange's active or inactive status,
the shop's location when the report has one, and the day's figures for each agent. Agents don't
have to record their own transactions for the network view to be complete. The Agent App's
own recording stays as it is.

## How it works

1. **Upload.** An Orange national account opens **Global Report** in the national console,
   chooses the day the report covers and the file, and clicks **Read the report**.
2. **Preview.** The file is read and cleaned, and compared with what is already on record.
   Nothing in the network changes yet. The screen shows:
   - Rows in the file, agents to apply, rows held back, aggregators.
   - Which columns the report carries: shop locations, cash in/cash out, float, commission.
   - What applying will do:
     - new agents;
     - agents updated;
     - placed on the map;
     - made inactive by Orange;
     - active again;
     - moved to another aggregator;
     - agents on record that this report no longer lists.
   - Rows to check in the file, given by row number and problem, never a value.
3. **Apply** (or **Set aside**). A person reads the preview and applies it. Everything is
   written in one go. The national map, each aggregator's agent list and report, and the
   customer map (for located, active agents) show it straight away.

## Rules that keep the network safe

| Situation | What happens |
|---|---|
| The same file uploaded twice | One upload. The second answer points at the first. |
| A report listing fewer than 80% of the active agents on record (e.g. a cut-off file) | It isn't applied until someone confirms **Apply anyway**. |
| Agents on record but not in today's report | Listed. Nothing is deleted. |
| A location in the report | Used, and the shop goes on the map as Orange's confirmed point. A point the agent or aggregator confirmed standing at the shop is never overwritten. |
| A location outside Sierra Leone, or one that isn't a number | Flagged on the row and not used. |
| Personal columns (date of birth, ID numbers, email, contact person) | Never read into the database. |
| The raw file | Never stored. Only the cleaned rows are kept, and only until the report is applied or set aside. |
| Money figures (cash in/out, float, commission) | Stored per agent per day. Never shown to customers. An aggregator sees them only with the financial-detail permission, and every view is logged. |
| Who can upload | Only accounts with the `IMPORT_GLOBAL_REPORT` permission (Orange's national accounts). Anyone else gets "not found". |
| An older report after a newer one is applied | Refused: it would undo Orange's later changes (for example re-open an agent Orange closed). Set it aside. |
| Aggregators | Matched by their whole Orange Money line, never part of it: two lines that end the same are two accounts. |
| A row whose line already belongs to another account | Set aside with its row number and the reason, never applied over the other account; the rest of the report applies. |
| Applying | All or nothing: the agents, the day's figures and the record of who applied it are written together. Once applied, only the counts are kept, not the names. |
| A report set aside | Can be uploaded again later and is read afresh. |
| File checks | Content is checked, not the name (an .xlsx is a zip archive, anything else must be text). Files over 10 MB, that unpack too large, that have far more rows or columns than a report, or that are damaged, are refused with a plain reason. |

## Columns

Columns are found **by name**, whatever their order and however they are typed ("AGENT_CODE",
"Agent Code"). A column the report doesn't have is simply not used.

| | Column names read |
|---|---|
| Required | `PARENT_USER_MSISDN` (the aggregator's line), `MSISDN`, `AGENT_CODE` |
| Agent details | `USER_FIRST_NAME`, `USER_LAST_NAME`, `CITY`, `ADDRESS1`, `ACCOUNT_STATUS` (Y/N), `USER_CATEGORY_CODE` (AGNT/SUBAGG), `PARENT_FIRST_NAME` |
| Location | `Latitude` / `Lat` / `GPS Latitude` and `Longitude` / `Long` / `Lng` / `GPS Longitude` |
| Activity | `Cash In` / `CI` / `<month> CI`, `Cash Out` / `CO` / `<month> CO`, `TRNX COUNT` / `Transaction Count` |
| Float | `Float` / `E Float` / `Float Balance` / `Balance` |
| Commission | `Commission` / `Comm` / `Total Commission` |

The first file from Orange (`Book2.xlsx`, October 2026) reads as 97 of 100 rows importable,
1 held back and 2 aggregators. It has no location, float or commission columns. Once Orange
confirms the daily report's columns, new spellings are added in
`apps/api/app/services/orange_report.py` (`OPTIONAL`).

## Show it on a laptop (no internet needed after installing)

**In VS Code:** Terminal > Run Task > **Live: install** (first time), then **Live: run all**, and
open http://localhost:5181. The terminal steps below do the same by hand.

**On Windows without VS Code:** double-click `windows\install.bat` (first time), then
`windows\run-all.bat`.

You need Python 3.12 and Node 22. Run each block in its own terminal, from the repository folder.

**1. The API, with the demo accounts, on a fresh local database:**

```bash
cd apps/api
python3 -m venv .venv
.venv/bin/pip install -r requirements.lock && .venv/bin/pip install --no-deps -e .
APP_ENV=development SEED_ON_START=true DATABASE_URL=sqlite+aiosqlite:///./meeting-demo.db \
  CORS_ORIGINS=http://localhost:5181,http://localhost:5173 \
  .venv/bin/python -m uvicorn app.main:app --port 8000
```

On Windows (PowerShell), use `.venv\Scripts\pip` and `.venv\Scripts\python`, and set each
variable first, e.g. `$env:APP_ENV="development"`, then run the last line without the variables.

**2. Orange's national console:**

```bash
cd apps/web
npm ci --legacy-peer-deps
VITE_APP_SURFACE=national VITE_API_MODE=live VITE_API_BASE_URL=http://localhost:8000 \
  npx vite --port 5181
```

Open http://localhost:5181 and sign in with account **orange**, PIN **123456**. This is the
demo account only; a real deployment never creates it.

**3. The demonstration:**
1. Show the national map: agents by region, aggregator and town.
2. Click **Global Report**, choose the file `docs/demo/sample-global-report.csv` (four made-up
   agents with locations, figures, float and commission, plus one bad row), and click **Read the report**.
3. Walk through the preview: what it will add, which shops go on the map, and the row it holds back and why.
4. Click **Apply to the network**, then **Agent network**: the new agents are counted and the
   located ones are on the map.
5. To show the customer side, start the customer build in a third terminal
   (`VITE_API_MODE=live VITE_API_BASE_URL=http://localhost:8000 npx vite --port 5173`) and
   search near Lumley.

## Questions for Orange

1. Can we have one real day's report? Does it have GPS columns, and what are they called?
2. Are the figures for that one day, or month-to-date?
3. Does it include agent float or balance, and commission?
4. What format is it, at what time does it arrive, how is it sent, and who sends it?
5. Is there a written data-sharing agreement for storing it daily?
6. May the data be hosted outside Sierra Leone (the hosting plan is AWS, Europe)?
