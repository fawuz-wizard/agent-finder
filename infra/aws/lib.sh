# shellcheck shell=bash
# Shared settings and helpers for the staging scripts (deploy.sh, update.sh, admin.sh,
# teardown.sh). Sourced, never run. Runs on the laptop, not on the instance.
#
# Rules every script keeps: each step says in plain words what it does; a secret is never
# echoed, never put on a command line (other programs on the laptop can read those), and
# never written into an SSM command's output (AWS keeps that output).

AWS_PROFILE="${AWS_PROFILE:-agent-finder}"
REGION="${REGION:-eu-west-1}"
GIT_REF="${GIT_REF:-main}"
export AWS_PROFILE

NAME="agent-finder-staging"
PARAM_PREFIX="/agent-finder/staging"
REPO_URL="https://github.com/fawuz-wizard/agent-finder.git"
REPO_RAW="https://raw.githubusercontent.com/fawuz-wizard/agent-finder"
ROLE_NAME="${NAME}-instance"
SG_NAME="${NAME}-web"
INSTANCE_TYPE="t4g.small"
AMI_PARAM="/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
BACKUP_KEY_HOME="${BACKUP_KEY_HOME:-$HOME/.agent-finder-backup-key}"
BACKUP_KEY_UID="Agent Finder staging backups <backups@agent-finder.invalid>"

say() { printf '\n==> %s\n' "$*"; }
note() { printf '    %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

# Every aws call goes through here: one profile, one region, no pager.
awsr() { aws --profile "$AWS_PROFILE" --region "$REGION" --no-cli-pager "$@"; }

need() {
  local tool
  for tool in "$@"; do
    command -v "$tool" >/dev/null 2>&1 || die "'$tool' is not installed on this computer."
  done
}

check_ref() {
  # A branch, tag or commit: letters, digits and . _ / - only, so it is safe inside the remote
  # shell command without further quoting.
  [[ "$GIT_REF" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$ ]] || die "GIT_REF '$GIT_REF' is not a branch, tag or commit name."
}

check_ref_on_github() {
  # The instance builds from GitHub, not from this laptop: the infra/aws files must be
  # committed and pushed at GIT_REF, or the instance has nothing to run.
  say "Checking that GitHub has infra/aws at '$GIT_REF'"
  if ! curl -fsSL -o /dev/null "$REPO_RAW/$GIT_REF/infra/aws/instance-setup.sh"; then
    die "GitHub has no infra/aws/instance-setup.sh at '$GIT_REF'. Commit and push infra/aws first."
  fi
  note "found"
}

whoami_aws() {
  say "Checking who you are signed in to AWS as (profile '$AWS_PROFILE')"
  ACCOUNT_ID="$(awsr sts get-caller-identity --query Account --output text)" \
    || die "AWS sign-in failed. Run: aws configure --profile $AWS_PROFILE"
  note "account $ACCOUNT_ID, region $REGION"
  BUCKET="${NAME}-backups-${ACCOUNT_ID}"
}

find_instance() {
  # The one instance tagged with our name that is not terminated (empty if none).
  INSTANCE_ID="$(awsr ec2 describe-instances \
    --filters "Name=tag:Name,Values=$NAME" "Name=instance-state-name,Values=pending,running,stopping,stopped" \
    --query 'Reservations[].Instances[].InstanceId | [0]' --output text)"
  [[ "$INSTANCE_ID" == "None" ]] && INSTANCE_ID=""
  return 0
}

site_suffix() {
  # 3.250.1.2 -> 3-250-1-2.sslip.io (sslip.io answers DNS for any such name with that IP).
  local ip
  ip="$(awsr ssm get-parameter --name "$PARAM_PREFIX/PUBLIC_IP" --query Parameter.Value --output text 2>/dev/null)" \
    || die "No public address recorded yet: run deploy.sh first."
  SITE_SUFFIX="${ip//./-}.sslip.io"
}

wait_for_ssm() {
  say "Waiting for the instance to check in with Systems Manager (up to 10 minutes)"
  local i status
  for i in $(seq 1 60); do
    status="$(awsr ssm describe-instance-information \
      --filters "Key=InstanceIds,Values=$INSTANCE_ID" \
      --query 'InstanceInformationList[0].PingStatus' --output text 2>/dev/null || true)"
    if [[ "$status" == "Online" ]]; then note "online"; return 0; fi
    sleep 10
  done
  die "The instance never checked in with Systems Manager. Check its role has AmazonSSMManagedInstanceCore."
}

# ssm_run "description" "command line" ["command line" ...]
# Runs shell lines as root on the instance through SSM Run Command and prints their output.
# AWS keeps that output for a while: never pass or print a secret through here.
ssm_run() {
  local desc="$1"; shift
  local params cmd_id status i
  params="$(mktemp)"
  python3 - "$@" >"$params" <<'PY'
import json, sys
print(json.dumps({"commands": sys.argv[1:], "executionTimeout": ["3600"]}))
PY
  cmd_id="$(awsr ssm send-command --instance-ids "$INSTANCE_ID" \
    --document-name AWS-RunShellScript --comment "$desc" --timeout-seconds 600 \
    --parameters "file://$params" --query Command.CommandId --output text)"
  rm -f "$params"
  note "running on the instance (command $cmd_id); this can take several minutes"
  status="Pending"
  for i in $(seq 1 400); do
    sleep 10
    status="$(awsr ssm get-command-invocation --command-id "$cmd_id" --instance-id "$INSTANCE_ID" \
      --query Status --output text 2>/dev/null || echo Pending)"
    case "$status" in Pending|InProgress|Delayed) continue ;; *) break ;; esac
  done
  awsr ssm get-command-invocation --command-id "$cmd_id" --instance-id "$INSTANCE_ID" \
    --query StandardOutputContent --output text | sed 's/^/    | /'
  if [[ "$status" != "Success" ]]; then
    awsr ssm get-command-invocation --command-id "$cmd_id" --instance-id "$INSTANCE_ID" \
      --query StandardErrorContent --output text | tail -n 30 | sed 's/^/    ! /'
    die "'$desc' ended with status $status."
  fi
}

# The remote lines that bring the instance to GIT_REF and run the setup from that ref.
redeploy_lines() {
  printf '%s\n' \
    "set -euo pipefail" \
    "cloud-init status --wait >/dev/null 2>&1 || true" \
    "cd /opt/agent-finder/src" \
    "git fetch --quiet --depth 1 origin '$GIT_REF'" \
    "git checkout --quiet --force FETCH_HEAD" \
    "echo \"Checked out $GIT_REF at \$(git rev-parse --short HEAD)\"" \
    "bash infra/aws/instance-setup.sh 2>&1 | tee -a /var/log/agent-finder-setup.log"
}

wait_for_health() {
  # $1 = minutes to wait
  local url="https://api.$SITE_SUFFIX/health" i
  say "Waiting for $url to answer (up to $1 minutes)"
  for i in $(seq 1 $(( $1 * 6 ))); do
    if curl -fsS --max-time 8 "$url" >/dev/null 2>&1; then
      note "$(curl -fsS --max-time 8 "$url")"
      return 0
    fi
    sleep 10
  done
  return 1
}

print_urls() {
  say "Staging addresses"
  note "API:             https://api.$SITE_SUFFIX   (health: /health)"
  note "Customer app:    https://app.$SITE_SUFFIX"
  note "Agent App:       https://agent.$SITE_SUFFIX"
  note "National console: https://national.$SITE_SUFFIX"
}
