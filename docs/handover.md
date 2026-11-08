# Handover: how to run, change and ship Agent Finder

For whoever works on this next, person or AI assistant. Read this first, then `CLAUDE.md`,
`docs/development.md` (rules and the seven security holes) and `docs/hosting-aws.md`.

## Where things are

| What | Where |
|---|---|
| Code | `~/Downloads/agent-finder` on the laptop; GitHub `fawuz-wizard/agent-finder` (private) |
| Server (staging, AWS eu-west-1) | EC2 `i-0437066d905408045`, address 34.241.180.202 |
| Customer web app | https://app.34-241-180-202.sslip.io |
| Agent and aggregator web app | https://agent.34-241-180-202.sslip.io |
| Orange national console | https://national.34-241-180-202.sslip.io |
| Android downloads | https://app.34-241-180-202.sslip.io/download/ (`agent-app.apk`, `agent-finder.apk`) |
| API health | https://api.34-241-180-202.sslip.io/health |
| Secrets | AWS SSM Parameter Store under `/agent-finder/staging/` (never in code, chat or git) |
| Backups | Encrypted nightly to the private S3 bucket; the private key is only in `~/.agent-finder-backup-key/` |
| Errors | Sentry org `agent-finder`, projects `agent-finder-web` and `python-fastapi`; filter by environment `staging` (laptop errors say `development`) |

The AWS command line is `~/.local/bin/aws` with profile `agent-finder` (the system `/usr/bin/aws`
fails on `ssm send-command`). Put `~/.local/bin` first on `PATH` before running the scripts below.

## Change something safely

1. One small change at a time. For a screen change, show a picture and get a yes before code.
2. Run the checks; nothing ships unless all pass:
   ```
   cd apps/api && .venv/bin/python -m pytest -q
   cd apps/web && npm run typecheck && npm run lint && npm test
   ```
3. Commit with a plain message (no AI attribution lines) and push.

## Ship a change

Web apps and server (keeps the database; about 10 minutes on a slow line):
```
GIT_REF=<branch> infra/aws/update.sh
```

Android apps (built on GitHub, so the laptop's internet does not matter):
```
gh workflow run android.yml --ref <branch> -f api_base_url=https://api.34-241-180-202.sslip.io
# when the run is green (about 6 minutes):
infra/aws/admin.sh publish-apks --from-bucket
```
People who installed before open the same download link and tap Update; accounts are kept.

## Everyday admin

```
infra/aws/admin.sh create-aggregator <name> "<Display name>" <west|north|south|east>
infra/aws/admin.sh create-national <name> "<Display name>"
infra/aws/admin.sh status        # containers and health
infra/aws/admin.sh logs api      # last 100 lines (api, caddy or db)
infra/aws/admin.sh backup-now
```
A new or reset account gets a one-time code. It is written to a private file, never to chat,
WhatsApp or screenshots, and handed over in person. Aggregators sign in with
"Aggregator? Sign in with account name".

## Rules that do not bend

- Never commit, print or paste Orange's agent file or anyone's phone numbers or names from it.
- Every record is checked against its owner on the server; another account's record answers 404.
- Customers never see an agent's balance or float; agents and aggregators never see the served
  percentage.
- Brand: pink `#FDB2E1` and purple `#5A21B8`, pending the organisers' yes. If they refuse,
  `git revert -m 1 08fb170` on `main`.

## Still open

- An independent security review of `infra/aws`, and a human security expert before real
  Orange data goes on the server.
- Restrict the TomTom map key and the Sentry web key to the `*.34-241-180-202.sslip.io` names.
- Decide whether Orange's location overrides a pin an aggregator placed.
- After the pitch: deactivate the AWS access key ending `…TZVF` and switch to `aws login`.
- Copy the backup key folder and its passphrase to a password manager or encrypted USB.
