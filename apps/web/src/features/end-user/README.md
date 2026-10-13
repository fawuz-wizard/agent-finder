# End User feature (U1–U6)

Screens: `HomePage` (U1), `ResultsPage` (U3), `AgentDetailPage`, `HowAvailabilityWorksPage` (U4),
`AgentDirectionsPage`, `ReportVisitPage` (U6).

## Rules this code must keep

- **No product logic here.** Ranking, the public phrase, freshness and the why line are decided by
  the backend domain layer and rendered as received. `FreshnessBadge` draws the state the API sent;
  it never computes an age.
- **Nothing private reaches the customer.** `types/public.ts` is the whole contract. A private field
  cannot be rendered because it is not in the type. Customer screens may show only an aggregate
  rating once at least three ratings exist; individual ratings and comments stay private.
- **No customer identity.** Reports carry an agent id, an answer, an optional reason/rating/comment
  and an idempotency token. Comment-only reports are linked to the selected shop without showing
  its agent code. Nothing is remembered about where the customer went, and nothing is asked
  afterwards: Report a visit is the customer's own choice, from the shop's details.
- **Transport is swappable.** Screens call `services/customerApi`. With `VITE_API_MODE=live` it calls
  the FastAPI endpoints; otherwise `services/demoNetwork` answers with the seeded network. The demo
  file is the only place that behaves like a server.

## Assumptions (smallest reasonable, reversible)

1. **Query in the URL** (`/search?tx=cash_out&amount=2000&area=Lumley`) rather than a store, so the
   Max it deep link lands directly on results.
2. **Simulated area fallback.** The local prototype uses a curated area and labels its 500 m search
   origin as simulated. It must not imply device GPS was acquired.
3. **Agent attribution in U6** comes from the shop details the customer was on. If the
   customer opens Report a visit without a selected shop, the page sends them to search first.
