# What the backend must provide for the End User surface

`services/customerApi` is the only transport. Setting `VITE_API_MODE=live` switches it from the
seeded `demoNetwork` to these three endpoints; nothing in the screens changes. Field names and
shapes below are what the client already parses (`src/types/public.ts`).

**The rule that governs all three:** the response may contain nothing a customer must not see — no
capacity word, range bound, threshold, balance, float, signal, hide event, report count, individual
rating, comment or audit field. Aggregate ratings are public only after at least three ratings exist.
If a field is not in `types/public.ts`, the client cannot render it, and the
public-view test in `ResultsPage.test.tsx` fails if one appears in the rendered output.

## POST /api/v1/search

Request:

```json
{ "transaction": "cash_out | deposit", "amount_sle": 2000, "area": "Lumley", "radius_m": 500 }
```

`amount_sle` may be `null` (show agents that are open and fresh). `area` is a curated area label —
the client never sends a precise position.

Response — the server ranks, phrases and explains; the client only renders:

```json
{
  "query": { "transaction": "cash_out", "transaction_label": "Cash out", "amount_sle": 2000,
             "amount_label": "SLE 2,000", "area": "Lumley", "radius_m": 500 },
  "recommended": [ { "...AgentResult": "", "why": "Recent activity suggests this agent may handle your request." } ],
  "closer_not_serving": [ "...nearby open agents with a public outcome other than likely" ],
  "results": [ "...additional likely AgentResult, nearest first" ],
  "further_away": [ "...up to two open agents between 500 m and the 20 km Freetown cap when no core agent is likely" ],
  "total": 8,
  "generated_at": "2026-09-16T14:20:00Z",
  "banner": "All nearby statuses are older than 4 hours — ask before you go."
}
```

`AgentResult`: `id`, `name`, `area` (street or landmark), `distance_m`, `outcome`
(`likely | limited | unknown | expired | closed | hidden | not_set`), `outcome_text` (the exact public phrase,
localised), `freshness` (`fresh | aging | may_have_changed | expired`), `freshness_text`
(e.g. "Updated 6 min ago — may have changed"), `directions_url` (maps hand-off built from the coarse
business point), `can_call`.

Open, visible agents within 500 metres appear in the Nearest list, including agents whose public
availability is uncertain. Recommended contains likely matches, ordered by transaction activity
when that model is available. If no open core agent is a likely match, the API widens to 20 km and
returns up to two open options in `further_away`. Closed and hidden agents never appear. The customer
sees shop details before choosing directions. Server responsibilities the
client deliberately does not replicate:

- deciding the outcome by comparing the amount to the declared word's network range;
- computing freshness from the configured windows and the reliability weight;
- ordering recommended agents by activity evidence and nearest agents by distance;
- writing `why` for the recommendation and `note` for a nearer agent that may not serve;
- limiting the core Nearest list and farther fallback to a small result set, and setting `banner`
  when all returned statuses are stale.

## GET /api/v1/agents/{id}?transaction=&amount_sle=

Returns `AgentResult` plus `request_label` ("For Cash out · SLE 2,000"), `hours_text`,
`verified_label` (only when the operator has verified the agent; otherwise `null`) and `call_url`
(`tel:` link, present only when the agent opted in). The outcome must be restated against the
transaction and amount in the query string, not a generic status. A missing or removed agent returns
404 with the standard error envelope.

## POST /api/v1/reports

Request — the entire body, with no customer identity:

```json
{ "agent_id": "af-4821", "transaction": "cash_out", "amount_sle": 2000,
  "answer": "yes | no | did_not_go | comment", "reason_code": "less_than_requested",
  "rating": 4, "comment": "…", "source": "search | direct", "client_token": "uuid" }
```

`client_token` is an idempotency key: the same token must never create a second report. Ratings do
not require a completed transaction; the API limits each browser to one rating per agent per 24 hours.
`comment` is optional, up to 1,000 characters, and network-only — it is never returned on any
customer endpoint. A `comment` answer is a comment-only report: it requires non-empty comment
text, carries no rating or transaction outcome, and is linked to the selected agent internally.
The customer UI displays the shop name, never the agent code. Comments do not contribute to
availability evidence or direction counts.
`reason_code` comes from the server's own list; the client renders the labels it is given. Response:
`{ "id": "...", "accepted": true }`.

For `yes`, `no`, and `did_not_go`, the server records the public outcome and freshness **as they
were at report time**, because mismatch and service-limitation signals depend on them. A
comment-only report has no service outcome or freshness snapshot. The client does not send those
values.

## Errors

Any failure returns the existing envelope (`{ error: { code, message, request_id } }`). The `message`
is shown to the customer as-is, so it must be a plain sentence with a next action — never a status
code or a stack trace. The client converts an unreachable network into
"No connection. Check your network and try again."
