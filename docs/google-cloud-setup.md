# Google Cloud setup (Maps)

Agent Finder uses the **Maps JavaScript API** with **Advanced Markers**. Nothing else is required
for the investor build: directions hand off to the Google Maps app via URL, and location uses
device GPS plus a curated area list. Routes API and Places API are deliberately not enabled.

## 1. Project and billing
1. console.cloud.google.com → create project `agent-finder` (separate projects for dev and prod are fine).
2. Billing → link a billing account. Maps has a monthly free allowance; set a **budget alert** at a
   low amount (e.g. $10) so surprises are impossible.

## 2. Enable the API
APIs & Services → Library → **Maps JavaScript API** → Enable. Do not enable Routes, Places, Geocoding.

## 3. Map ID (required for Advanced Markers)
Google Maps Platform → Map Management → Create Map ID → type **JavaScript**, style default.
Copy the Map ID into `VITE_GOOGLE_MAPS_MAP_ID`.

## 4. Browser API key, restricted
APIs & Services → Credentials → Create credentials → API key.
- **Application restrictions → Websites (HTTP referrers)**:
  - dev key: `http://localhost:5173/*`, `http://127.0.0.1:5173/*`
  - prod key: `https://<your-domain>/*`, `https://*.vercel.app/*` (preview deployments)
- **API restrictions → Restrict key → Maps JavaScript API only.**
Use a different key per environment. Copy into `VITE_GOOGLE_MAPS_API_KEY` (web `.env.local` or the
Vercel project's environment variables). The key ships to browsers by design; the restrictions are
what protect it. Never put it in the API's environment.

## 5. Quotas
APIs & Services → Maps JavaScript API → Quotas → set a **daily cap** on map loads appropriate for
demos (a few hundred). One map load ≈ one session in Agent Finder, because the SDK is loaded once,
only when the customer taps "Map", and the map instance is reused.

## 6. Cost model (why the app is built this way)
- The customer flow (home → results → agent detail) never loads the SDK.
- "Get directions" opens `https://www.google.com/maps/dir/?api=1&destination=lat,lng` — free.
- Markers are Advanced Markers with custom DOM; no marker icon fetches.

## 7. Checklist before a demo
- [ ] Key restricted to referrers and to the Maps JavaScript API
- [ ] Map ID set, Advanced Markers rendering
- [ ] Daily quota cap and budget alert in place
- [ ] Keys present in Vercel env (prod) and `apps/web/.env.local` (dev), absent from git
