# What the backend must provide for the End User surface

`services/customerApi` is the only transport. Setting `VITE_API_MODE=live` switches it from the
seeded `demoNetwork` to these three endpoints; nothing in the screens changes. Field names and
shapes below are what the client already parses (`src/types/public.ts`).

**The rule that governs all three:** the response may contain nothing a customer must not see — no
capacity word, range bound, threshold, balance, float, signal, hide event, report count, rating,
comment or audit field. If a field is not in `types/public.ts`, the client cannot render it, and the
public-view test in `ResultsPage.test.tsx` fails if one appears in the rendered output.

## POST /api/v1/search

Request:

```json
{ "transaction": "cash_out | deposit | send", "amount_sle": 2000, "area": "Lumley", "radius_m": 2000 }
```

`amount_sle` may be `null` (show agents that are open and fresh). `area` is a curated area label —
the client never sends a precise position.

Response — the server ranks, phrases and explains; the client only renders:

```json
{
  "query": { "transaction": "cash_out", "transaction_label": "Cash out", "amount_sle": 2000,
             "amount_label": "SLE 2,000", "area": "Lumley", "radius_m": 2000 },
  "recommended": [ { "...AgentResult": "", "why": "Nearest agent that can likely handle SLE 2,000 right now." } ],
  "closer_not_serving": [ { "...AgentResult": "", "note": "May not cover SLE 2,000 — worth asking if you are passing." } ],
  "results": [ "...AgentResult" ],
  "total": 8,
  "generated_at": "2026-09-16T14:20:00Z",
  "banner": "All nearby statuses are older than 4 hours — ask before you go."
}
```

`AgentResult`: `id`, `name`, `area` (street or landmark), `distance_m`, `outcome`
(`likely | limited | expired | closed | hidden | not_set`), `outcome_text` (the exact public phrase,
localised), `freshness` (`fresh | aging | may_have_changed | expired`), `freshness_text`
(e.g. "Updated 6 min ago — may have changed"), `directions_url` (maps hand-off built from the coarse
business point), `can_call`.

Server responsibilities the client deliberately does not replicate:

- deciding the outcome by comparing the amount to the declared word's network range;
- computing freshness from the configured windows and the reliability weight;
- ordering by outcome tier → freshness → distance, with the anomaly guard applied;
- writing `why` for the recommendation and `note` for a nearer agent that may not serve;
- capping the response at ten agents and setting `banner` when everything nearby is stale.

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
  "answer": "yes | no | did_not_go", "reason_code": "less_than_requested",
  "rating": 4, "comment": "…", "source": "search | direct", "client_token": "uuid" }
```

`client_token` is an idempotency key: the same token must never create a second report. `rating` and
`comment` are optional and network-only — they are never returned on any customer endpoint.
`reason_code` comes from the server's own list; the client renders the labels it is given. Response:
`{ "id": "...", "accepted": true }`.

The server records the public outcome and freshness **as they were at report time**, because the
mismatch and service-limitation signals depend on it. The client does not send those values.

## Errors

Any failure returns the existing envelope (`{ error: { code, message, request_id } }`). The `message`
is shown to the customer as-is, so it must be a plain sentence with a next action — never a status
code or a stack trace. The client converts an unreachable network into
"No connection. Check your network and try again."
