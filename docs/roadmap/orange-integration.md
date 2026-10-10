# Agent Finder: roadmap and gateway to Orange Money

*For the supervisor and Orange Sierra Leone. Written 2026-10-10 from the code as it stands.*

Agents do their transactions in Orange Money whether or not Agent Finder exists. Today the
app learns about that activity from what agents record and from a labelled demo feed. If
Orange adopts the project, the same screens run on Orange's own transaction data, through
one adapter, and every transaction is seen by the system without anyone typing it. This page
shows what is built, how the gateway works, what each next step needs, and how the data is
protected.

## 1. What exists today (evidence)

| Piece | State | Where |
|---|---|---|
| Customer module: find a nearby agent who can likely handle a cash out or deposit, directions, visit report, ratings | Built, in the Figma design, on phones | `apps/web/src/features/end-user` |
| Agent App: sign-in by agent code or Orange Money line, availability, float requests, hours, dashboard, pin the shop | Built; agent screens being redesigned next | `apps/web/src/features/agent` |
| Aggregator side: agent register, confirm a shop's pin, float approvals, attention list, Global Report, CSV exports | Built | `apps/web/src/features/dealer` |
| Orange's agent file imported: 95 agents, 2 aggregators, cleaned with the team; addresses kept exactly as given | Done; shops appear to customers only once their aggregator confirms the pin | `apps/api/scripts/import_orange.py` |
| Ranking and phrasing: activity in, words out ("can likely handle"), never a balance | Built; tested | `apps/api/app/services/ranker.py`, `phrasing.py` |
| Operator gateway: one adapter that every money or transaction figure passes through | Built as a contract; demo and "none" implementations | `apps/api/app/integrations/operator/base.py` |
| Android apps, both flavours, signed with one pilot key, published on every build | Done; QR codes in the demo kit | `.github/workflows/android.yml`, `docs/demo` |
| Hosting: API container, Render blueprint, Postgres/PostGIS migrations, Vercel config, deploy guide | Ready; waiting on accounts | `render.yaml`, `infra/deploy/README.md` |
| Automated tests | 128 on the API, 103 on the web app, run on every push | `apps/api/tests`, `apps/web/src/**/*.test.*` |

## 2. The gateway

```
 Orange Money core  ──(read-only adapter)──▶  Agent Finder API  ──▶  Customer module
 (transactions,                               ranks, phrases,        Agent App
  e-float, agents)                            audits, hides figures  Aggregator console
```

The API never calls Orange for a customer. It asks the adapter five questions about one agent:
what happened today, what happened over 30 days by amount band, the e-float position, the
cash position where inferable, and a time series for the dashboard. The adapter contract is
in `OperatorAdapter`; the demo answers come from `FakeOperator`, labelled as demo on every
screen; `NoOperator` makes every figure-based panel absent rather than faked.

**Plugging Orange in** means writing one class against that contract, pointed at Orange's
agent-transaction API, and setting `OPERATOR_ADAPTER=orange`. Nothing in the apps changes.
Figures stay on the server: customers only ever receive words and a freshness sentence.

**Three ways to feed it, in order of preference**
1. Orange exposes a read-only, agent-scoped transactions endpoint; the adapter polls it per
   request with a short cache. Simplest, no state on our side.
2. Orange pushes transaction events (webhook); we keep a rolling window per agent.
3. A nightly export (like the file we already import) refreshes activity once a day. Works,
   but customers then see yesterday's picture.

Until Orange connects, agents record transactions in the app (Services tab). That log is
for Orange's eyes, so the figures are real for the pilot; it is not a feature we sell.

## 3. Roadmap, with what each step needs

| Phase | What ships | What it needs | Time |
|---|---|---|---|
| **0. Competition** (now) | Demo APKs with a seeded network; Orange's file in the development database; this document | Nothing more | Done |
| **1. Pilot** | Hosted API and web app over HTTPS; both apps live; venue agents pinned and confirmed; agents record transactions; first week of customer visit reports | Render account (API + Postgres), Vercel account, Google Maps key restricted to our domains, an `API_BASE_URL` variable for the builds. About USD 20–30 a month | 1 week after accounts |
| **2. Orange feed** | The Orange adapter; manual recording switched off; every transaction seen; dashboards on real series | From Orange: API contract and sandbox, client credentials, a data-processing agreement naming the fields (agent ref, timestamp, side, amount band, float position) | 2–3 weeks after access |
| **3. Scale** | All regions (E/N/W/S) from Orange's full agent list; more aggregators on the console; SMS fallback for agents without data; the finder embedded as a tile inside the Orange Money app; the ranker retrained on real outcomes | Orange's regional agent lists; an SMS gateway; a place in the Orange Money app menu | Quarter after the feed |

## 4. Security and privacy, as implemented

- **Sign-in.** Agents and aggregators sign in with a 4–6 digit PIN. PINs are stored as
  PBKDF2-HMAC-SHA256 hashes, 100 000 rounds, salted per account. Five failures lock the
  account for 15 minutes. Sessions are random 32-byte bearer tokens, 30-day lifetime,
  revoked on sign-out. (`apps/api/app/core/auth.py`)
- **Roles.** Every endpoint is scoped to a role and a subject. An aggregator sees only their
  own agents; a wrong role gets 404, not 403, so the existence of a record is never confirmed.
- **Customers see words, not money.** Public endpoints return no balance, float, threshold
  or capacity figure, by contract and by test. Agents' phone numbers show only if the agent
  opts in. Availability is hidden overnight (20:00–07:00) for agents' safety.
- **Locations.** A customer's position is rounded to about 110 m before it leaves the phone;
  it is never stored. A shop's pin goes live only after its aggregator confirms it, and the
  address from Orange's file is never altered by the app.
- **Orange's data.** The file's personal columns (date of birth, national ID, SSN, e-mail)
  are never imported. Operator figures pass through the adapter per request, labelled with
  their source, and are not stored. The original file is kept outside the repository.
- **Audit.** Every aggregator action and agent change is a row in the action log with who,
  what and when; the Global Report and CSV exports come from those rows.
- **Transport and secrets.** HTTPS end to end on Render and Vercel; CORS allowlist naming the
  web domain and the apps' origins; secrets only in environment variables; the Android apps
  are signed with one key so updates install over the previous build.
- **What we would add for Phase 2.** Client-credential or mTLS auth to Orange's API, a
  per-agent rate limit on the adapter, and a retention rule for the transaction log (90 days
  proposed).

## 5. Open questions for Orange

1. Sub-aggregator rows: do they manage agents of their own, or sit under the two aggregators?
2. `TRNX COUNT` is fractional in the file: a monthly average, or something else?
3. Twenty-one villages have no district in the file, so their region (E/N/W/S) is unknown.
4. One agent code is not six digits (`S1G190`); kept out until confirmed.
5. Which agent-transaction API exists today, and can a sandbox be opened to the team?

## 6. What we are asking for now

Two accounts and one key, so Phase 1 can start on Monday: a Render account for the API and
its database, a Vercel account for the web app, and a Google Maps key. Everything else in
Phase 1 is already written and tested.
