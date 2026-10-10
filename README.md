# Módulo Conciliação Bancária

Projeto Banco · Ticket 37060 · **Agiw Sistemas**

Módulo que confronta a movimentação financeira registrada no Satis com o
extrato da instituição bancária, permitindo conciliar, estornar, lançar,
transferir entre contas, baixar títulos e bloquear períodos já fechados.

Implementa o *Documento de Visão — Projeto Banco* (`docs/37060_Documento_Projeto Banco.pdf`).

---

## Stack

| Camada | Tecnologia |
| --- | --- |
| Interface | Next.js 14 (App Router) + React 18 |
| API | Route Handlers do Next.js |
| Banco | MySQL / MariaDB (`mysql2`) |
| Relatórios | ExcelJS (xlsx), CSV e HTML de impressão (PDF) |
| Integração bancária | Strategy + Factory por banco (`src/providers/`) |

---

## Começando

```bash
npm install

cp .env.example .env      # preencha MYSQL_* e as credenciais dos bancos
npm run db:init           # cria o schema e reconcilia colunas novas
npm run db:seed           # massa de testes (4 contas com cenário completo)

npm run dev               # http://localhost:3000
```

Precisa de um MySQL ou MariaDB rodando. Com XAMPP, basta iniciar o MySQL no
painel de controle — o `.env.example` já vem apontado para `127.0.0.1:3306`
com usuário `root` sem senha.

### Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build de produção e execução |
| `npm run db:init` | Aplica `database/schema.sql` e acrescenta colunas faltantes |
| `npm run db:seed` | Popula a massa de testes |
| `npm run db:seed:limpar` | Remove apenas a massa de testes |
| `npm run diag:safra` | Diagnostica a integração Safra ponta a ponta |
| `npm run diag:bradesco` | Diagnostica a integração Bradesco |

---

## Funcionalidades

### Tela inicial — escolha da conta (item 6.1.1)

Cartão por conta corrente com banco, agência, saldo previsto no sistema, data
do último bloqueio e situação da integração. Permite cadastrar e remover
contas, que ficam no MySQL.

### Tela de conciliação (itens 6.1.2 e 6.1.3)

- **Período automático:** data inicial = último bloqueio + 1; data final = ontem
- **Grades lado a lado** com saldo anterior, entradas, saídas e saldo final
- **Seleção com trava de status:** não é possível misturar conciliados e não
  conciliados na mesma seleção
- **Conciliar / Desfazer:** exigem diferença zero entre as somatórias
- **Auto conciliar:** correspondência exata 1‑para‑1 e agrupamento por somatória
  (vários lançamentos que fecham um único movimento do banco)
- **Importar extrato:** via API do banco ou arquivo OFX / CSV / TXT, ignorando
  movimentos já existentes
- **Bloqueio de período:** gravado em `conta_corrente`, recusa lançamentos e
  baixas em data já fechada
- **Filtros de situação** nos dois lados, com contadores

### Menu do botão direito (item 6.1.3.8)

Clicar com o botão direito em qualquer grade abre as quatro ações previstas,
aproveitando os dados da linha sob o cursor:

1. **Novo Lançamento** — lançamento avulso no extrato do sistema
2. **Nova Transferência entre Contas** — gera o débito e o crédito
   simultaneamente; as duas pernas compartilham um código e são excluídas juntas
3. **Baixar Título** — lista os títulos a pagar e a receber em aberto até a data
   do movimento, aceita data, multa, juros, desconto e tarifa por documento,
   marca o título como baixado e gera o lançamento correspondente
4. **Excluir Registro** — respeita as travas: nada conciliado é excluído, e na
   grade de lançamentos apenas os originados na própria conciliação

### Relatórios (item 6.2)

Botão **Exportar** com duas escolhas: *qual* extrato (Satis, banco ou os dois) e
*em que* formato (Excel, CSV ou PDF). O arquivo reproduz o que está na tela — os
filtros de situação são aplicados e descritos no cabeçalho — e sempre traz saldo
inicial, movimentos, saldo final e os totais de entradas, saídas, conciliado e
não conciliado.

### Auditoria

Trilha de todas as ações do módulo (conciliação, estorno, bloqueio, lançamento,
exclusão, importação, exportação), com filtro por ação e período, e o histórico
de arquivos de extrato enviados.

---

## Integrações bancárias

Cada banco é uma classe que estende `BankProvider` e é registrada na
`BankProviderFactory`. Incluir um novo banco não altera os existentes.

| Banco | Situação |
| --- | --- |
| **Bradesco** | Extrato de conta corrente via OAuth2 + mTLS. Exige certificado de cliente (`.crt` + `.key`) do portal do desenvolvedor. |
| **Safra** | Autenticação OAuth2 (`grant_type=password`) **funcionando** contra o gateway de homologação. Cobrança (consulta, baixa e instrução de boleto) implementada conforme o *Kit Welcome API COB V3.0*. O extrato de conta corrente é um produto contratado à parte — o caminho fica em `SAFRA_EXTRATO_PATH` e o provider já trata a resposta; sem liberação, a API devolve 404 e o sistema orienta a usar a importação por arquivo. |
| **Itaú / Banco do Brasil** | Estrutura pronta, aguardando a documentação e as credenciais. |

Enquanto uma API não está liberada, a importação por **arquivo OFX/CSV/TXT**
atende o mesmo fluxo, conforme previsto no item 6.1.3.3.

