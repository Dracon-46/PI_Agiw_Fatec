# Tutorial: reproduzir o ambiente AWS em cinco contas

Este roteiro leva cada integrante do grupo do zero a uma instalação independente do mesmo projeto. Todos usam o mesmo código/branch do GitHub, mas cada conta AWS terá EC2, chave SSH, Security Group, Elastic IP, bucket S3, perfil IAM e dados próprios.

> Não compartilhem credenciais AWS, arquivos PEM, `.env`, senhas ou certificados/chaves bancárias. Esses dados pertencem a cada integrante e não devem entrar no repositório.

## O repositório é o mesmo?

Sim. Os quatro colegas podem clonar o mesmo repositório e usar a mesma revisão. O CI também é compartilhado. Há uma diferença importante: o workflow CD atual usa um único conjunto de valores `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY` e `EC2_APP_DIR`, então publica em **um destino por vez**. Não basta cadastrar cinco secrets com os mesmos nomes: o último valor substituiria o destino anterior.

Para replicar sem alterar o workflow, mantenham o CI compartilhado e façam deploy manual em cada EC2, conforme a seção **Atualização**. CD automático independente nas cinco contas requer adaptar o workflow para selecionar um GitHub Environment/destino e manter secrets distintos em cada ambiente. Não alternem secrets de repositório entre os integrantes.

## Resultado por integrante

- EC2 Amazon Linux 2023 `t3.small`, volume gp3 criptografado de 20 GiB.
- Security Group: 80/443 públicos, SSH 22 apenas ao IP administrativo atual, sem 3000/3306 públicos.
- Elastic IP; Docker Compose com Next.js e MySQL; Nginx como proxy reverso e TLS autoassinado no laboratório.
- CloudWatch Agent, logs/métricas e alarmes de CPU/status.
- Backup MySQL diário para bucket S3 privado, SSE-S3, HTTPS obrigatório, retenção S3 de 30 dias e local de 14 dias.
- CI e instruções de atualização/rollback.

O TLS autoassinado cifra o tráfego, mas o navegador avisa que o certificado não é confiável. HTTPS confiável em produção requer domínio e certificado válido, por exemplo ACM com ALB. Consulte [AWS-PRODUCTION-READINESS.md](AWS-PRODUCTION-READINESS.md) para checklist, custos e limitações.

## 1. Pré-requisitos

Cada um precisa de conta AWS Academy ativa ou conta AWS com acesso aos serviços/ações EC2, IAM Instance Profile, Elastic IP, S3, CloudFormation e CloudWatch; acesso Git de leitura; e região `us-east-1`. O Learner Lab pode negar recursos por política, encerrar a sessão ou expirar credenciais temporárias. Não contorne um `AccessDenied` com chaves de outro integrante; peça ao professor/admin para liberar o recurso.

O template usa AMI de `us-east-1`. Se escolher outra região, será necessário atualizar e validar o AMI do template. No Learner Lab, inicie a sessão antes de começar.

## 2. Criar um bucket S3 próprio

Na conta de cada pessoa: **S3 → Create bucket**, região `us-east-1`. O nome é globalmente único; use `conciliacao-backup-<ID-DA-CONTA>-<sufixo-aleatorio>` e anote. Não tente usar o bucket de Felipe.

