#!/usr/bin/env bash
# =============================================================================
# setup-ec2.sh — Bootstrap manual da instância EC2
# Projeto Banco · Ticket 37060 · Agiw Sistemas
#
# USO (após conectar via SSH na EC2):
#   git clone <URL-DO-REPO> conciliacao-agiw
#   cd conciliacao-agiw
#   bash infra/setup-ec2.sh
#
# O script é idempotente: pode ser re-executado sem problemas.
# =============================================================================

set -euo pipefail

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERRO]${NC} $1"; }

echo ""
echo "============================================================"
echo "  Conciliação Bancária — Setup EC2"
echo "  Projeto Banco · Ticket 37060 · Agiw Sistemas"
echo "============================================================"
echo ""

# ==============================================================================
# 1. Atualizar sistema
# ==============================================================================
log_info "Atualizando pacotes do sistema..."
sudo dnf update -y
log_success "Sistema atualizado"

# ==============================================================================
# 2. Instalar Docker
# ==============================================================================
if ! command -v docker &>/dev/null; then
  log_info "Instalando Docker..."
  sudo dnf install -y docker
  sudo systemctl enable --now docker
  sudo usermod -aG docker "$USER"
  log_success "Docker instalado"
else
  log_info "Docker já instalado: $(docker --version)"
  sudo systemctl enable --now docker
fi

# ==============================================================================
# 3. Instalar Docker Compose v2 (plugin)
# ==============================================================================
COMPOSE_PLUGIN="/usr/local/lib/docker/cli-plugins/docker-compose"
if [ ! -f "$COMPOSE_PLUGIN" ]; then
  log_info "Instalando Docker Compose v2..."
  sudo mkdir -p /usr/local/lib/docker/cli-plugins
  sudo curl -SL \
    "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
    -o "$COMPOSE_PLUGIN"
  sudo chmod +x "$COMPOSE_PLUGIN"
  log_success "Docker Compose instalado: $(docker compose version)"
else
  log_info "Docker Compose já instalado: $(docker compose version)"
fi

# ==============================================================================
# 4. Instalar Nginx (proxy reverso + TLS termination)
# ==============================================================================
if ! command -v nginx &>/dev/null; then
  log_info "Instalando Nginx..."
  sudo dnf install -y nginx
  sudo systemctl enable nginx
  log_success "Nginx instalado"
else
  log_info "Nginx já instalado: $(nginx -v 2>&1)"
fi

# ==============================================================================
# 5. HTTPS (certificado autoassinado) + Nginx como proxy reverso
# ==============================================================================
NGINX_CONF="/etc/nginx/conf.d/conciliacao.conf"
TLS_CERT="/etc/ssl/certs/conciliacao.crt"
TLS_KEY="/etc/ssl/private/conciliacao.key"
APP_DIR="$(pwd)"

if [[ ! -f "$TLS_CERT" || ! -f "$TLS_KEY" ]]; then
  log_info "Gerando certificado TLS autoassinado (lab, sem ACM)..."
  sudo openssl req -x509 -nodes -days 365 \
    -newkey rsa:2048 \
    -keyout "$TLS_KEY" \
    -out "$TLS_CERT" \
    -subj "/CN=conciliacao-agiw/O=Agiw Sistemas"
  sudo chmod 600 "$TLS_KEY"
  log_success "Certificado gerado em $TLS_CERT"
else
  log_info "Certificado TLS já existe"
fi

log_info "Configurando Nginx (HTTP :80 + HTTPS :443)..."
sudo cp "$APP_DIR/infra/nginx.conf" "$NGINX_CONF"
sudo nginx -t && sudo systemctl restart nginx
log_success "Nginx configurado com HTTPS"

# ==============================================================================
# 6. Criar diretório de certificados mTLS (se não existir)
# ==============================================================================
mkdir -p "$APP_DIR/certs"
log_info "Diretório de certs: $APP_DIR/certs"
log_warn "Envie os certificados mTLS do Bradesco para este diretório:"
log_warn "  scp -i chave.pem certificado.crt chave.key ec2-user@<IP>:$APP_DIR/certs/"

