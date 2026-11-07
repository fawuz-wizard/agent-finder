#!/usr/bin/env bash
# Creates or updates Agent Finder STAGING on AWS (one EC2 instance running Docker Compose).
# Runs on your laptop. Safe to run again: what exists is kept, what is missing is made, and on
# an existing instance it ends by redeploying GIT_REF (the same as update.sh).
#
#   BUDGET_EMAIL=you@example.com infra/aws/deploy.sh
#   infra/aws/deploy.sh --budget-email you@example.com --git-ref main --profile agent-finder
#
# Settings (flag or environment variable):
#   --profile  AWS_PROFILE    AWS CLI profile                     (default agent-finder)
#   --region   REGION         AWS region                           (default eu-west-1)
#   --git-ref  GIT_REF        branch, tag or commit to deploy      (default main)
#   --budget-email BUDGET_EMAIL  who gets the cost alert           (required)
#   --budget   BUDGET_USD     monthly budget in US dollars         (default 25)
#
# Before the first run: commit infra/aws/ at GIT_REF (the laptop packs that commit for the instance;
# the repository; it cannot see this laptop).
#
# Secrets: PIN_PEPPER, CUSTOMER_HASH_KEY and POSTGRES_PASSWORD are generated here with
# openssl the first time and stored as SSM SecureStrings. They are NEVER regenerated: a new
# PIN_PEPPER or CUSTOMER_HASH_KEY would make every stored PIN and customer code unusable.
# They are never printed. The backup key pair is generated here too; only its public half
# leaves this laptop.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
# shellcheck source=lib.sh
. ./lib.sh

BUDGET_USD="${BUDGET_USD:-25}"
BUDGET_EMAIL="${BUDGET_EMAIL:-}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) AWS_PROFILE="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --git-ref) GIT_REF="$2"; shift 2 ;;
    --budget-email) BUDGET_EMAIL="$2"; shift 2 ;;
    --budget) BUDGET_USD="$2"; shift 2 ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) die "Unknown option $1 (see --help)" ;;
  esac
done
export AWS_PROFILE