1. Deixe **Block all public access** ligado e Object Ownership como Bucket owner enforced.
2. Habilite criptografia padrão SSE-S3 (AES-256).
3. Em **Management → Lifecycle rules**, crie uma regra para prefixo `mysql/`, expiração após 30 dias.
4. Em **Permissions → Bucket policy**, substitua `NOME-DO-BUCKET` e aplique esta política para negar tráfego sem TLS (ela não concede acesso público):

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "DenyInsecureTransport",
    "Effect": "Deny",
    "Principal": "*",
    "Action": "s3:*",
    "Resource": ["arn:aws:s3:::NOME-DO-BUCKET", "arn:aws:s3:::NOME-DO-BUCKET/*"],
    "Condition": {"Bool": {"aws:SecureTransport": "false"}}
  }]
}
```

A EC2 acessa o S3 pela role, sem access key no servidor. Em uma conta AWS comum, dê à role apenas `s3:ListBucket` no bucket, `s3:PutObject`/`s3:GetObject` em `mysql/*` e as permissões necessárias do CloudWatch Agent. No Learner Lab use o perfil ofertado, normalmente `LabInstanceProfile` com `LabRole`, se permitido. A AWS descreve a associação de roles à EC2 e recomenda limitar permissões; o S3 recomenda manter o bloqueio público habilitado: [IAM instance profile](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/attach-iam-role.html), [S3 Block Public Access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html).

Se o laboratório negar criação de bucket, política, lifecycle ou IAM, solicite o provisionamento ao administrador/professor. Não desligue o bloqueio público.

## 3. Chave e infraestrutura

### 3.1 Par SSH próprio

No console EC2 em `us-east-1` → **Key Pairs → Create key pair**: RSA, formato PEM, nome individual. Guarde o arquivo em local seguro; não o envie ao grupo e não faça commit.

### 3.2 CloudFormation (recomendado)

O [`infra/cloudformation.yml`](../infra/cloudformation.yml) cria EC2, SG sem 3000/3306, Elastic IP e alarmes de CPU/status. No console **CloudFormation → Create stack → With new resources**, carregue o template e informe:

- Nome exclusivo, por exemplo `conciliacao-agiw-<integrante>`.
- `KeyPairName`: sua chave EC2.
- `GitRepoUrl`: `https://github.com/Dracon-46/PI_Agiw_Fatec.git`.
- `InstanceType`: `t3.small`.
- `InstanceProfileName`: `LabInstanceProfile`, se este perfil existir na sua conta.
- `AllowedSSHCidr`: seu IPv4 atual com `/32` (na regra de SSH, escolha “My IP” para descobri-lo). Atualize quando seu IP mudar; evite `0.0.0.0/0`.

Aguarde `CREATE_COMPLETE`. Em **Outputs**, anote InstanceId, PublicIP, SecurityGroupId e SSHCommand. Elastic IP mantém o endereço após stop/start.

O UserData do template instala Docker, Nginx e CloudWatch Agent e clona o Git, mas não cria bucket nem `.env`, e não inicializa o schema MySQL. Execute as etapas seguintes.

### Alternativa manual

Se CloudFormation não for permitido, crie a EC2 no console: Amazon Linux 2023, `t3.small`, volume gp3 criptografado 20 GiB, chave própria e Instance Profile do laboratório. SG: TCP 22 apenas My IP, 80 e 443 públicos; não crie 3000 nem 3306. Associe Elastic IP. Crie também os dois alarmes descritos no template. Esta alternativa precisa reproduzir manualmente os recursos do template.

## 4. SSH, código e bootstrap

No computador local:

```bash
chmod 400 conciliacao-nome.pem
ssh -i conciliacao-nome.pem ec2-user@<ELASTIC-IP-DA-SUA-CONTA>
```

O template já clonou o repositório em `/home/ec2-user/conciliacao-agiw`. Se usou a alternativa manual, clone-o:

```bash
git clone https://github.com/Dracon-46/PI_Agiw_Fatec.git /home/ec2-user/conciliacao-agiw
```

Na EC2, execute o bootstrap com o bucket individual. **Não omita essa variável:** o script ainda tem como padrão o bucket da instalação de referência.

```bash
cd /home/ec2-user/conciliacao-agiw
BACKUP_S3_BUCKET='<SEU-BUCKET>' AWS_REGION=us-east-1 bash infra/setup-ec2.sh
exit
```

Conecte novamente e prepare o `.env`:

```bash
ssh -i conciliacao-nome.pem ec2-user@<ELASTIC-IP-DA-SUA-CONTA>
cd /home/ec2-user/conciliacao-agiw
cp .env.lab.example .env
nano .env
```

No mínimo, confira e defina senha forte e individual:

```ini
NODE_ENV=production
MYSQL_HOST=mysql
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=<SENHA-FORTE-INDIVIDUAL>
MYSQL_DATABASE=conciliacao_agiw
BANK_PROVIDER=bradesco
```

Credenciais bancárias podem ficar vazias para validar a aplicação usando arquivos OFX/CSV/TXT. A API Bradesco exige Client ID/Secret e certificado mTLS `.crt` + `.key` autorizado para aquele usuário; Safra requer credenciais liberadas. Cada pessoa providencia suas próprias credenciais. Não reutilize as de Felipe. O certificado mTLS bancário é diferente do certificado TLS criado para o Nginx.

Suba a aplicação e crie as tabelas:

```bash
docker compose up -d --build
docker compose exec app node scripts/init-db.mjs
docker compose ps
docker compose logs --tail=100 app
```

`init-db.mjs` cria/reconcilia o schema, incluindo a tabela `banco`. Sem ele, o cadastro de contas pode falhar com tabela inexistente. Massa de demonstração é opcional:

```bash
docker compose exec app node scripts/seed-demo.mjs
```

## 5. HTTPS e Security Group

Abra `https://<ELASTIC-IP>` e aceite o aviso do certificado autoassinado para a demonstração. Na EC2 valide:

```bash
curl -k -i https://127.0.0.1/api/health
sudo nginx -t
sudo systemctl is-active nginx
docker compose ps
```

Health esperado: HTTP 200 com banco saudável. TCP 3000 só deve responder no loopback da EC2; 3306 não deve ser acessível externamente. No SG, confira 80/443 públicos e SSH restrito ao IP atual. O Nginx encaminha tráfego para `127.0.0.1:3000`.

## 6. CloudWatch

O template cria alarmes `conciliacao-agiw-cpu-high` e `conciliacao-agiw-instance-status-failed`. O bootstrap instala/configura o agente com [`infra/cloudwatch-agent.json`](../infra/cloudwatch-agent.json), com retenção configurada de 30 dias nos grupos:

- `/aws/conciliacao-agiw/app`
- `/aws/conciliacao-agiw/nginx-access`
- `/aws/conciliacao-agiw/nginx-error`
- `/aws/conciliacao-agiw/backup`

No console CloudWatch da região `us-east-1`, confirme eventos e métricas `ConciliacaoBancaria` (CPU, memória, disco). Na EC2:

```bash
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -m ec2 -a status
aws sts get-caller-identity
aws cloudwatch describe-alarms --region us-east-1 --alarm-name-prefix conciliacao-agiw
```

Se falhar, confira se o instance profile está associado e tem permissões de CloudWatch Agent; veja `sudo journalctl -u amazon-cloudwatch-agent --no-pager -n 100`.

## 7. Backup e restore

Faça uma execução inicial e confira o objeto no bucket próprio:

```bash
sudo env BACKUP_S3_BUCKET='<SEU-BUCKET>' AWS_REGION=us-east-1 /usr/local/bin/backup-conciliacao.sh
aws s3 ls s3://<SEU-BUCKET>/mysql/ --region us-east-1
```

Confira arquivo `.sql.gz`, SSE-S3 e logs no CloudWatch. O cron fica em `/etc/cron.d/conciliacao-backup`; mantém 14 dias localmente e 30 dias no S3.

### Ensaiar restore sem alterar o banco da aplicação

Este ensaio importa o dump em um schema temporário separado. Troque bucket e arquivo pelo backup da conta. O bloco remove apenas o schema temporário criado neste ensaio:

```bash
cd /home/ec2-user/conciliacao-agiw
set -euo pipefail
set -a; source .env; set +a
TEST_DB="restore_verify_$(date -u +%Y%m%d%H%M%S)"
sudo docker compose exec -T mysql mysql -uroot -p"$MYSQL_PASSWORD" \
  -e "CREATE DATABASE \`$TEST_DB\`;"
aws s3 cp s3://<SEU-BUCKET>/mysql/<ARQUIVO.sql.gz> - --region us-east-1 \
  | gzip -dc \
  | sudo docker compose exec -T mysql mysql -uroot -p"$MYSQL_PASSWORD" "$TEST_DB"
sudo docker compose exec mysql mysql -uroot -p"$MYSQL_PASSWORD" "$TEST_DB" -e 'SHOW TABLES;'
sudo docker compose exec -T mysql mysql -uroot -p"$MYSQL_PASSWORD" \
  -e "DROP DATABASE \`$TEST_DB\`;"
```

Confirme que as tabelas esperadas aparecem e registre a evidência. Se algum comando falhar, não execute o `DROP DATABASE` até entender o estado do schema temporário. Este ensaio não altera o schema configurado pela aplicação.

### Restore de dados da aplicação

O script abaixo restaura sobre o banco configurado e **substitui os dados atuais**. Use-o somente quando a intenção for recuperar aquela instalação, após escolher o arquivo correto:

```bash
cd /home/ec2-user/conciliacao-agiw
sudo bash infra/restore-conciliacao.sh s3://<SEU-BUCKET>/mysql/<ARQUIVO.sql.gz>
```

## 8. CI, CD e atualização

### CI

O workflow CI executa push em qualquer branch e Pull Request para `main`. No GitHub → **Actions**, confirme lint, build, Docker e verificação de credenciais aprovados.

### CD e as cinco contas

O CD atual mira um único host por meio dos secrets/vars `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY`, `EC2_APP_DIR`. A configuração existente publica na conta de referência. Não sobrescreva seus secrets para alternar entre os outros quatro servidores. Para esta replicação use deploy manual em cada um; isso mantém a mesma revisão de código sem misturar chaves.

Depois do CI passar, em cada EC2:

```bash
cd /home/ec2-user/conciliacao-agiw
git fetch origin projeto-nuvem-glauco
git reset --hard origin/projeto-nuvem-glauco
sudo docker compose up -d --build --remove-orphans
sudo docker compose exec -T app node scripts/init-db.mjs
curl -k -i https://127.0.0.1/api/health
```

`git reset --hard` descarta mudanças locais no checkout da EC2. CD automático por conta exigirá alterar o workflow para selecionar GitHub Environments (secrets independentes por conta) ou outro mecanismo de destinos com aprovação.

### Rollback

Anote o commit publicado. Se a versão nova falhar, volte ao commit anterior validado:

```bash
cd /home/ec2-user/conciliacao-agiw
git log --oneline -10
git checkout <COMMIT-ANTERIOR-VALIDADO>
sudo docker compose up -d --build
sudo docker compose exec -T app node scripts/init-db.mjs
curl -k -i https://127.0.0.1/api/health
```

Rollback de código não desfaz automaticamente mudanças no banco. Se necessário, escolha o backup e aplique restore conscientemente.

## 9. Checklist de cada membro

- [ ] Aplicação abre em HTTPS e `/api/health` responde 200.
- [ ] SG libera 80/443, restringe SSH e não expõe 3000/3306.
- [ ] EC2 tem Elastic IP e Instance Profile associado.
- [ ] CI passou para o commit apresentado.
- [ ] `.env`, chave PEM e credenciais bancárias são individuais, não versionadas.
- [ ] Logs/métricas aparecem no CloudWatch e alarmes são da própria instância.
- [ ] Backup foi enviado ao bucket próprio; bucket privado, SSE-S3, TLS e expiração 30 dias.
- [ ] Restore está documentado; teste de restore ocorreu em ambiente descartável.
- [ ] Commit e URL/IP da implantação foram anotados.
- [ ] Foi explicado que certificado autoassinado não é confiável para produção.

## Custos e limitações

Cada conta paga/consome créditos pelos próprios recursos; faça conferência individual. Learner Lab pode expirar, interromper EC2 e negar ações IAM/CloudFormation. Uma ação bloqueada deve ser tratada com professor/admin. A estimativa S3 e os cenários de crescimento estão em [AWS-PRODUCTION-READINESS.md](AWS-PRODUCTION-READINESS.md); custo depende da região, armazenamento, requests e transferência.
