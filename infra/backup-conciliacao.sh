#!/usr/bin/env bash
# Compressed, consistent MySQL backup for the Compose deployment.
set -euo pipefail
APP_DIR="${APP_DIR:-/home/ec2-user/conciliacao-agiw}"
BACKUP_DIR="${BACKUP_DIR:-/home/ec2-user/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
S3_BUCKET="${BACKUP_S3_BUCKET:-conciliacao-334393066436-backup-i011e7c2ecaed16641}"
AWS_REGION="${AWS_REGION:-us-east-1}"
STAMP="$(date -u +%Y-%m-%d_%H%M%S)"
FINAL="$BACKUP_DIR/conciliacao_$STAMP.sql.gz"
TEMP="$FINAL.partial"
[[ -f "$APP_DIR/docker-compose.yml" ]] || { echo "Missing $APP_DIR/docker-compose.yml" >&2; exit 1; }
install -d -m 700 "$BACKUP_DIR"
trap 'rm -f "$TEMP"' EXIT
cd "$APP_DIR"
sudo docker compose exec -T mysql sh -c \
  'exec mysqldump --single-transaction --routines --triggers --events --user=root --password="$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' \
  | gzip -c > "$TEMP"
gzip -t "$TEMP"
mv "$TEMP" "$FINAL"
chmod 600 "$FINAL"
sha256sum "$FINAL"
S3_KEY="mysql/$(basename "$FINAL")"
aws s3 cp "$FINAL" "s3://${S3_BUCKET}/${S3_KEY}" --region "$AWS_REGION" --sse AES256 --only-show-errors
echo "[$(date -u --iso-8601=seconds)] Backup uploaded: s3://${S3_BUCKET}/${S3_KEY}"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'conciliacao_*.sql.gz' -mtime "+$RETENTION_DAYS" -delete
echo "[$(date -u --iso-8601=seconds)] Backup validated: $FINAL"