need aws openssl gpg python3 curl
check_ref
[[ "$BUDGET_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "Set BUDGET_EMAIL (or --budget-email) to the address for the cost alert."
[[ "$BUDGET_USD" =~ ^[0-9]{1,4}$ ]] || die "--budget must be a whole number of dollars."
REPO_ROOT="$(cd ../.. && pwd)"

whoami_aws
check_ref_local

WORK="$(mktemp -d)"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT

# put_param NAME TYPE FILE: stores the file's content; file:// keeps it off the command line.
put_param() {
  awsr ssm put-parameter --name "$PARAM_PREFIX/$1" --type "$2" --value "file://$3" --overwrite >/dev/null
}
param_exists() {
  awsr ssm get-parameter --name "$PARAM_PREFIX/$1" --query Parameter.Name --output text >/dev/null 2>&1
}
# A value from the repository's .env, read without sourcing the file and without printing.
dotenv_value() {
  [[ -f "$REPO_ROOT/.env" ]] || return 0
  sed -n "s/^$1=//p" "$REPO_ROOT/.env" | tail -n 1 | sed -e 's/^["'\'']//' -e 's/["'\'']$//' | tr -d '\r\n'
}

# --- Secrets ----------------------------------------------------------------------------------
say "Making sure the secrets exist in SSM Parameter Store under $PARAM_PREFIX/"
for name in PIN_PEPPER CUSTOMER_HASH_KEY POSTGRES_PASSWORD; do
  if param_exists "$name"; then
    note "$name: already stored, kept as it is"
  else
    (umask 077; openssl rand -hex 32 | tr -d '\n' >"$WORK/v")
    put_param "$name" SecureString "$WORK/v"
    rm -f "$WORK/v"
    note "$name: generated (64 random hex characters) and stored"
  fi
done
for name in SENTRY_DSN VITE_SENTRY_DSN VITE_TOMTOM_API_KEY; do
  (umask 077; dotenv_value "$name" >"$WORK/v")
  if [[ -s "$WORK/v" ]]; then
    put_param "$name" SecureString "$WORK/v"
    note "$name: copied from the repository's .env"
  else
    note "$name: not set in .env, left as it is (optional)"
  fi
  rm -f "$WORK/v"
done

# --- Backup key pair (GnuPG) -----------------------------------------------------------------
say "Making sure the backup encryption key exists in $BACKUP_KEY_HOME (on this laptop only)"
mkdir -p "$BACKUP_KEY_HOME"
chmod 700 "$BACKUP_KEY_HOME"
G=(gpg --homedir "$BACKUP_KEY_HOME" --batch)
if ! "${G[@]}" --list-secret-keys "$BACKUP_KEY_UID" >/dev/null 2>&1; then
  note "No key yet: making one. Choose a passphrase (12+ characters) and keep it in a password manager."
  pass="${BACKUP_KEY_PASSPHRASE:-}"
  if [[ -z "$pass" ]]; then
    read -rsp "    Passphrase for the backup key: " pass; echo
    read -rsp "    Same passphrase again: " pass2; echo
    [[ "$pass" == "$pass2" ]] || die "The two passphrases differ."
  fi
  [[ ${#pass} -ge 12 ]] || die "The passphrase must be 12 or more characters."
  "${G[@]}" --pinentry-mode loopback --passphrase-fd 3 \
    --quick-gen-key "$BACKUP_KEY_UID" future-default default never 3<<<"$pass"
  unset pass pass2
  note "Made. The PRIVATE key is in $BACKUP_KEY_HOME and nowhere else."
  note "Without it (and its passphrase) no backup can ever be opened: copy that folder to a"
  note "safe second place (an encrypted USB stick or a password manager), never into git or a chat."
fi
FPR="$("${G[@]}" --with-colons --list-keys "$BACKUP_KEY_UID" | awk -F: '/^fpr:/ {print $10; exit}')"
"${G[@]}" --armor --export "$FPR" >"$WORK/pub.asc"
printf '%s' "$FPR" >"$WORK/fpr"
put_param BACKUP_GPG_PUBLIC_KEY String "$WORK/pub.asc"
put_param BACKUP_GPG_RECIPIENT String "$WORK/fpr"
note "public key $FPR stored in SSM (public: not a secret)"

# --- Backup bucket ----------------------------------------------------------------------------
say "Making sure the private backup bucket s3://$BUCKET exists"
if awsr s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1; then
  note "exists"
else
  awsr s3api create-bucket --bucket "$BUCKET" --create-bucket-configuration "LocationConstraint=$REGION" >/dev/null
  note "created"
fi
note "blocking all public access"
awsr s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
note "turning on versioning (an overwritten or deleted backup can be brought back)"
awsr s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled
note "turning on encryption at rest (KMS)"
awsr s3api put-bucket-encryption --bucket "$BUCKET" --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"aws:kms"},"BucketKeyEnabled":true}]}'
note "expiring backups after 35 days"
awsr s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration \
  '{"Rules":[{"ID":"expire-35-days","Status":"Enabled","Filter":{"Prefix":"postgres/"},"Expiration":{"Days":35},"NoncurrentVersionExpiration":{"NoncurrentDays":35},"AbortIncompleteMultipartUpload":{"DaysAfterInitiation":7}},{"ID":"releases-90-days","Status":"Enabled","Filter":{"Prefix":"releases/"},"Expiration":{"Days":90},"NoncurrentVersionExpiration":{"NoncurrentDays":7}}]}'
note "refusing any request that is not over HTTPS"
cat >"$WORK/bucket-policy.json" <<EOF
{"Version":"2012-10-17","Statement":[{"Sid":"HttpsOnly","Effect":"Deny","Principal":"*","Action":"s3:*",
 "Resource":["arn:aws:s3:::$BUCKET","arn:aws:s3:::$BUCKET/*"],"Condition":{"Bool":{"aws:SecureTransport":"false"}}}]}
EOF
awsr s3api put-bucket-policy --bucket "$BUCKET" --policy "file://$WORK/bucket-policy.json"
awsr s3api put-bucket-tagging --bucket "$BUCKET" --tagging "TagSet=[{Key=Project,Value=$NAME}]"
printf '%s' "$BUCKET" >"$WORK/v"; put_param BACKUP_BUCKET String "$WORK/v"
upload_release

