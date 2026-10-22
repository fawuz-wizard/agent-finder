# Agent Finder

Project timebox: one week. Keep plans and implementation focused on the smallest useful customer experience that can be completed and demonstrated within that week.

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
