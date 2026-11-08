# Agent Finder

Project timebox: one week. Keep plans and implementation focused on the smallest useful customer experience that can be completed and demonstrated within that week.

## How to work here (any model, keep it cheap)

Read `docs/handover.md` first for where things are and how to ship. Then, for every task:

1. **One task per session.** If the task is unclear, ask one question before reading code.
2. **Look before reading.** Find the files with grep or a directory listing; read only the parts
   you need, never whole large files.
3. **Screens:** describe or show the change and get the user's yes before writing code.
4. **Small diffs.** Change only what the task needs; no refactors on the side.
5. **Checks before shipping:** `cd apps/api && .venv/bin/ruff check . && .venv/bin/python -m pytest -q`
   and `cd apps/web && npm run typecheck && npm run lint && npm test`. If one fails, fix it or stop
   and report it; never ship over a failure.
6. **Ship** with the recipe in `docs/handover.md` (server: `update.sh`; apps: the GitHub build,
   then `admin.sh publish-apks --from-bucket`).
7. **Report in plain words:** what changed, what was checked, what is left. Then stop.

Never print or commit data from Orange's file (names, phone numbers, account ids that contain
them); one-time codes go to private files, never into the chat. No AI attribution lines in commits.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec

## Orange Summer Challenge standards (rule from the organizers, noted 2026-10-22)

Every deliverable and every piece of code written from 2026-10-22 on must comply with the Orange Summer
Challenge graphic requirements and technical standards set by the organizers (ODC). The full brief has
not yet been received; until it is, keep to the Orange design system tokens already in
`apps/web/src/design/tokens.css`, produce documents and screens that could be shown at the national
ceremony without rework, and record the brief's items here as soon as they arrive. When the brief
arrives, check each new file, screen and document against it before it is considered done.

**Brand colours (decided 2026-11-06, pending an organiser's confirmation):** the team's approved
competition logo is pink `#FDB2E1` and purple `#5A21B8`, and the apps now use those two instead
of Orange's orange (branch `brand-logo-colours`). Purple fills carry white text, pink fills black
text; purple is never text on dark surfaces and pink never text on white. Status colours (green,
yellow, red) and the simulated Max it home stay as they were. If the organisers refuse it, the
branch is dropped and the Orange palette before it stands.
