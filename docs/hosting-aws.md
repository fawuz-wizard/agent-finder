# Staging on AWS

One small server in Ireland (eu-west-1) that runs the API, the database and the three web apps,
for the pitch and for testers. Simple and easy to debug; managed services come later (see the end).
The scripts are in `infra/aws/`.

## What gets built

```
Internet ── 80/443 only ──► Elastic IP  ──►  EC2 t4g.small (Amazon Linux 2023, arm64, 30 GB encrypted disk)
                                              └─ Docker Compose
                                                 ├─ caddy   HTTPS (Let's Encrypt), HTTP→HTTPS redirect
                                                 │   ├─ api.<ip>.sslip.io       → api container
                                                 │   ├─ app.<ip>.sslip.io       customer web app
                                                 │   ├─ agent.<ip>.sslip.io     Agent App
                                                 │   └─ national.<ip>.sslip.io  national console
                                                 ├─ api     FastAPI, APP_ENV=staging
                                                 └─ db      PostgreSQL 16 + PostGIS, no published port,
                                                            on a network with no internet route
SSM Parameter Store /agent-finder/staging/*   secrets (SecureString), read by the instance at deploy
S3 agent-finder-staging-backups-<account>     nightly encrypted backups, private, versioned, 35 days
DLM policy                                    daily disk snapshot, keep 7
AWS Budget agent-finder-staging               monthly $25, email at 80 %
```

`<ip>` is the Elastic IP with dashes: 3.250.1.2 gives `api.3-250-1-2.sslip.io`. sslip.io answers
DNS for those names by itself, so no domain is needed.

There is no SSH. Admin access is AWS Systems Manager (Session Manager and Run Command).

## Cost per month (rough, eu-west-1)

| Item | About |
|---|---|
| t4g.small, always on | $13.50 |
| 30 GB gp3 disk | $2.60 |
| Public IPv4 address (Elastic IP) | $3.60 |
| Daily snapshots, 7 kept (incremental) | $0.50 to $1.50 |
| S3 backups, SSM, KMS | under $0.20 |
| Data out (first 100 GB free) | $0 |
| **Total** | **about $20** |

t4g instances run in "unlimited" CPU mode: only a day of sustained high CPU costs extra. The budget
alert catches surprises.

## IAM permissions the deploying user needs

For a pilot account the simplest is an IAM user (or SSO role) with these AWS managed policies:
`AmazonEC2FullAccess`, `AmazonSSMFullAccess`, `AmazonS3FullAccess`, `IAMFullAccess`,
`AWSDataLifecycleManagerFullAccess`, plus an inline policy allowing `budgets:ViewBudget`,
`budgets:ModifyBudget` and `kms:DescribeKey`. Narrower, the scripts call:

- `sts:GetCallerIdentity`
- EC2: `RunInstances`, `DescribeInstances`, `StartInstances`, `TerminateInstances`, `CreateTags`,
  `DescribeVpcs`, `CreateSecurityGroup`, `DescribeSecurityGroups`, `AuthorizeSecurityGroupIngress`,
  `DeleteSecurityGroup`, `AllocateAddress`, `DescribeAddresses`, `AssociateAddress`,
  `ReleaseAddress`, `DescribeSnapshots`, `DeleteSnapshot`
- `iam:CreateRole`, `GetRole`, `DeleteRole`, `AttachRolePolicy`, `DetachRolePolicy`,
  `PutRolePolicy`, `DeleteRolePolicy`, `CreateInstanceProfile`, `GetInstanceProfile`,
  `AddRoleToInstanceProfile`, `RemoveRoleFromInstanceProfile`, `DeleteInstanceProfile`,
  `TagRole`, `TagInstanceProfile`, `PassRole` (on `agent-finder-staging-instance` and
  `AWSDataLifecycleManagerDefaultRole`), `CreateRole` for that DLM default role (first run only)
- SSM: `PutParameter`, `GetParameter`, `GetParametersByPath`, `DeleteParameter(s)`,
  `SendCommand`, `GetCommandInvocation`, `DescribeInstanceInformation`, `StartSession`;
  `ssm:GetParameters` on `/aws/service/ami-amazon-linux-latest/*` (the AMI lookup)
- `kms:DescribeKey` (alias `aws/ssm`), `kms:Decrypt` via SSM (to read a code)
- S3 on the backup bucket: `CreateBucket`, `HeadBucket` (ListBucket), `PutBucketPublicAccessBlock`,
  `PutBucketVersioning`, `PutEncryptionConfiguration`, `PutLifecycleConfiguration`,
  `PutBucketPolicy`, `PutBucketTagging`, `ListBucketVersions`, `DeleteObject(Version)`,
  `DeleteBucket`, `GetObject` (restore)
- `budgets:ViewBudget`, `ModifyBudget`
- `dlm:CreateLifecyclePolicy`, `GetLifecyclePolicies`, `DeleteLifecyclePolicy`

For Session Manager from the laptop, install the AWS CLI's Session Manager plugin.

## Step by step

1. **Access key.** In the AWS console: IAM → Users → (your deploy user) → Security credentials →
   Create access key → "Command Line Interface". Download the CSV. Never paste the key in a chat.
2. **Configure the CLI**:
   `aws configure --profile agent-finder` (region `eu-west-1`, output `json`), or
   `aws configure import --csv file://path/to/accessKeys.csv` and rename the profile to
   `agent-finder`. Check: `aws sts get-caller-identity --profile agent-finder`.
   Then delete the CSV.