---

## Massa de testes

`npm run db:seed` cria quatro contas (Bradesco, Itaú, Banco do Brasil e Safra),
cada uma com um cenário completo e **datas relativas ao dia da execução**, de
modo que a massa nunca envelhece. A geração é determinística e idempotente.

Por conta:

| Cenário | Para exercitar |
| --- | --- |
| 6 pares idênticos | Auto conciliação 1‑para‑1 |
| 1 movimento dividido em 2 parcelas | Auto conciliação por somatória |
| 1 par já conciliado | Filtros de situação e botão *Desfazer* |
| Tarifas e pendências dos dois lados | Conciliação manual e *Novo Lançamento* |
| 4 títulos vencidos (2 fecham com o banco) | Ação *Baixar Título* |
| 2 títulos a vencer | Recorte por data limite na baixa |
| 4 contas cadastradas | Ação *Transferência entre Contas* |

---

## Estrutura

```
src/
├── app/
│   ├── api/
│   │   ├── auditoria/            trilha de auditoria
│   │   ├── bank/                 providers, contas, extrato (API e arquivo)
│   │   ├── conciliacao/          lançamentos, movimentos, conciliar,
│   │   │                         auto-match, bloqueio, transferência, títulos
│   │   └── relatorios/           exportação xlsx / csv / pdf
│   ├── auditoria/ conciliacao/   páginas
├── components/                   telas, modais, menu de contexto, campo de data
├── contexts/                     conta corrente selecionada
├── hooks/useConciliacao.js       regras da tela de conciliação
├── lib/
│   ├── conciliacao/              parser de extrato (OFX/CSV) e utilitários
│   ├── relatorios/               geração dos relatórios
│   └── repositories/             acesso ao MySQL
├── providers/                    integrações bancárias (Strategy + Factory)
├── services/                     chamadas HTTP do cliente
└── utils/                        formatação, subset-sum, catálogos
```

---

## Publicação na AWS

[![CI — Build & Lint](https://github.com/SUBSTITUIR/PI_Agiw_Fatec/actions/workflows/ci.yml/badge.svg)](https://github.com/SUBSTITUIR/PI_Agiw_Fatec/actions/workflows/ci.yml)
[![CD — Deploy EC2](https://github.com/SUBSTITUIR/PI_Agiw_Fatec/actions/workflows/cd.yml/badge.svg)](https://github.com/SUBSTITUIR/PI_Agiw_Fatec/actions/workflows/cd.yml)

`Dockerfile` e `docker-compose.yml` prontos na raiz. A infraestrutura completa
(EC2 + Security Group + Elastic IP) pode ser provisionada via CloudFormation:

```bash
# 1. Provisionar infraestrutura AWS (uma vez)
aws cloudformation create-stack \
  --stack-name conciliacao-agiw \
  --template-body file://infra/cloudformation.yml \
  --parameters \
      ParameterKey=KeyPairName,ParameterValue=<SEU-PAR-DE-CHAVES> \
      ParameterKey=GitRepoUrl,ParameterValue=<URL-DO-REPO>

# 2. Conectar na EC2 e fazer setup
ssh -i <chave>.pem ec2-user@<ELASTIC-IP>
cd conciliacao-agiw
bash infra/setup-ec2.sh

# 3. Configurar credenciais
nano .env

# 4. Subir aplicação
docker compose up -d --build
docker compose exec app node scripts/init-db.mjs
docker compose logs -f app
```

### Deploy automático (CD)

Após configurar os **GitHub Secrets** abaixo, todo merge na `main` faz deploy automático:

| Secret | Valor |
|---|---|
| `EC2_HOST` | IP público da EC2 (Elastic IP) |
| `EC2_USER` | `ec2-user` |
| `EC2_SSH_KEY` | Conteúdo completo do arquivo `.pem` |
| `EC2_APP_DIR` | `/home/ec2-user/conciliacao-agiw` |

### Documentação completa de produção

Consulte [`docs/AWS-PRODUCTION-READINESS.md`](docs/AWS-PRODUCTION-READINESS.md) para:

- Diagrama de arquitetura (lab e produção)
- Configuração HTTPS com Nginx e certificado auto-assinado
- IAM: Academy vs. produção (Least Privilege)
- Estratégia de backup e restore
- Plano de rollback
- Escalabilidade e estimativa de custos
- Checklist completo de entrega do PI

---

## CI/CD

| Pipeline | Disparo | O que faz |
|---|---|---|
| **CI** (`.github/workflows/ci.yml`) | Push em qualquer branch / PR para main | Lint → Build → Validação Docker → Verificação de credenciais |
| **CD** (`.github/workflows/cd.yml`) | Merge na `main` | Repete CI → SSH na EC2 → git pull → docker compose up → Health check |

---

## Segurança

- `.env`, certificados (`*.key`, `*.crt`, `*.pfx`) e a pasta `docs/` estão fora
  do Git e fora da imagem Docker
- Credenciais das APIs bancárias só existem no servidor — nunca chegam ao
  navegador
- Certificados mTLS entram por volume somente leitura, nunca dentro da imagem
- O contêiner roda com usuário sem privilégios (`nextjs`, UID 1001)
- Porta MySQL (`3306`) vinculada a `127.0.0.1` — nunca exposta para a internet
- O CI verifica automaticamente a ausência de credenciais hardcoded no código
- Health check em `/api/health` para monitoramento e deploys automatizados