# --- Instance role ----------------------------------------------------------------------------
say "Making sure the instance role $ROLE_NAME exists (Session Manager + only what it needs)"
if ! awsr iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  awsr iam create-role --role-name "$ROLE_NAME" --tags "Key=Project,Value=$NAME" \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  note "created"
fi
awsr iam attach-role-policy --role-name "$ROLE_NAME" --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
SSM_KEY_ARN="$(awsr kms describe-key --key-id alias/aws/ssm --query KeyMetadata.Arn --output text)"
P="arn:aws:ssm:$REGION:$ACCOUNT_ID:parameter$PARAM_PREFIX"
cat >"$WORK/role-policy.json" <<EOF
{"Version":"2012-10-17","Statement":[
 {"Sid":"ReadStagingSettings","Effect":"Allow","Action":["ssm:GetParameter","ssm:GetParameters","ssm:GetParametersByPath"],
  "Resource":["$P","$P/*"]},
 {"Sid":"WriteOneTimeCodes","Effect":"Allow","Action":["ssm:PutParameter"],"Resource":["$P/codes/*"]},
 {"Sid":"SecureStringsViaSsmOnly","Effect":"Allow","Action":["kms:Decrypt","kms:Encrypt","kms:GenerateDataKey"],
  "Resource":"$SSM_KEY_ARN","Condition":{"StringEquals":{"kms:ViaService":"ssm.$REGION.amazonaws.com"}}},
 {"Sid":"WriteBackups","Effect":"Allow","Action":["s3:PutObject"],"Resource":"arn:aws:s3:::$BUCKET/postgres/*"},
 {"Sid":"ReadReleases","Effect":"Allow","Action":["s3:GetObject"],"Resource":"arn:aws:s3:::$BUCKET/releases/*"},
 {"Sid":"ListBackups","Effect":"Allow","Action":["s3:ListBucket"],"Resource":"arn:aws:s3:::$BUCKET"}
]}
EOF
awsr iam put-role-policy --role-name "$ROLE_NAME" --policy-name "${NAME}-scoped" --policy-document "file://$WORK/role-policy.json"
if ! awsr iam get-instance-profile --instance-profile-name "$ROLE_NAME" >/dev/null 2>&1; then
  awsr iam create-instance-profile --instance-profile-name "$ROLE_NAME" --tags "Key=Project,Value=$NAME" >/dev/null
  awsr iam add-role-to-instance-profile --instance-profile-name "$ROLE_NAME" --role-name "$ROLE_NAME"
  note "instance profile created; giving IAM a few seconds to spread it"
  sleep 15
fi

# --- Network ----------------------------------------------------------------------------------
say "Finding the default network (VPC)"
VPC_ID="$(awsr ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)"
[[ "$VPC_ID" != "None" ]] || die "This region has no default VPC. Create one: aws ec2 create-default-vpc"
note "$VPC_ID"

say "Making sure the firewall (security group $SG_NAME) allows 80 and 443 only"
SG_ID="$(awsr ec2 describe-security-groups --filters "Name=group-name,Values=$SG_NAME" "Name=vpc-id,Values=$VPC_ID" \
  --query 'SecurityGroups[0].GroupId' --output text)"
if [[ "$SG_ID" == "None" ]]; then
  SG_ID="$(awsr ec2 create-security-group --group-name "$SG_NAME" --vpc-id "$VPC_ID" \
    --description "Agent Finder staging: HTTPS (and HTTP for redirects and certificates) only" \
    --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=$SG_NAME},{Key=Project,Value=$NAME}]" \
    --query GroupId --output text)"
  note "created $SG_ID"
fi
for rule in tcp:80 tcp:443 udp:443; do
  awsr ec2 authorize-security-group-ingress --group-id "$SG_ID" --protocol "${rule%%:*}" --port "${rule##*:}" \
    --cidr 0.0.0.0/0 >/dev/null 2>&1 || true  # already there
