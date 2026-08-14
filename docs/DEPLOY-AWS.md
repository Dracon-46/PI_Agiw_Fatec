# Publicação na AWS — Módulo Conciliação Bancária

Projeto Banco · Ticket 37060 · Agiw Sistemas

Este guia cobre a publicação em uma conta **AWS Academy Learner Lab**, que é o
ambiente disponível para o projeto. O roteiro também vale para uma conta AWS
comum — as diferenças estão sinalizadas.

---

## Antes de começar: dois pontos de segurança

**1. Troque a senha da sua conta AWS Academy.** A senha do portal foi enviada
por mensagem em texto puro. Toda credencial que trafega assim deve ser
considerada comprometida: entre no portal e troque antes de continuar.

**2. Nunca coloque credenciais no repositório.** O `.gitignore` e o
`.dockerignore` já bloqueiam `.env`, certificados e a pasta `docs/`. Na AWS, as
credenciais entram como variáveis de ambiente no servidor — nunca dentro da
imagem Docker nem no código.

---

## Limitações do Learner Lab que mudam o desenho

| Restrição | Consequência |
| --- | --- |
| A sessão expira (normalmente 4 h) e a máquina é **desligada** ao encerrar | Não conte com uptime contínuo; use `restart: unless-stopped` para religar tudo ao ligar a EC2 |
| As chaves de acesso (`aws_access_key_id`, `secret`, `session_token`) **rotacionam a cada sessão** | Pegue-as sempre no botão **AWS Details → Show** antes de usar a CLI |
| Só a role `LabRole` pode ser usada; não é possível criar roles | Nada de perfis de instância customizados |
| Tipos de instância limitados (t2/t3 até *medium*) e região fixa (normalmente `us-east-1`) | `t3.small` já roda o módulo com folga |
| RDS pode estar bloqueado dependendo do laboratório | Se estiver, use o MySQL em contêiner (Opção A) |

---

## Opção A — EC2 com aplicação e MySQL em contêiner (recomendada para o lab)

É a mais simples: uma única instância roda tudo via `docker compose`.

### A.1 Criar a instância

No console EC2 → **Launch instance**:

- **Nome:** `conciliacao-agiw`
- **AMI:** Amazon Linux 2023
- **Tipo:** `t3.small`
- **Par de chaves:** crie um novo e guarde o `.pem`
- **Security group** — libere apenas o necessário:
  - SSH (22) → **somente o seu IP** (opção "My IP")
  - TCP personalizada (3000) → seu IP, enquanto estiver em homologação
  - Não abra a porta 3306 para a internet em hipótese alguma
- **Armazenamento:** 20 GiB gp3

### A.2 Preparar a máquina

```bash
ssh -i conciliacao-agiw.pem ec2-user@<IP-PUBLICO>

sudo dnf update -y
sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user

# Plugin do docker compose
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Reabra a sessão para o grupo docker valer
exit
```

### A.3 Enviar o projeto e configurar

```bash
ssh -i conciliacao-agiw.pem ec2-user@<IP-PUBLICO>
git clone <URL-DO-REPOSITORIO> conciliacao-agiw
cd conciliacao-agiw

cp .env.example .env
nano .env
```

No `.env` da instância, preencha:

```ini
MYSQL_HOST=mysql
MYSQL_USER=root
MYSQL_PASSWORD=<senha forte gerada agora>
MYSQL_DATABASE=conciliacao_agiw

BANK_PROVIDER=bradesco

SAFRA_API_URL=https://api-hml.safranegocios.com.br
SAFRA_CLIENT_ID=<client id>
SAFRA_USERNAME=<usuário>
SAFRA_PASSWORD=<senha>
```

Se for usar o Bradesco, envie os certificados por SCP para `certs/` — o
`docker-compose.yml` monta essa pasta como volume somente leitura:

```bash
scp -i conciliacao-agiw.pem certificado.crt chave.key ec2-user@<IP>:~/conciliacao-agiw/certs/
```

### A.4 Subir

```bash
docker compose up -d --build
docker compose exec app node scripts/init-db.mjs   # cria/atualiza o schema
docker compose exec app node scripts/seed-demo.mjs # massa de testes (opcional)
docker compose logs -f app
```

Acesse `http://<IP-PUBLICO>:3000`.

---

## Opção B — EC2 + RDS MySQL (quando o laboratório permite RDS)

Separa o banco da aplicação; é o desenho correto para produção.

### B.1 Criar o RDS

Console RDS → **Create database**:

- **Engine:** MySQL 8.0
- **Template:** Free tier / Dev-Test
- **Instância:** `db.t3.micro`
- **Identificador:** `conciliacao-db`
- **Usuário mestre:** `admin` + senha forte
- **Acesso público:** **Não**
- **VPC:** a mesma da EC2
- **Security group:** crie `sg-conciliacao-db` liberando **3306 apenas para o
  security group da EC2** (não para um CIDR aberto)

### B.2 Apontar a aplicação para o RDS

No `.env` da instância:

```ini
MYSQL_HOST=conciliacao-db.xxxxxxxx.us-east-1.rds.amazonaws.com
MYSQL_PORT=3306
MYSQL_USER=admin
MYSQL_PASSWORD=<senha do RDS>
MYSQL_DATABASE=conciliacao_agiw
```

Remova (ou comente) o serviço `mysql` e o bloco `depends_on` do
`docker-compose.yml`, e suba apenas a aplicação:

```bash
docker compose up -d --build app
docker compose exec app node scripts/init-db.mjs
```

---

## Colocando na porta 80 com HTTPS

Enquanto o acesso é só da equipe, a porta 3000 resolve. Para expor de verdade,
ponha um Nginx na frente:

```bash
sudo dnf install -y nginx
sudo tee /etc/nginx/conf.d/conciliacao.conf > /dev/null <<'CONF'
server {
    listen 80;
    server_name _;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
CONF
sudo systemctl enable --now nginx
```

Depois libere a porta 80 no security group e feche a 3000. Para HTTPS com
domínio próprio, use `certbot --nginx`. Sem domínio, um Application Load
Balancer com certificado do ACM também resolve — mas consome mais recursos do
orçamento do laboratório.

---

## Operação do dia a dia

```bash
docker compose logs -f app          # acompanhar a aplicação
docker compose restart app          # reiniciar após mudar o .env
docker compose down                 # parar tudo (os dados ficam no volume)
docker compose up -d --build        # atualizar após um git pull

# Backup do banco (Opção A)
docker compose exec mysql \
  mysqldump -uroot -p<senha> conciliacao_agiw > backup-$(date +%F).sql
```

**Ao encerrar a sessão do Learner Lab**, a EC2 é parada e o IP público muda ao
religar. Para manter o endereço, associe um **Elastic IP** à instância.

---

## Verificação depois de publicar

1. `http://<host>:3000` abre a tela de escolha de conta
2. Cada cartão mostra saldo previsto e data do último bloqueio
3. Escolher uma conta e clicar em **Buscar** traz lançamentos e movimentos
4. **Auto conciliar** fecha 7 correspondências na massa de exemplo
5. **Exportar → Excel** baixa o arquivo com as duas abas
6. `docker compose exec app node scripts/diag-safra.mjs` autentica no gateway
   do Safra (confirma que a saída da EC2 para a internet está liberada)

---

## O que **não** fazer

- Não subir `.env`, `*.key`, `*.crt` ou `.pfx` para o Git ou para a imagem
- Não abrir 3306 para `0.0.0.0/0`
- Não deixar `MYSQL_PASSWORD` vazio fora da máquina de desenvolvimento
- Não reaproveitar as chaves de sessão do Learner Lab em scripts — elas expiram