3. **Push the scripts.** The server clones the repository from GitHub, so `infra/aws/` must be
   committed and pushed on the branch you deploy (default `main`).
4. **Deploy**: `BUDGET_EMAIL=you@example.com infra/aws/deploy.sh`
   - The first time it makes the backup key pair and asks for a passphrase (12+ characters; keep
     it in a password manager). The private key stays in `~/.agent-finder-backup-key/` on your
     laptop. Copy that folder to a second safe place: without it no backup can be opened.
   - Secrets are generated with `openssl rand` and stored in SSM; they are never shown and never
     regenerated. `SENTRY_DSN` (and `VITE_SENTRY_DSN`, `VITE_TOMTOM_API_KEY` if present) are copied
     from the repository's `.env`.
   - First boot takes 10 to 20 minutes (Docker, image builds, three web builds, certificates).
     It ends by printing the four addresses.
5. **Test accounts**:
   `infra/aws/admin.sh create-aggregator test-agg "Mohira Test Aggregator" west`
   `infra/aws/admin.sh create-national orange-sales "Orange Sierra Leone, Sales"`
   The one-time code is not printed. The script prints an `aws ssm get-parameter …` line: run it
   yourself in your own terminal to see the code (it deletes the stored copy; unread, AWS deletes
   it after 2 hours). Add phone numbers in the Agent App, not here (command arguments are logged by AWS).
6. **Android APKs against staging**: GitHub → Actions → "Android APK" → Run workflow →
   `api_base_url` = `https://api.<ip>.sslip.io`. The live builds land in the `dev-latest` release.
   The API already allows the APK's origins (`https://localhost`, `capacitor://localhost`).
7. **Update** to a newer commit: `GIT_REF=main infra/aws/update.sh` (or a tag or commit). Database
   kept. `infra/aws/update.sh --logs` shows the end of the setup log.
   Other checks: `admin.sh status`, `admin.sh logs api|caddy|db`, `admin.sh backup-now`.
   A shell on the server: `aws ssm start-session --profile agent-finder --region eu-west-1 --target <instance-id>`.
8. **Teardown**: `infra/aws/teardown.sh` (type `agent-finder-staging` to confirm). Keeps the backup
   bucket and snapshots; `--delete-backups` removes those too.

## Backups and the restore test

Every night at 02:30 UTC the server runs `apps/api/scripts/backup_db.py` in a backup container:
`pg_dump`, a row-count manifest, encryption to the public backup key, 7 kept on the disk, and the
encrypted file moved to S3 (`postgres/`). The server can add to the bucket but holds no key that
opens a backup, and versioning means it cannot destroy earlier ones.

Test a restore from the laptop (do this once before the pitch, then monthly):

```bash
mkdir -p ~/af-restore && aws s3 cp --profile agent-finder s3://agent-finder-staging-backups-<account>/postgres/ ~/af-restore/ --recursive
docker run -d --name af-restore-check -e POSTGRES_PASSWORD=check -p 127.0.0.1:5433:5432 postgis/postgis:16-3.4
cd apps/api && GNUPGHOME=~/.agent-finder-backup-key \
  RESTORE_CHECK_URL=postgresql://postgres:check@127.0.0.1:5433/postgres \
  .venv/bin/python -m scripts.backup_db check --dir ~/af-restore
docker rm -f af-restore-check; rm -rf ~/af-restore
```

It needs `psql`/`pg_restore` 16+ on the laptop and asks for the key's passphrase.

## Security

Covered:
- HTTPS everywhere with automatic certificates; HTTP redirects to HTTPS; HSTS and the usual
  security headers on the web apps (the API sets its own); no access logs (query strings can hold a position).
- No SSH port and no key pair; admin through Session Manager. Inbound 80 and 443 only. IMDSv2
  required, hop limit 1, so no container can take the instance role's credentials.
- Secrets in SSM SecureString, generated on the laptop, never printed; on the server only in a
  root-only file (`/opt/agent-finder/.env`, mode 600). The instance role reads only `/agent-finder/staging/*`.
- Database not reachable from outside (no published port, internal network without internet).
- `APP_ENV=staging`: API docs off, the app refuses to start without its keys, no seeded demo
  accounts. The API trusts `X-Forwarded-For` only from Caddy's fixed address (172.30.0.10).
- Encrypted backups off the server, in a private versioned bucket, plus daily disk snapshots.
- One-time sign-in codes never appear in AWS command output or in a chat.
- Monthly budget alert.

Open (fine for staging, not for real customer data):
- One instance: no high availability; a failed instance means a restore (snapshots or S3).
- sslip.io names are fine for staging; production needs a real domain.
- Move to RDS (managed PostgreSQL, point-in-time recovery) and an ALB or App Runner later; then
  `FORWARDED_ALLOW_IPS` becomes the load balancer's range.
- Set `SENTRY_DSN` (and `VITE_SENTRY_DSN`) in `.env` before deploying so errors are seen. A
  failed nightly backup shows only in `systemctl status agent-finder-backup`: no alert yet.
- Restrict map keys (TomTom / Google) to the `*.sslip.io` staging names in their consoles.
- The API connects to PostgreSQL as its owner (superuser in the container); a least-privilege
  database user comes with RDS.
- No Content-Security-Policy yet on the web apps.
- Before real data: an independent security review, and a human expert's sign-off.
