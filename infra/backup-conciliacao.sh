#!/usr/bin/env bash
# Compressed, consistent MySQL backup for the Compose deployment.
set -euo pipefail
APP_DIR="${APP_DIR:-/home/ec2-user/conciliacao-agiw}"
BACKUP_DIR="${BACKUP_DIR:-/home/ec2-user/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
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
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'conciliacao_*.sql.gz' -mtime "+$RETENTION_DAYS" -delete
echo "[$(date -u --iso-8601=seconds)] Backup validated: $FINAL"
