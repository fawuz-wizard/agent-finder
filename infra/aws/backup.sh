#!/usr/bin/env bash
# Nightly backup of the STAGING database. Runs as root ON THE INSTANCE (installed as
# /usr/local/sbin/agent-finder-backup, started by agent-finder-backup.timer; run it by hand
# with `sudo agent-finder-backup`).
#
#   1. The project's own script (apps/api/scripts/backup_db.py) runs in the backup container:
#      pg_dump, a row-count manifest, encryption with GnuPG to the PUBLIC backup key (the
#      private key never leaves the deployer's laptop), the last 7 kept on this disk, and a
#      second copy written to an outbox folder.
#   2. This script moves the outbox to the private S3 bucket (versioned, encrypted, 35 days),
#      using the instance role. The upload is done here on the host, not in the container, so
#      no container needs AWS credentials.
#
# A failure exits non-zero, so `systemctl status agent-finder-backup` shows it as failed.
set -euo pipefail

env_value() { sed -n "s/^$1='\(.*\)'\$/\1/p" /opt/agent-finder/.env; }
BUCKET="$(env_value BACKUP_BUCKET)"
[[ -n "$BUCKET" ]] || { echo "BACKUP_BUCKET is missing from /opt/agent-finder/.env" >&2; exit 1; }

TOKEN="$(curl -fsS -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 300')"
export AWS_DEFAULT_REGION="$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/placement/region)"

echo "Dumping and encrypting the database"
/usr/local/bin/af-compose run --rm --no-deps backup

echo "Copying the encrypted backup to s3://$BUCKET/postgres/"
aws s3 mv /var/lib/agent-finder/outbox/ "s3://$BUCKET/postgres/" --recursive --sse aws:kms --only-show-errors

echo "Backup done; local copies:"
ls -1 /var/backups/agent-finder | tail -n 4
