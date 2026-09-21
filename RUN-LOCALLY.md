# Run Agent Finder (End User demo) on your machine

Requires Node 18+ (Node 20 recommended). Check with `node -v`.

## 1. Open the folder in VS Code
Unzip, then File > Open Folder > `agent-finder`.

## 2. Install and run
Open the VS Code terminal (Ctrl + `) and run:

```bash
cd apps/web
npm install
npm run dev
```

Vite prints a local URL (usually http://localhost:5173). Open it in your browser.
It runs in demo mode — no backend needed, the agent data is simulated in the app.

## 3. The demo path
1. Pick a transaction (Cash out) and an amount (2000) — tap "Find an agent".
2. Results: the recommendation at the top with "Can likely handle your request",
   and below it the "closer to you, but may not cover SLE 2,000" section.
3. Tap an agent to see the detail screen and directions.
4. Tap "Report a visit" > Yes/No + stars > submit.
5. Wait about 20 seconds after a visit and the "How did it go?" prompt appears
   on the home screen. (In live mode that wait is 15 minutes — see
   `outcomePromptAfterMs` in `src/lib/config.ts`.)

## 4. Other commands
```bash
npm test            # 20 tests
npm run typecheck
npm run lint
npm run build       # production build
npm run preview     # serve the production build
```

## Notes
- Only the End User experience is implemented so far. Agent, Distributor and
  Super Distributor routes exist as placeholders.
- `apps/web/src/features/end-user/API-CONTRACT.md` is what the backend must
  provide. Switch `VITE_API_MODE` in `.env.local` to `live` when it exists.
