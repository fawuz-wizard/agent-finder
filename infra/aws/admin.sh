#!/usr/bin/env bash
# Admin commands for Agent Finder STAGING, run inside the API container through SSM Run
# Command (no SSH).
#
#   infra/aws/admin.sh create-aggregator test-agg "Mohira Test Aggregator" west
#   infra/aws/admin.sh create-national orange-sales "Orange Sierra Leone, Sales"
#   infra/aws/admin.sh status            # containers and their health
#   infra/aws/admin.sh logs api          # last 100 lines of api, caddy or db
#   infra/aws/admin.sh backup-now        # run the nightly backup immediately
#   infra/aws/admin.sh publish-apks DIR  # put DIR/agent-app.apk and agent-finder.apk on
#                                        # https://app.<suffix>/download/ for agents to install
#
# Where the one-time code goes, and why:
#   AWS keeps the output of every Run Command, and whoever runs this script (a person, or an
#   assistant in a chat) sees that output. A sign-in code printed there would sit in AWS and
#   in that chat. So the remote command keeps the code out of its output: it stores the
#   script's output in an encrypted SSM SecureString /agent-finder/staging/codes/<id> that
#   AWS deletes by itself after 2 hours (an "Expiration" policy, which needs the Advanced
#   tier: about $0.05 a month while it exists, so nothing in practice). This script then
#   prints a one-liner that YOU run in your own terminal to read the code and delete it.
#   The other option (a root-only file on the instance, read through a Session Manager shell)
#   works too, but is more steps for the reader and leaves a file behind if forgotten.
#
# A phone number is not accepted here on purpose: the command's arguments are stored by AWS
# too. Add the phone in the Agent App after signing in.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
# shellcheck source=lib.sh
. ./lib.sh

