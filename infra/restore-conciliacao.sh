#!/usr/bin/env bash
# =============================================================================
# restore-conciliacao.sh — Restaura o MySQL a partir de um backup .sql.gz
# Projeto Banco · Ticket 37060 · Agiw Sistemas
#
# USO (na EC2):
#   bash infra/restore-conciliacao.sh ~/backups/conciliacao_AAAA-MM-DD_HHMMSS.sql.gz
# =============================================================================

set -euo pipefail

BACKUP_FILE="${1:-}"
APP_DIR="${APP_DIR:-/home/ec2-user/conciliacao-agiw}"

if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
  echo "Uso: bash infra/restore-conciliacao.sh <arquivo.sql.gz>"
  echo ""
  echo "Backups disponíveis:"
  ls -lh /home/ec2-user/backups/conciliacao_*.sql.gz 2>/dev/null || echo "  (nenhum backup encontrado em ~/backups)"
  exit 1
fi

if [[ ! -f "$APP_DIR/.env" ]]; then
  echo "Arquivo .env não encontrado em $APP_DIR"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "$APP_DIR/.env"
set +a

cd "$APP_DIR"

echo "[INFO] Parando a aplicação para evitar gravações durante o restore..."
docker compose stop app

echo "[INFO] Restaurando $BACKUP_FILE em $MYSQL_DATABASE..."
gunzip -c "$BACKUP_FILE" \
  | docker compose exec -T mysql \
    mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"

echo "[INFO] Verificando tabelas principais..."
docker compose exec mysql \
  mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" \
  -e "SHOW TABLES;"

echo "[INFO] Subindo a aplicação..."
docker compose start app

echo "[OK] Restore concluído. Health check:"
sleep 8
curl -sS --max-time 10 http://127.0.0.1:3000/api/health || true
echo ""
