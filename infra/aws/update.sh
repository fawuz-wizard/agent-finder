#!/usr/bin/env bash
# Redeploys Agent Finder STAGING at a new branch, tag or commit, through SSM Run Command (no
# SSH). On the instance: git fetch + checkout, rebuild the API and the three web apps, and
# `compose up -d`. The database and its data are kept.
#
#   GIT_REF=main infra/aws/update.sh
#   infra/aws/update.sh --git-ref v0.2.0
#   infra/aws/update.sh --logs          # only show the end of the instance's setup log
#
# The ref must be pushed to GitHub: the instance fetches from there, not from this laptop.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
# shellcheck source=lib.sh
. ./lib.sh

LOGS_ONLY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) AWS_PROFILE="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --git-ref) GIT_REF="$2"; shift 2 ;;
    --logs) LOGS_ONLY=1; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) die "Unknown option $1 (see --help)" ;;
  esac
done
export AWS_PROFILE

need aws python3 curl
check_ref
whoami_aws
find_instance
[[ -n "$INSTANCE_ID" ]] || die "No staging instance found. Run deploy.sh first."
site_suffix

if [[ "$LOGS_ONLY" == 1 ]]; then
  say "The last lines of the setup log on $INSTANCE_ID"
  ssm_run "agent-finder setup log" "tail -n 80 /var/log/agent-finder-setup.log"
  exit 0
fi

check_ref_on_github
say "Redeploying '$GIT_REF' on $INSTANCE_ID"
mapfile -t lines < <(redeploy_lines)
ssm_run "agent-finder deploy $GIT_REF" "${lines[@]}"
wait_for_health 5 || die "The API does not answer over HTTPS. See: infra/aws/update.sh --logs"
print_urls
