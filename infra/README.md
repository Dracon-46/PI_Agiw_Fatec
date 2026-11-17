# Infraestrutura — Conciliação Bancária

Projeto Banco · Ticket 37060 · Agiw Sistemas

Esta pasta contém todos os arquivos de infraestrutura como código (IaC) e
configuração de servidor para o deploy na AWS.

---

## Arquivos

| Arquivo | Descrição |
|---|---|
| [`cloudformation.yml`](cloudformation.yml) | Template CloudFormation para provisionar EC2 + Security Group + Elastic IP |
| [`setup-ec2.sh`](setup-ec2.sh) | Script de bootstrap manual da EC2 (Docker, Nginx, backup, cron) |
| [`nginx.conf`](nginx.conf) | Nginx: HTTP :80 + HTTPS :443 (certificado autoassinado no lab) |
| [`cloudwatch-agent.json`](cloudwatch-agent.json) | Configuração do CloudWatch Agent (logs Docker/Nginx + métricas) |
| [`restore-conciliacao.sh`](restore-conciliacao.sh) | Restore do MySQL a partir de backup local ou URI s3:// |
| [backup-conciliacao.sh](backup-conciliacao.sh) | Dump MySQL validado, upload SSE-S3 ao bucket AWS, retenção local de 14 dias e expiração S3 em 30 dias |

---

### Backups no Amazon S3

Na conta de referência, os dumps são enviados a `s3://conciliacao-334393066436-backup-i011e7c2ecaed16641/mysql/` pelo Instance Profile `LabInstanceProfile`. Cada conta nova deve criar seu bucket privado, configurar SSE-S3, exigir HTTPS e expirar o prefixo `mysql/` após 30 dias. Antes do `setup-ec2.sh`, informe `BACKUP_S3_BUCKET=<bucket-da-conta>` e `AWS_REGION=us-east-1`; não use o bucket da conta de referência em outras contas. O restore aceita URI S3. Veja [`docs/TUTORIAL-REPLICAR-AWS.md`](../docs/TUTORIAL-REPLICAR-AWS.md).

## Fluxo de uso

### 1. Provisionar a infraestrutura (CloudFormation)

```bash
# No terminal com AWS CLI configurado
aws cloudformation create-stack \
  --stack-name conciliacao-agiw \
  --template-body file://infra/cloudformation.yml \
  --parameters \
      ParameterKey=KeyPairName,ParameterValue=<SEU-PAR-DE-CHAVES> \
      ParameterKey=GitRepoUrl,ParameterValue=https://github.com/Dracon-46/PI_Agiw_Fatec.git \
      ParameterKey=AllowedSSHCidr,ParameterValue=<SEU-IP-PUBLICO>/32

# Verificar progresso
aws cloudformation describe-stacks \
  --stack-name conciliacao-agiw \
  --query "Stacks[0].StackStatus"

# Pegar o IP público
aws cloudformation describe-stacks \
  --stack-name conciliacao-agiw \
  --query "Stacks[0].Outputs[?OutputKey=='PublicIP'].OutputValue" \
  --output text
```

### 2. Bootstrap manual (alternativa ao UserData)

```bash
ssh -i <chave>.pem ec2-user@<ELASTIC-IP>
git clone <URL-DO-REPO> conciliacao-agiw
cd conciliacao-agiw
BACKUP_S3_BUCKET=<SEU-BUCKET-S3> AWS_REGION=us-east-1 bash infra/setup-ec2.sh
```

### 3. Configurar a aplicação

```bash
# Configurar variáveis de ambiente
nano .env

# Enviar certificados mTLS do Bradesco (se necessário)
# Executar do seu computador local:
scp -i <chave>.pem \
  certificado.crt chave.key \
  ec2-user@<IP>:~/conciliacao-agiw/certs/

# Subir a aplicação
docker compose up -d --build
docker compose exec app node scripts/init-db.mjs
docker compose logs -f app
```

---

## Notas de segurança

- A porta MySQL (`3306`) está vinculada a `127.0.0.1` no `docker-compose.yml` — nunca exposta externamente
- O Security Group não abre a porta 3306 para a internet
- Os certificados mTLS nunca entram na imagem Docker — apenas via volume `:ro`
- Para o CD do host de referência, a chave SSH da EC2 fica como GitHub Secret (`EC2_SSH_KEY`), nunca no repositório. O workflow atual atende um host por execução; as contas adicionais usam deploy manual conforme o tutorial.

---

## AWS Academy vs. Produção

Consulte [`docs/AWS-PRODUCTION-READINESS.md`](../docs/AWS-PRODUCTION-READINESS.md)
para a comparação completa de cada recurso entre o ambiente do Learner Lab e
uma conta AWS real de produção.
