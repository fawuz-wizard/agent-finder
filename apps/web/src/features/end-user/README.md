# End User feature (U1–U7)

Screens: `HomePage` (U1), `ResultsPage` (U3), `AgentDetailPage`, `HowAvailabilityWorksPage` (U4),
`ReportVisitPage` (U6), `OutcomeForm` + `OutcomePrompt` (U7).

## Rules this code must keep

- **No product logic here.** Ranking, the public phrase, freshness and the why line are decided by
  the backend domain layer and rendered as received. `FreshnessBadge` draws the state the API sent;
  it never computes an age.
- **Nothing private reaches the customer.** `types/public.ts` is the whole contract. A private field
  cannot be rendered because it is not in the type. `ResultsPage.test.tsx` asserts the rendered text
  contains no capacity word, balance, threshold, signal or rating.
- **No customer identity.** Reports carry an agent id, an answer, an optional reason/rating/comment
  and an idempotency token. `usePendingVisit` keeps only the last visit in `sessionStorage` so the
  outcome can be asked on return.
- **Transport is swappable.** Screens call `services/customerApi`. With `VITE_API_MODE=live` it calls
  the FastAPI endpoints; otherwise `services/demoNetwork` answers with the seeded network. The demo
  file is the only place that behaves like a server.

## Assumptions (smallest reasonable, reversible)

1. **Query in the URL** (`/search?tx=cash_out&amount=2000&area=Lumley`) rather than a store, so the
   Max it deep link lands directly on results.
2. **Area instead of GPS.** The customer picks a curated area; no precise position is requested or
   sent. Geolocation can be added behind the same `SearchRequest.area` field.
3. **Outcome prompt timing** — asked on the next home visit at least 15 minutes after directions.
4. **Agent code entry** in U6 accepts a short code; the live API will resolve it.
