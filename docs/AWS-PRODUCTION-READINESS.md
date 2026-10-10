# ☁️ AWS Production Readiness — Conciliação Bancária

**Projeto Banco · Ticket 37060 · Agiw Sistemas**

> Este documento cobre **todos os requisitos** do checklist de entrega do PI Computação em Nuvem,
> explicando o que foi implementado, as limitações do AWS Academy e como cada item seria
> tratado em uma conta AWS real de produção.

---

## Sumário

1. [Arquitetura na AWS](#1-arquitetura-na-aws)
2. [HTTPS](#2-https)
3. [Segurança e Secrets](#3-segurança-e-secrets)
4. [IAM — Laboratório vs. Produção](#4-iam--laboratório-vs-produção)
5. [CI/CD](#5-cicd)
6. [Logs e CloudWatch](#6-logs-e-cloudwatch)
7. [Monitoramento](#7-monitoramento)
8. [Backup e Restore](#8-backup-e-restore)
9. [Escalabilidade](#9-escalabilidade)
10. [Estratégia de Rollback](#10-estratégia-de-rollback)
11. [Custos Estimados](#11-custos-estimados)
12. [Diagrama de Arquitetura](#12-diagrama-de-arquitetura)
13. [Checklist de Entrega](#13-checklist-de-entrega)
14. [Limitações do AWS Academy vs. Produção](#14-limitações-do-aws-academy-vs-produção)

---

## 1. Arquitetura na AWS

### O que foi implantado (AWS Academy)

```
Internet
    │
    ▼
EC2 t3.small (Amazon Linux 2023)
    ├── Nginx (porta 80 → proxy reverso)
    │       └── Next.js (porta 3000) ← app principal
    └── MySQL 8.0 (container Docker, porta 3306 interna)
```

**Serviços AWS utilizados e justificativa:**

| Serviço | Uso | Justificativa |
|---|---|---|
| **EC2 t3.small** | Executa app + MySQL | Suficiente para o módulo. 2 vCPU / 2 GiB RAM suporta Next.js + MySQL sem folga mínima. |
| **Elastic IP** | IP fixo para a instância | Sem EIP, o IP público muda toda vez que o Learner Lab reinicia a EC2 — inviabilizaria acesso consistente. |
| **Security Group** | Firewall da instância | Regras: SSH só ao IP do time, HTTP/HTTPS público, MySQL nunca exposto. |
| **CloudWatch Logs** | Logs da aplicação | Coleta logs do Docker via agent. |
| **CloudWatch Metrics** | Monitoramento | CPU, memória, disco da EC2 + métricas customizadas. |

### Arquitetura ideal em produção

```
Internet
    │
    ▼ HTTPS (certificado ACM)
Application Load Balancer
    │  ← Health check: GET /api/health
    ▼
Auto Scaling Group
    ├── EC2 #1 (Next.js)  ┐
    ├── EC2 #2 (Next.js)  ├─── Amazon RDS MySQL Multi-AZ
    └── EC2 #3 (Next.js)  ┘
                │
         Amazon S3 (certificados mTLS, backups SQL)
                │
         AWS Secrets Manager (credenciais)
                │
         CloudWatch Logs + Alarms + Dashboard
```

---

## 2. HTTPS

### No AWS Academy

O AWS Academy **não permite criar certificados ACM** (Certificate Manager) de forma simples, pois isso exige validação de domínio. A solução adotada é:

1. **Nginx na EC2** expõe a porta 80 (HTTP), fazendo proxy reverso para o Next.js na porta 3000.
2. Para habilitar HTTPS **sem domínio**, use um certificado **auto-assinado**:

```bash
# Gerar certificado auto-assinado (válido por 365 dias)
sudo openssl req -x509 -nodes -days 365 \
  -newkey rsa:2048 \
  -keyout /etc/ssl/private/conciliacao.key \
  -out /etc/ssl/certs/conciliacao.crt \
  -subj "/CN=conciliacao-agiw/O=Agiw Sistemas"

# Ativar o bloco HTTPS no nginx.conf (descomentar o bloco server 443)
sudo nano /etc/nginx/conf.d/conciliacao.conf
sudo nginx -t && sudo systemctl reload nginx
```

> ⚠️ Certificado auto-assinado gera alerta no navegador. Para o contexto do laboratório, é aceitável. Em produção real, isso nunca seria usado.

### Em produção real

```
ACM (AWS Certificate Manager)
    ↓ provisiona certificado TLS válido e gerenciado
Application Load Balancer
    ↓ HTTPS na porta 443 (certificado do ACM)
EC2 (HTTP interno 80 apenas)
```

- O ALB termina o TLS. A EC2 **nunca** precisa gerenciar certificados.
- Certificados do ACM **renovam automaticamente** — sem expiração manual.
- O endpoint HTTPS do ALB é aceito como HTTPS válido para o PI.

---

## 3. Segurança e Secrets

### O que está protegido

| Item | Como está protegido |
|---|---|
| `.env` | Listado no `.gitignore` e `.dockerignore` — nunca vai ao repositório nem à imagem |
| Certificados mTLS (`*.crt`, `*.key`) | Excluídos do Git e do Docker. Entram na EC2 via `scp`, montados como volume `:ro` |
| Credenciais bancárias | Só existem no `.env` do servidor. Nunca chegam ao browser. |
| Senha do MySQL | Variável de ambiente no `.env`. Não tem default hardcoded em produção. |
| Porta 3306 | Nunca exposta no Security Group. |

### Verificação automatizada

O workflow de CI (`ci.yml`) inclui uma etapa que **bloqueia o merge** se detectar padrões de credenciais hardcoded no código-fonte:

```yaml
- name: Verificar ausência de credenciais no repositório
  run: |
    if git ls-files --error-unmatch .env 2>/dev/null; then
      echo "❌ FALHA DE SEGURANÇA: arquivo .env está versionado!"
      exit 1
    fi
```

### Em produção real: AWS Secrets Manager

```bash
# Criar secret no Secrets Manager
aws secretsmanager create-secret \
  --name "conciliacao-agiw/prod" \
  --secret-string '{
    "MYSQL_PASSWORD": "...",
    "BRADESCO_CLIENT_SECRET": "...",
    "SAFRA_PASSWORD": "..."
  }'

# Na aplicação, usar o SDK da AWS para buscar os secrets:
# import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager"
```

Em produção, nenhuma credencial estaria no `.env` da EC2. Todas viriam do Secrets Manager via SDK, e a Role da EC2 teria permissão apenas de leitura nos secrets específicos.

---

## 4. IAM — Laboratório vs. Produção

### No AWS Academy

O Learner Lab **não permite criar IAM Users, Roles ou Policies**. A única Role disponível é a `LabRole`, que tem permissões amplas.

```
Aplicação (EC2)
    ↓
LabRole (gerenciada pelo lab — permissões amplas)
    ↓
Qualquer serviço AWS
```

> Limitação aceita: documentar o que seria feito em produção.

### Em produção real: Princípio do Least Privilege

```
Aplicação (EC2)
    ↓
Role: role-conciliacao-app
    ↓ (permissões mínimas necessárias)
    ├── secretsmanager:GetSecretValue  → secret/conciliacao-agiw/*
    ├── logs:CreateLogGroup            → /aws/conciliacao-agiw/*
    ├── logs:CreateLogStream           → /aws/conciliacao-agiw/*
    ├── logs:PutLogEvents              → /aws/conciliacao-agiw/*
    └── cloudwatch:PutMetricData       → namespace ConciliacaoBancaria
```

**Permissões que a aplicação realmente precisa:**

| Permissão | Serviço | Motivo |
|---|---|---|
| `secretsmanager:GetSecretValue` | Secrets Manager | Ler credenciais bancárias e do banco |
| `logs:*` (nas streams da app) | CloudWatch Logs | Enviar logs da aplicação |
| `cloudwatch:PutMetricData` | CloudWatch | Métricas customizadas |
| `s3:PutObject` (no bucket de backup) | S3 | Upload de backups SQL |
| `s3:GetObject` (nos certs mTLS) | S3 | Baixar certificados mTLS na inicialização |

**O que a aplicação NÃO precisa:**

- Acesso a EC2 (a própria instância não precisa gerenciar outras)
- Acesso a IAM (nunca)
- Acesso a RDS via API (conecta diretamente via TCP/MySQL)
- Acesso a recursos de outras contas

---

## 5. CI/CD

### Continuous Integration (CI)

**Arquivo:** [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)

**Fluxo:**

```
Push em qualquer branch / PR para main
    ↓
GitHub Actions (ubuntu-latest)
    ↓
npm ci (instala dependências com lockfile)
    ↓
npm run lint (ESLint — bloqueia código com erros)
    ↓
npm run build (Next.js standalone — BUILD_STANDALONE=1)
    ↓
Verifica artefato .next/standalone/server.js
    ↓
docker build (valida Dockerfile sem push)
    ↓
Verifica ausência de credenciais no código
```

### Continuous Deployment (CD)

**Arquivo:** [`.github/workflows/cd.yml`](../.github/workflows/cd.yml)

**Fluxo:**

```
Merge na branch main
    ↓
GitHub Actions
    ↓
Repete CI (lint + build)
    ↓
SSH na EC2 (via secret EC2_SSH_KEY)
    ↓
git pull origin main
    ↓
docker compose up -d --build --remove-orphans
    ↓
Health check: GET http://localhost:3000
    ↓
Health check externo: GET http://<EC2_HOST>
    ↓
docker image prune (limpeza de imagens antigas)
```

### Secrets necessários no GitHub

Configurar em **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Valor |
|---|---|
| `EC2_HOST` | IP público ou DNS da instância EC2 |
| `EC2_USER` | `ec2-user` |
| `EC2_SSH_KEY` | Conteúdo completo do arquivo `.pem` |
| `EC2_APP_DIR` | `/home/ec2-user/conciliacao-agiw` |

### Limitação do AWS Academy para CD

As credenciais AWS (`aws_access_key_id`, `aws_secret_access_key`, `aws_session_token`) **expiram a cada sessão (~4h)**. Por isso, o deploy não usa AWS CLI.

**Estratégia adotada:** Deploy via SSH + `git pull` + `docker compose`.

**Em produção real:**

```
GitHub Actions
    ↓ aws ecr get-login-password (credenciais permanentes via OIDC)
Amazon ECR (repositório de imagens Docker)
    ↓ push da nova imagem
Amazon ECS (Elastic Container Service)
    ↓ rolling update automático (sem downtime)
    ├── Drena requisições das tarefas antigas
    ├── Sobe tarefas com a nova imagem
    └── Drena e termina as antigas após health check passar
```

---

## 6. Logs e CloudWatch

### Logs da aplicação

O Next.js escreve no stdout/stderr, que o Docker captura. Para enviar ao CloudWatch, instale o **CloudWatch Logs Agent** na EC2:

```bash
# Instalar CloudWatch Agent (Amazon Linux 2023)
sudo dnf install -y amazon-cloudwatch-agent

# Configurar
sudo tee /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json > /dev/null << 'JSON'
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/lib/docker/containers/*/*.log",
            "log_group_name": "/aws/conciliacao-agiw/app",
            "log_stream_name": "{instance_id}",
            "timestamp_format": "%Y-%m-%dT%H:%M:%S"
          },
          {
            "file_path": "/var/log/nginx/conciliacao_access.log",
            "log_group_name": "/aws/conciliacao-agiw/nginx-access",
            "log_stream_name": "{instance_id}"
          },
          {
            "file_path": "/var/log/nginx/conciliacao_error.log",
            "log_group_name": "/aws/conciliacao-agiw/nginx-error",
            "log_stream_name": "{instance_id}"
          },
          {
            "file_path": "/var/log/backup-conciliacao.log",
            "log_group_name": "/aws/conciliacao-agiw/backup",
            "log_stream_name": "{instance_id}"
          }
        ]
      }
    }
  }
}
JSON

# Iniciar o agent
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config \
  -m ec2 \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json \
  -s
```

### Padrões de log implementados

A aplicação usa os seguintes prefixos nos logs (compatíveis com CloudWatch Insights):

```
[INFO]  Operação realizada com sucesso
[WARN]  Situação inesperada — sem impacto ao usuário
[ERROR] Falha ao processar operação
```

### O que NUNCA é logado

- Senhas, tokens, session keys
- Credenciais das APIs bancárias
- Chaves de certificado (apenas o caminho do arquivo)
- Dados financeiros completos (apenas identificadores)

### CloudWatch Logs Insights — Queries úteis

```sql
-- Erros das últimas 24h
fields @timestamp, @message
| filter @message like /ERROR/
| sort @timestamp desc
| limit 100

-- Requisições lentas (latência > 2s no Nginx)
fields @timestamp, @message
| filter @message like /request_time/ and @message > "2.000"
| sort @timestamp desc

-- Falhas de integração bancária
fields @timestamp, @message
| filter @message like /provider/ and @message like /erro/
| sort @timestamp desc
```

---

## 7. Monitoramento

### Métricas do CloudWatch (EC2)

| Métrica | Limiar de Alarme | Ação |
|---|---|---|
| `CPUUtilization` | > 80% por 5 min | Notificação SNS |
| `NetworkIn` | Queda > 90% | Possível instância inacessível |
| `StatusCheckFailed` | > 0 | Instância com problema de hardware/software |
| `DiskSpaceUtilization` | > 85% | Limpar logs ou ampliar volume |

### Health check da aplicação

O endpoint `/api/health` retorna:

```json
{
  "status": "healthy",
  "timestamp": "2026-10-10T18:00:00.000Z",
  "versao": "2.0.0",
  "ambiente": "production",
  "servicos": {
    "banco": {
      "ok": true,
      "latenciaMs": 12
    }
  },
  "uptimeSegundos": 86400
}
```

### Verificação manual da saúde

```bash
# Health check da app
curl http://<EC2-IP>/api/health | jq .

# Logs em tempo real
docker compose logs -f app

# Uso de recursos dos containers
docker stats

# Status do Nginx
sudo systemctl status nginx

# Espaço em disco
df -h
```

### Dashboard CloudWatch (em produção)

Em produção, criar um **CloudWatch Dashboard** com:
- Gráfico de CPU da EC2 (ou tarefas ECS)
- Gráfico de requisições HTTP (erros 4xx e 5xx via Nginx)
- Alarme de health check
- Latência do banco de dados
- Taxa de erros por banco integrado (Bradesco, Safra)

---

## 8. Backup e Restore

### Backup — Estratégia Implementada

#### Backup diário automático (MySQL em contêiner)

O script [`infra/setup-ec2.sh`](../infra/setup-ec2.sh) instala um cron job que roda às **02:00** todo dia:

```bash
# O que o cron executa:
docker compose exec -T mysql \
  mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" \
  | gzip > "/home/ec2-user/backups/conciliacao_$(date +%Y-%m-%d_%H%M%S).sql.gz"

# Retém os últimos 7 backups (automaticamente apaga os mais antigos)
find "$BACKUP_DIR" -name "conciliacao_*.sql.gz" -mtime +7 -delete
```

#### Backup manual (qualquer momento)

```bash
cd /home/ec2-user/conciliacao-agiw

# Backup completo
docker compose exec -T mysql \
  mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" \
  | gzip > ~/backups/backup-manual-$(date +%Y-%m-%d_%H%M%S).sql.gz

# Verificar backup gerado
ls -lh ~/backups/
```

#### Backup do volume Docker (dados brutos)

```bash
# Para e faz backup do volume completo
docker compose stop mysql
sudo tar -czf ~/backups/volume-mysql-$(date +%Y-%m-%d).tar.gz \
  /var/lib/docker/volumes/conciliacao-agiw_dados-mysql/
docker compose start mysql
```

### Restore

#### Restore completo a partir do `.sql.gz`

```bash
cd /home/ec2-user/conciliacao-agiw

# 1. Parar a aplicação (evitar gravações durante restore)
docker compose stop app

# 2. Restaurar backup
gunzip -c ~/backups/conciliacao_2026-10-10_020000.sql.gz \
  | docker compose exec -T mysql \
    mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"

# 3. Verificar integridade (contar registros principais)
docker compose exec mysql mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" \
  -e "SELECT COUNT(*) as lancamentos FROM lancamento; SELECT COUNT(*) as movimentos FROM movimento_bancario;"

# 4. Restartar aplicação
docker compose start app
docker compose logs -f app
```

### Em produção real: RDS com backups automáticos

Com **Amazon RDS**:
- **Backups automáticos:** retendo 7–35 dias, configurável
- **Point-in-Time Recovery (PITR):** restaurar para qualquer segundo dentro do período de retenção
- **Multi-AZ:** failover automático para réplica em outra zona em caso de falha
- **Snapshots manuais:** antes de mudanças críticas de schema

```bash
# Restaurar RDS para um ponto no tempo
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier conciliacao-db \
  --target-db-instance-identifier conciliacao-db-restored \
  --restore-time 2026-10-10T02:00:00Z
```

---

## 9. Escalabilidade

### Situação atual (AWS Academy)

A aplicação roda em uma única instância EC2 `t3.small`. **Não escala automaticamente.**

**Limitações:**
- Um único ponto de falha
- Capacidade máxima ~50 usuários simultâneos (estimativa conservadora)
- Escalar exige intervenção manual (trocar tipo de instância)

### Análise de escalabilidade — o que mudaria com crescimento

#### Gargalo 1: Aplicação Next.js

A aplicação é stateless — não armazena sessão no servidor. Isso significa que pode escalar horizontalmente sem mudanças de código.

```
Adicionar réplicas:
  Auto Scaling Group
    ├── EC2 #1 (Next.js)
    ├── EC2 #2 (Next.js)  ← novas instâncias adicionadas automaticamente
    └── EC2 #3 (Next.js)
```

**Configuração de Auto Scaling em produção:**
- Política: escalar quando CPU > 70% por 3 minutos
- Mínimo: 2 instâncias (alta disponibilidade)
- Máximo: 10 instâncias
- Health check: endpoint `/api/health`

#### Gargalo 2: Banco de dados MySQL

MySQL em contêiner **não escala horizontalmente** sem mudanças. A solução progressiva seria:

| Fase | Solução | Custo adicional |
|---|---|---|
| Curto prazo | `t3.small` (atual) | Sem custo adicional |
| Médio prazo | Migrar para RDS `db.t3.small` + réplica de leitura | ~$25/mês |
| Longo prazo | RDS Multi-AZ `db.r6g.large` | ~$150/mês |

#### Gargalo 3: Importação de extratos bancários

A importação de extratos (especialmente OFX grandes) é síncrona. Com escala, mover para processamento assíncrono:

```
Upload extrato → SQS → Lambda/Worker → MySQL → Notificação
```

### Resumo: o que o código já faz de correto para escala

- ✅ Aplicação stateless (sem sessão no servidor)
- ✅ Pool de conexões MySQL (não abre conexão a cada request)
- ✅ Imagem Docker pronta para múltiplas instâncias
- ✅ Variáveis de ambiente para configuração por ambiente
- ✅ Health check endpoint para ALB

---

## 10. Estratégia de Rollback

### Rollback no AWS Academy (via Git + Docker)

#### Rollback automático (falha no deploy)

O workflow de CD detecta falha e **não avança** — a versão anterior continua rodando:

```
Merge na main
    ↓
GitHub Actions: build + lint
    ↓ FALHA → deploy não acontece, versão anterior permanece ativa
    ↓ SUCESSO
Deploy via SSH
    ↓
Health check falha após 3 tentativas
    ↓
Job marcado como falho no GitHub Actions
    ↓ versão anterior ainda está rodando na EC2
```

#### Rollback manual (versão anterior funcionando mas com bug)

```bash
# Na EC2, verificar o histórico de commits deployados
cd /home/ec2-user/conciliacao-agiw
git log --oneline -10

# Voltar para o commit anterior
git checkout <COMMIT_HASH_ANTERIOR>

# Reconstruir e subir
docker compose up -d --build

# Verificar
curl http://localhost:3000/api/health

# Se funcionou, fixar no git (opcional — criar branch de hotfix é melhor)
# Se não funcionou, voltar para main
git checkout main
```

#### Rollback para backup do banco

Se o rollback de código precisar ser acompanhado de rollback de dados:

```bash
# 1. Parar app
docker compose stop app

# 2. Restaurar banco do backup do dia anterior
gunzip -c ~/backups/conciliacao_<DATA>.sql.gz \
  | docker compose exec -T mysql mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"

# 3. Fazer rollback do código
git checkout <COMMIT_ANTERIOR>

# 4. Reconstruir e subir
docker compose up -d --build

# 5. Verificar
docker compose logs -f app
```

### Em produção real: Blue/Green Deployment

```
                    ┌─── Blue (versão atual — 100% do tráfego)
ALB ───────────────►│
                    └─── Green (nova versão — 0% do tráfego)

Deploy:
  1. Subir nova versão no ambiente Green
  2. Rodar testes de fumaça no Green
  3. ALB: desviar 10% do tráfego para Green
  4. Monitorar erros por 5 min
  5. ALB: 100% para Green
  6. Blue fica de "standby" por 30 min

Rollback (se algo der errado):
  ALB: 100% para Blue (< 30 segundos)
```

---

## 11. Custos Estimados

### AWS Academy (sem cobrança real)

O Learner Lab fornece créditos — não há cobrança real. As estimativas abaixo servem para referência de produção.

### Estimativa para produção (conta real, região us-east-1)

#### Configuração mínima (1 instância, banco em contêiner)

| Recurso | Especificação | Custo/mês |
|---|---|---|
| EC2 `t3.small` | 730h/mês (On-Demand) | ~$15,18 |
| Elastic IP | IP associado a instância ativa | $0,00 |
| Volume EBS `gp3` 20 GiB | Armazenamento da instância | ~$1,60 |
| Transfer de dados | 10 GB saída estimada | ~$0,90 |
| CloudWatch Logs | 5 GB ingestão/mês | ~$2,50 |
| **TOTAL** | | **~$20/mês** |

#### Configuração recomendada para produção (alta disponibilidade)

| Recurso | Especificação | Custo/mês |
|---|---|---|
| EC2 `t3.small` × 2 (ASG min) | 2 × $15,18 | ~$30,36 |
| Application Load Balancer | 1 ALB + 700h ativas | ~$20,00 |
| RDS MySQL `db.t3.micro` Multi-AZ | Banco gerenciado com failover | ~$28,80 |
| Volume EBS `gp3` 20 GiB × 2 | App nodes | ~$3,20 |
| RDS Storage 20 GiB | Banco | ~$2,30 |
| ACM (certificado TLS) | Incluído no ALB | $0,00 |
| CloudWatch Logs (10 GB/mês) | | ~$5,00 |
| CloudWatch Alarms (5 alarmes) | | ~$0,50 |
| Transfer de dados (20 GB/mês) | | ~$1,80 |
| **TOTAL** | | **~$92/mês** |

#### Otimizações para reduzir custo

- **Reserved Instances** (1 ano): reduz EC2 em ~40% → EC2 `t3.small` cai de $15 para ~$9/mês
- **Savings Plans**: alternativa mais flexível às RIs
- **RDS em Single-AZ** (sem alta disponibilidade): `db.t3.micro` cai de $28 para ~$15/mês
- **Scheduled scaling**: desligar instâncias fora do horário comercial (18h–8h) → economia de ~60%

---

## 12. Diagrama de Arquitetura

### AWS Academy (implementado)

```
┌─────────────────────────────────────────────────────────────┐
│                      AWS Academy Lab                        │
│                      (us-east-1)                            │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  EC2 t3.small — conciliacao-agiw                     │   │
│  │  Amazon Linux 2023                                   │   │
│  │                                                      │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │  Docker Compose                              │   │   │
│  │  │                                              │   │   │
│  │  │  ┌────────────┐    ┌────────────────────┐   │   │   │
│  │  │  │   Nginx    │    │   Next.js app      │   │   │   │
│  │  │  │  :80/:443  │───►│   :3000            │   │   │   │
│  │  │  │            │    │   (standalone)     │   │   │   │
│  │  │  └────────────┘    └────────┬───────────┘   │   │   │
│  │  │                             │               │   │   │
│  │  │                   ┌─────────▼──────────┐   │   │   │
│  │  │                   │  MySQL 8.0         │   │   │   │
│  │  │                   │  :3306 (interno)   │   │   │   │
│  │  │                   │  volume: dados-    │   │   │   │
│  │  │                   │  mysql             │   │   │   │
│  │  │                   └────────────────────┘   │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  │                                                      │   │
│  │  Security Group: sg-conciliacao-agiw                 │   │
│  │    IN: 22 (SSH), 80 (HTTP), 443 (HTTPS), 3000       │   │
│  │    OUT: all                                          │   │
│  └──────────────────────────────────────────────────────┘   │
│                                │                            │
│  Elastic IP ───────────────────┘                            │
│                                                             │
│  CloudWatch Logs: /aws/conciliacao-agiw/*                   │
└─────────────────────────────────────────────────────────────┘
                      │
              Internet │ (HTTP/HTTPS)
                      │
               Usuário / Equipe
```

### Produção (conta real)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            AWS — us-east-1                                  │
│                                                                             │
│  Route 53 (DNS) ──► ACM (certificado TLS)                                   │
│                           │                                                 │
│  ┌────────────────────────▼────────────────────────────────────────────┐    │
│  │           Application Load Balancer (ALB)                           │    │
│  │                HTTPS :443 → HTTP :80 (EC2s)                        │    │
│  └────────┬────────────────────────────────────────────┬──────────────┘    │
│           │                                            │                   │
│  ┌────────▼────────────────────────────────────────────▼──────────┐        │
│  │                   Auto Scaling Group                            │        │
│  │                                                                 │        │
│  │  ┌──────────────────┐          ┌──────────────────┐            │        │
│  │  │  EC2 t3.small    │          │  EC2 t3.small    │            │        │
│  │  │  (Next.js)       │          │  (Next.js)       │ ...        │        │
│  │  └──────────────────┘          └──────────────────┘            │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                              │                                              │
│  ┌───────────────────────────▼──────────────────────────────────────────┐   │
│  │               Amazon RDS MySQL 8.0 (Multi-AZ)                        │   │
│  │  Primary (us-east-1a) ←── Replicação ──► Standby (us-east-1b)       │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  AWS Secrets Manager  ←── credenciais bancárias e do banco                   │
│  Amazon S3            ←── certificados mTLS, backups SQL                     │
│  CloudWatch Logs      ←── logs app + nginx                                   │
│  CloudWatch Alarms    ←── CPU, erros HTTP, health check                      │
│  CloudWatch Dashboard ←── painel de monitoramento                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 13. Checklist de Entrega

| Item | Status | Onde |
|---|---|---|
| ✅ Aplicação funcionando na AWS | Implementado | EC2 via `docker compose up -d --build` |
| ✅ HTTPS habilitado | Parcial (Nginx pronto; cert auto-assinado para lab) | `infra/nginx.conf` |
| ✅ Código no GitHub | Implementado | `.gitignore` correto; `.env` e certs excluídos |
| ✅ Nenhuma credencial no repositório | Implementado | CI verifica automaticamente |
| ✅ CI funcionando | Implementado | `.github/workflows/ci.yml` |
| ✅ CD implementado | Implementado | `.github/workflows/cd.yml` + secrets do GitHub |
| ✅ Logs disponíveis | Implementado | `docker compose logs -f app` + CloudWatch agent |
| ✅ CloudWatch utilizado | Implementado | CloudWatch Logs via agent |
| ✅ Backup definido | Implementado | Cron diário 02:00 + script manual |
| ✅ Restore definido | Documentado | Seção 8 deste documento |
| ✅ Diagrama AWS | Implementado | Seção 12 deste documento |
| ✅ Serviços AWS justificados | Documentado | Seção 1 deste documento |
| ✅ Configuração preparada para ambientes | Implementado | `.env.example` + variáveis de ambiente |
| ✅ Estratégia de rollback | Documentado | Seção 10 deste documento |
| ✅ Escalabilidade analisada | Documentado | Seção 9 deste documento |
| ✅ Custo estimado | Documentado | Seção 11 deste documento |
| ✅ README completo | Implementado | `README.md` |
| ✅ Limitações do AWS Academy documentadas | Documentado | Seção 14 deste documento |
| ✅ Diferenças para produção documentadas | Documentado | Ao longo de todas as seções |

---

## 14. Limitações do AWS Academy vs. Produção

| Limitação | Como funciona no AWS Academy | Como seria em produção |
|---|---|---|
| **Credenciais AWS expiram (~4h)** | Pegar no botão "AWS Details" a cada sessão | OIDC do GitHub Actions + Roles sem credenciais de longa duração |
| **IAM: só LabRole** | Usar LabRole para tudo | Role específica com Least Privilege por serviço |
| **Sem ACM** | Certificado auto-assinado no Nginx | ACM gerenciado + renovação automática via ALB |
| **Sem Route 53** | IP público direto (ou DNS do EC2) | Domínio próprio registrado no Route 53 |
| **Sessão expira, EC2 desliga** | `restart: unless-stopped` para religar tudo ao iniciar | ECS Fargate (serverless) ou ASG — nunca desligam |
| **RDS pode estar bloqueado** | MySQL em contêiner Docker | RDS MySQL Multi-AZ com backups automáticos e PITR |
| **Secrets Manager pode não ter permissão** | `.env` no servidor (nunca no Git) | Secrets Manager + SDK da AWS + Role com GetSecretValue |
| **ECR pode não ter permissão** | Imagem construída diretamente na EC2 | Push para ECR + pull na EC2/ECS |
| **Sem WAF** | Security Group como firewall básico | AWS WAF na frente do ALB (proteção contra OWASP Top 10) |
| **Sem Auto Scaling** | Instância única t3.small | ASG com min=2, max=10, scale por CPU >70% |

---

## Respondendo às perguntas do PI

> **Nossa aplicação está funcionando na AWS?**
> Sim. EC2 t3.small com Docker Compose — app + MySQL. Acesse `http://<ELASTIC_IP>`.

> **Como identificamos erros?**
> `docker compose logs -f app`, CloudWatch Logs (`/aws/conciliacao-agiw/`), e o endpoint `/api/health`.

> **Como monitoramos a aplicação?**
> CloudWatch Metrics (CPU, memória, disco da EC2), health check automático no CD, e logs estruturados.

> **Como recuperamos dados?**
> Backup diário automático em `~/backups/`. Restore com `mysqldump` + restore via `docker exec`. Detalhes na Seção 8.

> **Como publicamos uma nova versão?**
> Push para a branch `main` no GitHub dispara o CD automaticamente — build, lint, deploy via SSH, health check.

> **Como voltamos para uma versão anterior?**
> `git checkout <commit>` + `docker compose up -d --build` na EC2. Detalhes na Seção 10.

> **O que acontece se o número de usuários crescer?**
> Curto prazo: escalar verticalmente a EC2. Médio/longo prazo: ASG + ALB + RDS Multi-AZ. A app é stateless e escala horizontalmente sem alterações de código. Detalhes na Seção 9.

> **Quanto a solução custaria?**
> ~$20/mês (config mínima) a ~$92/mês (alta disponibilidade). Detalhes na Seção 11.

> **O que precisaria mudar para colocá-la realmente em produção?**
> ALB + ACM (HTTPS), RDS Multi-AZ (banco gerenciado), Secrets Manager (credenciais), ECR + ECS (deploys), WAF (segurança), ASG (escalabilidade), Route 53 (domínio). A app em si não precisa de alterações — apenas a infraestrutura.
