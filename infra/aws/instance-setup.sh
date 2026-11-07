#!/usr/bin/env bash
# Brings the STAGING instance to the code checked out in /opt/agent-finder/src and (re)starts
# it. Runs as root ON THE INSTANCE: from user-data on first boot, and from update.sh /
# deploy.sh through SSM Run Command afterwards. Safe to run again and again.
#
# What it does, in order:
#   1. installs Docker, the Compose plugin and git (first run only), log rotation, a swap file
#   2. fetches the settings and secrets from SSM Parameter Store into /opt/agent-finder/.env
#      (root only, mode 600); the values are never printed
#   3. builds the database, API and backup images from this checkout
#   4. builds the three web apps inside a node:22 container (the instance has no Node)
#   5. starts or updates the containers and waits for the API to report healthy
#   6. installs the nightly backup timer
#
# Never add `set -x` here: the output is kept by AWS (SSM) and in the setup log.
set -euo pipefail
umask 022

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AF=/opt/agent-finder
PARAM_PREFIX=/agent-finder/staging
COMPOSE_VERSION=v2.29.7

say() { printf '\n[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
[[ $EUID -eq 0 ]] || { echo "Run as root." >&2; exit 1; }

say "Finding this instance's region"
TOKEN="$(curl -fsS -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 300')"
REGION="$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/placement/region)"
export AWS_DEFAULT_REGION="$REGION"
echo "region $REGION"

# --- 1. Packages ------------------------------------------------------------------------------
if ! command -v docker >/dev/null || ! command -v git >/dev/null; then
  say "Installing Docker and git"
  dnf install -y -q docker git
fi
if [[ ! -f /etc/docker/daemon.json ]]; then
  say "Turning on log rotation for containers (10 MB x 3 per container)"
  mkdir -p /etc/docker
  printf '{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }\n' >/etc/docker/daemon.json
fi
systemctl enable --now docker >/dev/null

PLUGIN=/usr/local/lib/docker/cli-plugins/docker-compose
if ! "$PLUGIN" version 2>/dev/null | grep -q "${COMPOSE_VERSION#v}"; then
  say "Installing the Docker Compose plugin $COMPOSE_VERSION"
  case "$(uname -m)" in aarch64) arch=aarch64 ;; x86_64) arch=x86_64 ;; *) echo "unknown CPU" >&2; exit 1 ;; esac
  base="https://github.com/docker/compose/releases/download/$COMPOSE_VERSION/docker-compose-linux-$arch"
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/docker-compose-linux-$arch" "$base"
  curl -fsSL -o "$tmp/sum" "$base.sha256"
  (cd "$tmp" && sha256sum -c sum)
  install -D -m 755 "$tmp/docker-compose-linux-$arch" "$PLUGIN"
  rm -rf "$tmp"
fi

if [[ ! -f /swapfile ]]; then
  say "Adding a 2 GB swap file (the web builds need more than the instance's 2 GB of memory)"
  dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  echo '/swapfile none swap defaults 0 0' >>/etc/fstab
fi
swapon --show | grep -q /swapfile || swapon /swapfile

install -d -m 755 "$AF" "$AF/caddy" "$AF/www"
install -d -m 700 -o 10001 -g 10001 /var/backups/agent-finder /var/lib/agent-finder/outbox

# The one way to run compose here: right file, right project, the root-only env file.
cat >/usr/local/bin/af-compose <<'EOF'
#!/bin/sh
exec docker compose --project-name agent-finder -f /opt/agent-finder/src/infra/aws/compose.yml --env-file /opt/agent-finder/.env "$@"
EOF
chmod 755 /usr/local/bin/af-compose

# --- 2. Settings and secrets ------------------------------------------------------------------
say "Fetching settings and secrets from SSM Parameter Store into $AF/.env (values not shown)"
API_TAG="$(git -C "$SRC" rev-parse --short=12 HEAD)"
params_json="$(mktemp)"
chmod 600 "$params_json"
# Only the direct children of the prefix (not codes/). Decrypted values go to a root-only file.
aws ssm get-parameters-by-path --path "$PARAM_PREFIX/" --with-decryption --output json >"$params_json"
python3 - "$params_json" "$AF/.env.new" "$API_TAG" <<'PY'
import json, os, sys
src, dst, api_tag = sys.argv[1:4]
values = {p["Name"].rsplit("/", 1)[1]: p["Value"] for p in json.load(open(src))["Parameters"]}
values.pop("BACKUP_GPG_PUBLIC_KEY", None)  # many lines: written to its own file below
for need in ("PIN_PEPPER", "CUSTOMER_HASH_KEY", "POSTGRES_PASSWORD", "PUBLIC_IP",
             "BACKUP_GPG_RECIPIENT", "BACKUP_BUCKET"):
    if not values.get(need):
        sys.exit(f"SSM parameter {need} is missing: run deploy.sh again.")
