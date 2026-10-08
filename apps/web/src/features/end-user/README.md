# End User feature (U1–U7)

Screens: `HomePage` (U1), `ResultsPage` (U3), `AgentDetailPage`, `HowAvailabilityWorksPage` (U4),
`ReportVisitPage` (U6), `OutcomeForm` + `OutcomePrompt` (U7).

## Rules this code must keep

- **No product logic here.** Ranking, the public phrase, freshness and the why line are decided by
  the backend domain layer and rendered as received. `FreshnessBadge` draws the state the API sent;
  it never computes an age.
- **Nothing private reaches the customer.** `types/public.ts` is the whole contract. A private field
  cannot be rendered because it is not in the type. Customer screens may show only an aggregate
  rating once at least three ratings exist; individual ratings and comments stay private.
- **No customer identity.** Reports carry an agent id, an answer, an optional reason/rating/comment
  and an idempotency token. Comment-only reports are linked to the selected shop without showing
  its agent code. `usePendingVisit` keeps only the last visit in `sessionStorage` so the outcome
  can be asked on return.
- **Transport is swappable.** Screens call `services/customerApi`. With `VITE_API_MODE=live` it calls
  the FastAPI endpoints; otherwise `services/demoNetwork` answers with the seeded network. The demo
  file is the only place that behaves like a server.

## Assumptions (smallest reasonable, reversible)

1. **Query in the URL** (`/search?tx=cash_out&amount=2000&area=Lumley`) rather than a store, so the
   Max it deep link lands directly on results.
2. **Simulated area fallback.** The local prototype uses a curated area and labels its 500 m search
   origin as simulated. It must not imply device GPS was acquired.
3. **Outcome prompt timing** — asked on the next home visit at least 15 minutes after directions.
4. **Agent attribution in U6** comes from the shop details or pending visit context. If the
   customer opens Report a visit without a selected shop, the page sends them to search first.