done
others="$(awsr ec2 describe-security-groups --group-ids "$SG_ID" \
  --query 'SecurityGroups[0].IpPermissions[?!(FromPort==`80` || FromPort==`443`)] | length(@)' --output text)"
[[ "$others" == "0" ]] || note "WARNING: $SG_ID has inbound rules other than 80/443. Remove them (no SSH is needed)."

say "Making sure the fixed public address (Elastic IP) exists"
ALLOC_ID="$(awsr ec2 describe-addresses --filters "Name=tag:Name,Values=$NAME" --query 'Addresses[0].AllocationId' --output text)"
if [[ "$ALLOC_ID" == "None" ]]; then
  ALLOC_ID="$(awsr ec2 allocate-address --domain vpc \
    --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=$NAME},{Key=Project,Value=$NAME}]" \
    --query AllocationId --output text)"
  note "allocated"
fi
PUBLIC_IP="$(awsr ec2 describe-addresses --allocation-ids "$ALLOC_ID" --query 'Addresses[0].PublicIp' --output text)"
SITE_SUFFIX="${PUBLIC_IP//./-}.sslip.io"
printf '%s' "$PUBLIC_IP" >"$WORK/v"; put_param PUBLIC_IP String "$WORK/v"
note "$PUBLIC_IP -> *.$SITE_SUFFIX"

# --- Instance ---------------------------------------------------------------------------------
find_instance
NEW_INSTANCE=0
if [[ -z "$INSTANCE_ID" ]]; then
  say "Starting a new $INSTANCE_TYPE instance (Amazon Linux 2023, arm64, 30 GB encrypted disk, no SSH key)"
  cat >"$WORK/user-data.sh" <<EOF
#!/bin/bash
# First boot: get the code at $GIT_REF and run its setup. Later updates come through SSM.
set -euo pipefail
exec >>/var/log/agent-finder-setup.log 2>&1
mkdir -p /opt/agent-finder
# The role's credentials can take a moment after boot.
for i in \$(seq 1 30); do aws sts get-caller-identity --region '$REGION' >/dev/null 2>&1 && break; sleep 5; done
$(fetch_release_lines)
cd /opt/agent-finder/src
bash infra/aws/instance-setup.sh
EOF
  for attempt in 1 2 3 4 5 6; do
    if INSTANCE_ID="$(awsr ec2 run-instances \
        --image-id "resolve:ssm:$AMI_PARAM" --instance-type "$INSTANCE_TYPE" \
        --iam-instance-profile "Name=$ROLE_NAME" --security-group-ids "$SG_ID" \
        --metadata-options HttpTokens=required,HttpPutResponseHopLimit=1,HttpEndpoint=enabled \
        --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":30,"VolumeType":"gp3","Encrypted":true,"DeleteOnTermination":true}}]' \
        --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME},{Key=Project,Value=$NAME}]" \
                             "ResourceType=volume,Tags=[{Key=Name,Value=$NAME},{Key=Project,Value=$NAME},{Key=Snapshot,Value=$NAME}]" \
        --user-data "file://$WORK/user-data.sh" \
        --query 'Instances[0].InstanceId' --output text 2>"$WORK/err")"; then
      break
    fi
    grep -q "instance profile" "$WORK/err" || { cat "$WORK/err" >&2; die "Could not start the instance."; }
    note "IAM is still spreading the new instance profile; trying again in 10 seconds ($attempt/6)"
    sleep 10
  done
  [[ "$INSTANCE_ID" == i-* ]] || die "Could not start the instance."
  NEW_INSTANCE=1
  note "$INSTANCE_ID started"
else
  say "Using the existing instance $INSTANCE_ID"
  state="$(awsr ec2 describe-instances --instance-ids "$INSTANCE_ID" --query 'Reservations[0].Instances[0].State.Name' --output text)"
  if [[ "$state" == stopped ]]; then note "it is stopped: starting it"; awsr ec2 start-instances --instance-ids "$INSTANCE_ID" >/dev/null; fi
fi
note "waiting for it to be running"
awsr ec2 wait instance-running --instance-ids "$INSTANCE_ID"
say "Attaching the Elastic IP $PUBLIC_IP"
awsr ec2 associate-address --instance-id "$INSTANCE_ID" --allocation-id "$ALLOC_ID" --allow-reassociation >/dev/null