# ==============================================================================
# 7. Verificar .env
# ==============================================================================
if [ ! -f "$APP_DIR/.env" ]; then
  log_warn "Arquivo .env não encontrado. Criando a partir do .env.lab.example..."
  cp "$APP_DIR/.env.lab.example" "$APP_DIR/.env"
  log_warn "AÇÃO NECESSÁRIA: edite $APP_DIR/.env com as credenciais reais"
  log_warn "  nano $APP_DIR/.env"
else
  log_info ".env já existe"
fi

# ==============================================================================
# 8. Configurar logrotate para logs do Docker
# ==============================================================================
sudo tee /etc/logrotate.d/docker-conciliacao > /dev/null << 'LOGROTATE'
/var/lib/docker/containers/*/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
LOGROTATE
log_success "Logrotate configurado para logs do Docker"

# ==============================================================================
# 9. Script de backup diário do banco
# ==============================================================================
BACKUP_SCRIPT="/usr/local/bin/backup-conciliacao.sh"
BACKUP_S3_BUCKET="${BACKUP_S3_BUCKET:-conciliacao-334393066436-backup-i011e7c2ecaed16641}"
sudo install -o root -g root -m 0750 "$APP_DIR/infra/backup-conciliacao.sh" "$BACKUP_SCRIPT"
sudo tee /etc/cron.d/conciliacao-backup > /dev/null <<BACKUP_CRON
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin
APP_DIR=$APP_DIR
BACKUP_S3_BUCKET=$BACKUP_S3_BUCKET
AWS_REGION=us-east-1
@daily root /usr/local/bin/backup-conciliacao.sh >> /var/log/backup-conciliacao.log 2>&1
BACKUP_CRON
sudo chmod 0644 /etc/cron.d/conciliacao-backup
log_success "Backup diario para S3 agendado"

# ==============================================================================
# 10. CloudWatch Agent (logs + métricas)
# ==============================================================================
if ! command -v amazon-cloudwatch-agent-ctl &>/dev/null; then
  log_info "Instalando Amazon CloudWatch Agent..."
  sudo dnf install -y amazon-cloudwatch-agent || log_warn "Pacote amazon-cloudwatch-agent indisponível neste AMI"
fi

if command -v amazon-cloudwatch-agent-ctl &>/dev/null; then
  sudo cp "$APP_DIR/infra/cloudwatch-agent.json" \
    /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
  if sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
      -a fetch-config \
      -m ec2 \
      -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json \
      -s; then
    log_success "CloudWatch Agent iniciado"
  else
    log_warn "CloudWatch Agent instalado, mas não iniciou. No Academy anexe o LabInstanceProfile à EC2."
  fi
else
  log_warn "CloudWatch Agent não instalado — logs continuam em docker compose logs"
fi

# ==============================================================================
# 11. Resumo final
# ==============================================================================
echo ""
echo "============================================================"
log_success "Setup concluído!"
echo "============================================================"
echo ""
echo "PRÓXIMOS PASSOS:"
echo ""
echo "  1. Edite o .env com credenciais reais:"
echo "     nano $APP_DIR/.env"
echo ""
echo "  2. (Se usar Bradesco) Envie os certificados mTLS:"
echo "     scp -i chave.pem certificado.crt chave.key \\"
echo "       ec2-user@<IP>:$APP_DIR/certs/"
echo ""
echo "  3. FECHE E REABRA a sessão SSH para o grupo docker valer:"
echo "     exit  # e conecte novamente"
echo ""
echo "  4. Suba a aplicação:"
echo "     cd $APP_DIR"
echo "     docker compose up -d --build"
echo "     docker compose exec app node scripts/init-db.mjs"
echo "     docker compose logs -f app"
echo ""
echo "  5. Acesse via browser (HTTPS com aviso de certificado autoassinado):"
echo "     https://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo '<IP-PUBLICO>')"
echo ""
echo "  6. Restore de backup:"
echo "     bash infra/restore-conciliacao.sh ~/backups/<arquivo>.sql.gz"
echo ""
