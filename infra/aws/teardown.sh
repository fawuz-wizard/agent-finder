#!/usr/bin/env bash
# Deletes Agent Finder STAGING from AWS: the instance and its disk (with the database on it),
# the Elastic IP, the firewall, the instance role, the snapshot policy, the budget and every
# SSM parameter under /agent-finder/staging/ (the secrets included).
#
#   infra/aws/teardown.sh                    # keeps the backups (S3 bucket + disk snapshots)
#   infra/aws/teardown.sh --delete-backups   # deletes those too: no way back after this
#
# Asks you to type the environment's name first. Left alone either way: the backup key on this
# laptop (~/.agent-finder-backup-key) and the account-wide AWSDataLifecycleManagerDefaultRole.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
# shellcheck source=lib.sh
. ./lib.sh

DELETE_BACKUPS=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) AWS_PROFILE="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --delete-backups) DELETE_BACKUPS=1; shift ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) die "Unknown option $1 (see --help)" ;;
  esac
done
export AWS_PROFILE

need aws python3
whoami_aws
find_instance

say "This deletes STAGING in account $ACCOUNT_ID ($REGION): instance ${INSTANCE_ID:-none}, its database, secrets and address."
if [[ "$DELETE_BACKUPS" == 1 ]]; then
  note "--delete-backups: the bucket s3://$BUCKET and the disk snapshots are deleted too."
else
  note "The backups are kept: s3://$BUCKET and the disk snapshots."
fi
read -rp "    Type $NAME to go on: " answer
[[ "$answer" == "$NAME" ]] || die "Not confirmed; nothing deleted."

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [[ -n "$INSTANCE_ID" ]]; then
  say "Terminating the instance $INSTANCE_ID (its disk goes with it)"
  awsr ec2 terminate-instances --instance-ids "$INSTANCE_ID" >/dev/null
  awsr ec2 wait instance-terminated --instance-ids "$INSTANCE_ID"
fi

ALLOC_ID="$(awsr ec2 describe-addresses --filters "Name=tag:Name,Values=$NAME" --query 'Addresses[0].AllocationId' --output text)"
if [[ "$ALLOC_ID" != "None" ]]; then
  say "Releasing the Elastic IP"
  awsr ec2 release-address --allocation-id "$ALLOC_ID"
fi

SG_ID="$(awsr ec2 describe-security-groups --filters "Name=group-name,Values=$SG_NAME" --query 'SecurityGroups[0].GroupId' --output text)"
if [[ "$SG_ID" != "None" ]]; then
  say "Deleting the security group $SG_ID"
  awsr ec2 delete-security-group --group-id "$SG_ID"
fi

if awsr iam get-instance-profile --instance-profile-name "$ROLE_NAME" >/dev/null 2>&1; then
  say "Deleting the instance profile and role $ROLE_NAME"
  awsr iam remove-role-from-instance-profile --instance-profile-name "$ROLE_NAME" --role-name "$ROLE_NAME" 2>/dev/null || true
  awsr iam delete-instance-profile --instance-profile-name "$ROLE_NAME"
fi
if awsr iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  awsr iam delete-role-policy --role-name "$ROLE_NAME" --policy-name "${NAME}-scoped" 2>/dev/null || true
  awsr iam detach-role-policy --role-name "$ROLE_NAME" --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore 2>/dev/null || true
  awsr iam delete-role --role-name "$ROLE_NAME"
fi

DLM_ID="$(awsr dlm get-lifecycle-policies --target-tags "Snapshot=$NAME" --query 'Policies[0].PolicyId' --output text 2>/dev/null || echo None)"
if [[ "$DLM_ID" != "None" && -n "$DLM_ID" ]]; then
  say "Deleting the daily snapshot policy $DLM_ID"
  awsr dlm delete-lifecycle-policy --policy-id "$DLM_ID" >/dev/null
fi

if awsr budgets describe-budget --account-id "$ACCOUNT_ID" --budget-name "$NAME" >/dev/null 2>&1; then
  say "Deleting the budget $NAME"
  awsr budgets delete-budget --account-id "$ACCOUNT_ID" --budget-name "$NAME"
fi

say "Deleting the SSM parameters under $PARAM_PREFIX/ (names only listed, no values)"
mapfile -t names < <(awsr ssm get-parameters-by-path --path "$PARAM_PREFIX/" --recursive \
  --query 'Parameters[].Name' --output text | tr '\t' '\n' | sed '/^$/d')
for ((i = 0; i < ${#names[@]}; i += 10)); do
  awsr ssm delete-parameters --names "${names[@]:i:10}" >/dev/null
done
note "${#names[@]} deleted"

if [[ "$DELETE_BACKUPS" == 1 ]]; then
  say "Deleting the disk snapshots tagged Snapshot=$NAME"
  for snap in $(awsr ec2 describe-snapshots --owner-ids self --filters "Name=tag:Snapshot,Values=$NAME" \
      --query 'Snapshots[].SnapshotId' --output text); do
    awsr ec2 delete-snapshot --snapshot-id "$snap"
    note "$snap"
  done
  if awsr s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1; then
    say "Emptying (every version) and deleting the bucket s3://$BUCKET"
    while :; do
      awsr s3api list-object-versions --bucket "$BUCKET" --max-items 500 --output json >"$WORK/v.json"
      python3 - "$WORK/v.json" >"$WORK/d.json" <<'PY'
import json, sys
raw = open(sys.argv[1]).read().strip()
page = json.loads(raw) if raw else {}
objs = [{"Key": o["Key"], "VersionId": o["VersionId"]}
        for o in (page.get("Versions") or []) + (page.get("DeleteMarkers") or [])]
print(json.dumps({"Objects": objs, "Quiet": True}) if objs else "")
PY
      [[ -s "$WORK/d.json" ]] || break
      awsr s3api delete-objects --bucket "$BUCKET" --delete "file://$WORK/d.json" >/dev/null
    done
    awsr s3api delete-bucket --bucket "$BUCKET"
  fi
fi

say "Staging is deleted."
[[ "$DELETE_BACKUPS" == 1 ]] || note "Kept: s3://$BUCKET (expires each backup after 35 days) and the disk snapshots."
note "Kept on this laptop: $BACKUP_KEY_HOME (needed to open any kept backup)."