# --- Daily disk snapshots ---------------------------------------------------------------------
say "Making sure the disk is snapshotted daily (keep 7) by Data Lifecycle Manager"
awsr dlm create-default-role --resource-type snapshot >/dev/null 2>&1 || true
DLM_ID="$(awsr dlm get-lifecycle-policies --target-tags "Snapshot=$NAME" --query 'Policies[0].PolicyId' --output text 2>/dev/null || echo None)"
if [[ "$DLM_ID" == "None" || -z "$DLM_ID" ]]; then
  cat >"$WORK/dlm.json" <<EOF
{"ResourceTypes":["VOLUME"],"TargetTags":[{"Key":"Snapshot","Value":"$NAME"}],
 "Schedules":[{"Name":"daily-keep-7","CopyTags":true,
   "CreateRule":{"Interval":24,"IntervalUnit":"HOURS","Times":["03:00"]},"RetainRule":{"Count":7}}]}
EOF
  awsr dlm create-lifecycle-policy --description "$NAME daily snapshots" --state ENABLED \
    --execution-role-arn "arn:aws:iam::$ACCOUNT_ID:role/AWSDataLifecycleManagerDefaultRole" \
    --policy-details "file://$WORK/dlm.json" --tags "Project=$NAME" >/dev/null
  note "created"
else
  note "exists ($DLM_ID)"
fi

# --- Budget -----------------------------------------------------------------------------------
say "Making sure the monthly cost budget (\$$BUDGET_USD, alert at 80%) exists"
printf '{"BudgetName":"%s","BudgetLimit":{"Amount":"%s","Unit":"USD"},"TimeUnit":"MONTHLY","BudgetType":"COST"}' \
  "$NAME" "$BUDGET_USD" >"$WORK/budget.json"
printf '[{"Notification":{"NotificationType":"ACTUAL","ComparisonOperator":"GREATER_THAN","Threshold":80,"ThresholdType":"PERCENTAGE"},"Subscribers":[{"SubscriptionType":"EMAIL","Address":"%s"}]}]' \
  "$BUDGET_EMAIL" >"$WORK/notify.json"
if awsr budgets describe-budget --account-id "$ACCOUNT_ID" --budget-name "$NAME" >/dev/null 2>&1; then
  awsr budgets update-budget --account-id "$ACCOUNT_ID" --new-budget "file://$WORK/budget.json"
  note "exists; limit set to \$$BUDGET_USD (the alert address is kept as first set)"
else
  awsr budgets create-budget --account-id "$ACCOUNT_ID" --budget "file://$WORK/budget.json" \
    --notifications-with-subscribers "file://$WORK/notify.json"
  note "created; AWS emails the alert address when 80% is reached"
fi

# --- Deploy the code --------------------------------------------------------------------------
wait_for_ssm
if [[ "$NEW_INSTANCE" == 1 ]]; then
  note "First boot: the instance installs Docker and builds everything by itself (10-20 minutes)."
  if ! wait_for_health 30; then
    say "Not answering yet. The last lines of the setup log:"
    ssm_run "agent-finder setup log" "tail -n 60 /var/log/agent-finder-setup.log"
    die "Setup has not finished. Run 'infra/aws/update.sh --logs' later, or update.sh to try again."
  fi
else
  say "Redeploying $GIT_REF on the existing instance"
  mapfile -t lines < <(redeploy_lines)
  ssm_run "agent-finder deploy $GIT_REF" "${lines[@]}"
  wait_for_health 5 || die "The API does not answer over HTTPS. Check: infra/aws/update.sh --logs"
fi

print_urls
say "Next"
note "Create a test aggregator:   infra/aws/admin.sh create-aggregator test-agg \"Mohira Test Aggregator\" west"
note "Deploy a newer version:     GIT_REF=main infra/aws/update.sh"
note "Backup private key:         $BACKUP_KEY_HOME  (keep it safe; it opens every backup)"
note "Admin shell (no SSH):       aws ssm start-session --profile $AWS_PROFILE --region $REGION --target $INSTANCE_ID"