values["SITE_SUFFIX"] = values["PUBLIC_IP"].replace(".", "-") + ".sslip.io"
values["API_TAG"] = api_tag
fd = os.open(dst, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as f:
    for key, value in sorted(values.items()):
        if "'" in value or "\n" in value:
            sys.exit(f"SSM parameter {key} holds a quote or a line break; not written.")
        f.write(f"{key}='{value}'\n")  # single quotes: Compose takes the value literally
print("names:", ", ".join(sorted(values)))
PY
rm -f "$params_json"
mv "$AF/.env.new" "$AF/.env"
chown root:root "$AF/.env"
chmod 600 "$AF/.env"

aws ssm get-parameter --name "$PARAM_PREFIX/BACKUP_GPG_PUBLIC_KEY" --query Parameter.Value --output text >"$AF/backup-key.asc"
chmod 644 "$AF/backup-key.asc"  # a public key: nothing secret

env_value() { sed -n "s/^$1='\(.*\)'\$/\1/p" "$AF/.env"; }
SITE_SUFFIX="$(env_value SITE_SUFFIX)"

# --- 3. Images ---------------------------------------------------------------------------------
say "Building the database image (PostgreSQL 16 + PostGIS)"
docker build -q -t agent-finder-db:16 -f "$SRC/infra/aws/db.Dockerfile" "$SRC/infra/aws"
say "Building the API image at $API_TAG"
docker build -q -t "agent-finder-api:$API_TAG" -t agent-finder-api:current "$SRC/apps/api"
say "Building the backup image"
docker build -q -t "agent-finder-backup:$API_TAG" --build-arg "API_IMAGE=agent-finder-api:$API_TAG" \
  -f "$SRC/infra/aws/backup.Dockerfile" "$SRC/infra/aws"

# --- 4. Web apps -------------------------------------------------------------------------------
say "Building the customer, Agent App and national web apps against https://api.$SITE_SUFFIX"
# Optional keys: passed to the container by name (-e NAME), so the values are not on a
# command line. They end up inside the public JavaScript anyway, as browser keys always do.
VITE_SENTRY_DSN="$(env_value VITE_SENTRY_DSN)"
VITE_TOMTOM_API_KEY="$(env_value VITE_TOMTOM_API_KEY)"
export VITE_SENTRY_DSN VITE_TOMTOM_API_KEY
next="$AF/www/.next"
rm -rf "$next"
mkdir -p "$next"
docker run --rm \
  -v "$SRC/apps/web:/src:ro" -v "$next:/out" -v agent-finder-npm-cache:/root/.npm \
  -e VITE_API_MODE=live -e "VITE_API_BASE_URL=https://api.$SITE_SUFFIX" -e VITE_APP_ENV=staging \
  -e VITE_SENTRY_DSN -e VITE_TOMTOM_API_KEY -e NODE_OPTIONS=--max-old-space-size=1536 \
  node:22 bash -ec '
    cp -a /src /build && cd /build && rm -rf node_modules dist
    npm ci --legacy-peer-deps --no-audit --no-fund --loglevel=error
    for s in customer agent national; do
      echo "building $s"
      VITE_APP_SURFACE=$s npx vite build --outDir "/out/$s" --emptyOutDir --logLevel warn
    done'
for s in customer agent national; do
  [[ -f "$next/$s/index.html" ]] || { echo "The $s build has no index.html" >&2; exit 1; }
  rm -rf "$AF/www/.old-$s"
  [[ -d "$AF/www/$s" ]] && mv "$AF/www/$s" "$AF/www/.old-$s"
  mv "$next/$s" "$AF/www/$s"
  rm -rf "$AF/www/.old-$s"
done
rm -rf "$next"

# --- 5. Start ----------------------------------------------------------------------------------
say "Starting the containers"
# cp onto the existing file keeps the folder caddy has mounted.
cp "$SRC/infra/aws/Caddyfile" "$AF/caddy/Caddyfile"
af-compose pull --quiet caddy
af-compose up -d --remove-orphans

say "Waiting for the API to report healthy (it runs the database migrations first)"
health=starting
for _ in $(seq 1 60); do
  health="$(docker inspect -f '{{.State.Health.Status}}' "$(af-compose ps -q api)" 2>/dev/null || echo starting)"
  [[ "$health" == healthy ]] && break
  sleep 5
done
if [[ "$health" != healthy ]]; then
  echo "The API is not healthy ($health). Its last log lines:" >&2
  af-compose logs --tail 40 api >&2 || true
  exit 1
fi
echo "API healthy"
af-compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile

# --- 6. Backups --------------------------------------------------------------------------------
say "Installing the nightly backup timer"
install -m 750 "$SRC/infra/aws/backup.sh" /usr/local/sbin/agent-finder-backup
install -m 644 "$SRC/infra/aws/systemd/agent-finder-backup.service" "$SRC/infra/aws/systemd/agent-finder-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now agent-finder-backup.timer >/dev/null
systemctl list-timers agent-finder-backup.timer --no-pager | head -n 2

say "Removing images no longer used"
for repo in agent-finder-api agent-finder-backup; do
  docker images "$repo" --format '{{.Tag}}' | grep -vxE "current|$API_TAG" \
    | while read -r tag; do docker rmi "$repo:$tag" >/dev/null 2>&1 || true; done
done
docker image prune -f >/dev/null

say "Done: https://api.$SITE_SUFFIX is running $API_TAG"
