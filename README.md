# Módulo Conciliação Bancária

Projeto Banco · Ticket 37060 · **Agiw Sistemas**

Módulo que confronta a movimentação financeira registrada no Satis com o
extrato da instituição bancária, permitindo conciliar, estornar, lançar,
transferir entre contas e bloquear períodos já fechados.

Implementa o *Documento de Visão — Projeto Banco* (`docs/37060_Documento_Projeto Banco.pdf`).

Explicação do código (camadas, fluxos e decisões de projeto):
[`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

---

## Stack

| Camada | Tecnologia |
| --- | --- |
| Interface | Next.js 14 (App Router) + React 18 |
| API | Route Handlers do Next.js |
| Banco | SQL Server — o banco do ERP (Prisma + adapter `mssql`) |
| Relatórios | ExcelJS (xlsx), CSV, HTML de impressão (PDF) e OFX |
| Integração bancária | Strategy + Factory por banco (`src/providers/`) |

---

## Começando

```bash
npm install

cp .env.example .env      # preencha DB_* e as credenciais dos bancos
npm run db:init           # cria as duas tabelas do módulo no banco do ERP
npm run db:extrato        # opcional: carrega o extrato das contas configuradas

npm run dev               # http://localhost:3000
```

Precisa de um SQL Server com o banco do ERP (`BDAPRESENTACAO`) acessível. O
módulo trabalha dentro dele, sobre as tabelas do Satis — o `npm run db:init`
confere se elas estão lá antes de criar as duas tabelas que são do módulo.

### Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build de produção e execução |
| `npm run db:init` | Confere as tabelas do ERP e cria `TBCONB008` e `TBCONB009` |
| `npm run db:extrato` | Carrega o extrato das contas configuradas pelo caminho da tela |
| `npm run diag:safra` | Diagnostica a integração Safra ponta a ponta |
| `npm run diag:bradesco` | Diagnostica a integração Bradesco |
| `npm run diag:itau` | Diagnostica a integração Itaú |
| `npm run diag:bb` | Diagnostica a integração Banco do Brasil |

---

## Funcionalidades

### Tela inicial — escolha da conta (item 6.1.1)

Cartão por conta corrente com o logotipo do banco, agência, saldo previsto no
sistema e data do último bloqueio. Permite cadastrar, **alterar** e remover
contas, que ficam em `TBGENE016` — o cadastro de contas do próprio ERP.

Só aparecem as contas cujo banco tem a integração configurada: sem credencial
não há extrato, e exibi-las levaria o usuário direto a um erro. A conferência
é por conta: credencial global válida com agência/conta incompleta também
reprova.

### Tela de conciliação (itens 6.1.2 e 6.1.3)

- **Período automático:** data inicial = último bloqueio + 1; data final = ontem
- **Grades lado a lado** com saldo anterior, entradas, saídas e saldo final
- **Seleção com trava de status:** não é possível misturar conciliados e não
  conciliados na mesma seleção
- **Conciliar / Estorno:** exigem diferença zero entre as somatórias
- **Auto conciliar:** quatro passadas, da correspondência mais forte para a
  mais fraca — 1:1 exata, N:1 (vários lançamentos fechando um movimento),
  1:N (um lançamento para vários movimentos) e N:N (os dois lados em conjunto)
- **Extrato gravado, API consultada uma vez:** o extrato da instituição é
  copiado para `TBCONB006`, o extrato do ERP, na primeira leitura. A cada busca o sistema confere
  quais dias já tem e consulta o banco **apenas para os que faltam** — sem
  isso, períodos antigos ficariam inacessíveis (o BB não devolve nada além de
  5 anos) e cada abertura de tela gastaria cota do gateway. Concluída a busca,
  os pares de mesma data e valor já vêm selecionados
- **Período limitado a 60 dias:** intervalos maiores são recusados com aviso —
  conferir dois meses de uma vez já não é conciliação, e o custo cai no
  gateway do banco
- **Bloqueio de período:** gravado em `TBGENE016.DATULTBLOQUEIO`, recusa
  lançamentos em data já fechada. Exige a permissão `conciliacao.bloqueio`,
  conferida no servidor — a tela apenas reflete o que a rota autoriza
- **Filtros de situação** nos dois lados, com contadores, mais o filtro por
  qualquer campo da grade — combinável e com a quantidade aplicada à vista
- **Somatórias em duas linhas:** uma para os selecionados conciliados e outra
  para os não conciliados, cada uma com a sua diferença
- **Saldos por extrato:** saldo anterior, entradas, saídas e saldo final nos
  dois lados

### Menu do botão direito (item 6.1.3.8)

Clicar com o botão direito em qualquer grade abre as ações previstas,
aproveitando os dados da linha sob o cursor:

1. **Novo Lançamento** — lançamento avulso no extrato do sistema
2. **Nova Transferência entre Contas** — gera o débito e o crédito
   simultaneamente; as duas pernas compartilham um código e são excluídas juntas
3. **Excluir Registro** — respeita as travas: nada conciliado é excluído, e
   somente lançamentos do ERP originados na própria conciliação. O extrato do
   banco não é editável: ele é o registro da instituição

### Relatórios (item 6.2)

Botão **Exportar** com duas escolhas: *qual* extrato (Satis, banco ou os dois) e
*em que* formato (Excel, CSV, PDF ou **OFX**, o padrão bancário que a
contabilidade importa direto). O arquivo reproduz o que está na tela — os
filtros de situação são aplicados e descritos no cabeçalho — e sempre traz saldo
inicial, movimentos, saldo final e os totais de entradas, saídas, conciliado e
não conciliado.

### Usuários e permissões

O usuário corrente vem de `USUARIO_ATUAL` no `.env` enquanto o módulo não
recebe a sessão do Satis: é o `USER_ID` conferido em `TBSENH006` (suspensão e
bloqueio no ERP barram o acesso). As permissões saem de `TBSENH005`, a mesma
tabela que o Satis usa — cada uma é uma operação em um módulo do ERP:

| Permissão | Cobre |
| --- | --- |
| `conciliacao.bloqueio` | Fechar e reabrir período (item 6.1.3.1) — ALTERACAO em CONB002 |
| `conciliacao.conciliar` | Conciliar e estornar (itens 6.1.3.6 e 6.1.3.7) — ALTERACAO em CONB001 |
| `conciliacao.lancamento` | Lançar e transferir entre contas (item 6.1.3.8) — INCLUSAO em CONB001 |
| `conciliacao.exclusao` | Excluir lançamento (item 6.1.3.8 — ação 4) — EXCLUSAO em CONB001 |

Quem libera cada operação é o cadastro de permissões do Satis, então o acesso
ao módulo é mantido onde o cliente já mantém os outros.

### Catálogos

Tipos de documento, subgrupos de fluxo de caixa (TBFLCX002), contas contábeis
(TBGENE023) e centros de custo (TBCOMP008) vêm das tabelas do ERP e alimentam as caixas
de lançamento e transferência.

### Auditoria

Trilha de todas as ações do módulo (conciliação, estorno, bloqueio, lançamento,
exclusão, exportação), com filtro por ação e período.

---

## Integrações bancárias

Cada banco é uma classe que estende `BankProvider` e é registrada na
`BankProviderFactory`. Incluir um novo banco não altera os existentes.

| Banco | Situação |
| --- | --- |
| **Bradesco** | Extrato de conta corrente via OAuth2 + mTLS. Exige certificado de cliente (`.crt` + `.key`) do portal do desenvolvedor. |
| **Safra** | Autenticação OAuth2 (`grant_type=password`) **funcionando** contra o gateway de homologação. Cobrança (consulta, baixa e instrução de boleto) implementada conforme o *Kit Welcome API COB V3.0*. O extrato de conta corrente é um produto contratado à parte — o caminho fica em `SAFRA_EXTRATO_PATH` e o provider já trata a resposta; sem liberação, a API devolve 404 e o sistema informa a pendência. |
| **Itaú** | Extrato da carteira de cobrança (*API Boletos — Extrato Boleto Cobrança*) **funcionando** no sandbox: OAuth2 `client_credentials`, `/francesas` e `/francesas/{id}/movimentacoes`. A conciliação importa apenas as **liquidações**, o único evento da francesa que credita a conta. Débitos (TED, PIX, tarifas avulsas) exigem a API de Conta Corrente, ainda não contratada. Produção pede `private_key_jwt` + mTLS. Diagnóstico: `npm run diag:itau`. |
| **Banco do Brasil** | Extrato de conta corrente (*API Extratos v2*) implementado: OAuth2 `client_credentials`, paginação e separação de lançamentos, saldos e limites pelo `indicadorTipoLancamento`. Autenticação **validada** contra o gateway de homologação. O extrato exige mTLS com certificado A1 e-CNPJ cadastrado no Portal Developers. Diagnóstico: `npm run diag:bb`. |

Sem a API liberada, a conta não aparece na tela inicial: sem extrato não há o
que conciliar, e exibi-la levaria direto a um erro.

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
│   └── repositories/             acesso ao banco do ERP
├── providers/                    integrações bancárias (Strategy + Factory)
├── services/                     chamadas HTTP do cliente
└── utils/                        formatação, subset-sum, catálogos
```

---

## Publicação

O módulo é um app Next.js: `npm run build` e `npm start` no servidor que
alcança o SQL Server do ERP.

Os arquivos de contêiner e o passo a passo da AWS ficam na branch
`infra/docker-aws`, fora do main — publicação é assunto de infraestrutura, e
mantê-la separada evita que a raiz do projeto acumule configuração que o
desenvolvimento não usa.

---

## Segurança

- `.env`, os certificados (`*.key`, `*.crt`, `*.pfx`) e a pasta `docs/` estão
  fora do Git
- Credenciais das APIs bancárias só existem no servidor — nunca chegam ao
  navegador
- Os segredos de banco ficam nas variáveis `DB_*`, lidas só no servidor
- O usuário corrente e as permissões são conferidos no ERP a cada gravação