usage() { sed -n '2,9p' "$0"; exit 1; }
[[ $# -ge 1 ]] || usage
action="$1"; shift

need aws python3
b64() { printf '%s' "$1" | base64 | tr -d '\n'; }
check_id() {
  [[ "$1" =~ ^[a-z0-9][a-z0-9-]{1,38}$ ]] || die "Account name: 2-39 lower-case letters, digits or '-', e.g. test-agg"
  [[ "$1" != agg-* ]] || die "Account names starting with 'agg-' are kept for Orange's report."
}
check_name() {
  [[ ${#1} -ge 2 && ${#1} -le 80 ]] || die "The display name must be 2 to 80 characters."
  [[ "$1" != *[[:cntrl:]]* ]] || die "The display name has a control character."
}

# The lines that run the script in the API container and store its output as a code.
# Arguments travel base64-encoded, so no name can break out of the remote shell's quoting.
code_lines() {  # $1 id  $2 python command (fixed text)  then base64 args
  local id="$1" py="$2"; shift 2
  printf '%s\n' \
    "set -euo pipefail" \
    "umask 077" \
    "tmp=\$(mktemp -d); trap 'rm -rf \"\$tmp\"' EXIT" \
    "args=(); for a in $*; do args+=(\"\$(printf %s \"\$a\" | base64 -d)\"); done" \
    "if ! /usr/local/bin/af-compose exec -T api $py \"\${args[@]}\" >\"\$tmp/out\" 2>\"\$tmp/err\"; then echo \"Not created: \$(tail -n 1 \"\$tmp/err\")\"; exit 1; fi" \
    "T=\$(curl -fsS -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60')" \
    "export AWS_DEFAULT_REGION=\$(curl -fsS -H \"X-aws-ec2-metadata-token: \$T\" http://169.254.169.254/latest/meta-data/placement/region)" \
    "expiry=\$(date -u -d '+2 hours' +%Y-%m-%dT%H:%M:%SZ)" \
    "printf '[{\"Type\":\"Expiration\",\"Version\":\"1.0\",\"Attributes\":{\"Timestamp\":\"%s\"}}]' \"\$expiry\" >\"\$tmp/policy\"" \
    "aws ssm put-parameter --name '$PARAM_PREFIX/codes/$id' --type SecureString --tier Advanced --overwrite --value \"file://\$tmp/out\" --policies \"file://\$tmp/policy\" >/dev/null" \
    "echo \"Account $id is ready. Its one-time code is stored encrypted in SSM until \$expiry UTC (not shown here).\""
}

show_reader() {
  local p="$PARAM_PREFIX/codes/$1"
  say "To read the one-time code, run this yourself in your own terminal (not in a chat):"
  printf '\n  aws ssm get-parameter --profile %s --region %s --name %s --with-decryption --query Parameter.Value --output text && aws ssm delete-parameter --profile %s --region %s --name %s\n\n' \
    "$AWS_PROFILE" "$REGION" "$p" "$AWS_PROFILE" "$REGION" "$p"
  note "It deletes the stored copy after showing it. Unread, it is deleted by AWS after 2 hours."
  note "Give the code to the person in person; it works once, then they choose their own PIN."
}

case "$action" in
  create-aggregator)
    [[ $# -eq 3 ]] || die "Usage: admin.sh create-aggregator <id> \"<name>\" <west|north|south|east>"
    id="$1"; name="$2"; region="$3"
    check_id "$id"; check_name "$name"
    [[ "$region" =~ ^(west|north|south|east)$ ]] || die "Region must be west, north, south or east."
    whoami_aws; find_instance; [[ -n "$INSTANCE_ID" ]] || die "No staging instance. Run deploy.sh first."
    say "Creating (or resetting) aggregator '$id' in region $region"
    mapfile -t lines < <(code_lines "$id" "python -m scripts.create_aggregator" \
      "$(b64 "$id")" "$(b64 "$name")" "$(b64 --region)" "$(b64 "$region")")
    ssm_run "agent-finder create-aggregator $id" "${lines[@]}"
    show_reader "$id"
    ;;
  create-national)
    [[ $# -eq 2 ]] || die "Usage: admin.sh create-national <id> \"<name>\""
    id="$1"; name="$2"
    check_id "$id"; check_name "$name"
    whoami_aws; find_instance; [[ -n "$INSTANCE_ID" ]] || die "No staging instance. Run deploy.sh first."
    say "Creating (or resetting) national account '$id'"
    mapfile -t lines < <(code_lines "$id" "python -m scripts.create_national_account" "$(b64 "$id")" "$(b64 "$name")")
    ssm_run "agent-finder create-national $id" "${lines[@]}"
    show_reader "$id"
    ;;
  status)
    whoami_aws; find_instance; [[ -n "$INSTANCE_ID" ]] || die "No staging instance."
    say "Containers on $INSTANCE_ID"
    ssm_run "agent-finder status" "/usr/local/bin/af-compose ps" "systemctl list-timers agent-finder-backup.timer --no-pager | head -n 2" "df -h / | tail -n 1"
    ;;
  logs)
    svc="${1:-api}"
    [[ "$svc" =~ ^(api|caddy|db)$ ]] || die "logs takes api, caddy or db."
    whoami_aws; find_instance; [[ -n "$INSTANCE_ID" ]] || die "No staging instance."
    say "Last 100 log lines of $svc"
    ssm_run "agent-finder logs $svc" "/usr/local/bin/af-compose logs --no-color --tail 100 $svc"
    ;;
  backup-now)
    whoami_aws; find_instance; [[ -n "$INSTANCE_ID" ]] || die "No staging instance."
    say "Running the backup now"
    ssm_run "agent-finder backup" "/usr/local/sbin/agent-finder-backup"
    ;;
  publish-apks)
    dir="${1:-}"
    [[ -f "$dir/agent-app.apk" && -f "$dir/agent-finder.apk" ]] || die "publish-apks needs a folder with agent-app.apk and agent-finder.apk."
    for f in agent-app.apk agent-finder.apk; do
      [[ "$(head -c 2 "$dir/$f")" == "PK" ]] || die "$f is not an Android app (APK)."
    done
    whoami_aws; find_instance; [[ -n "$INSTANCE_ID" ]] || die "No staging instance."
    say "Uploading the two apps to the private bucket"
    stamp="$(date -u +%Y%m%d%H%M%S)"
    for f in agent-app.apk agent-finder.apk; do
      awsr s3 cp --only-show-errors --sse aws:kms "$dir/$f" "s3://$BUCKET/releases/apk-$stamp/$f"
    done
    awsr s3 cp --only-show-errors --sse aws:kms "$(dirname "$0")/download.html" "s3://$BUCKET/releases/apk-$stamp/index.html"
    say "Placing them on the download page"
    ssm_run "agent-finder publish apks" \
      "set -euo pipefail" \
      "d=/opt/agent-finder/www/download; n=\$d.next; rm -rf \$n; install -d -m 755 \$n" \
      "aws s3 cp --only-show-errors --recursive --region '$REGION' 's3://$BUCKET/releases/apk-$stamp/' \$n/" \
      "chmod 644 \$n/*; rm -rf \$d.old; if [ -d \$d ]; then mv \$d \$d.old; fi; mv \$n \$d; rm -rf \$d.old" \
      "ls -l \$d"
    site_suffix
    note "Download page: https://app.$SITE_SUFFIX/download/"
    ;;
  *) usage ;;
esac
