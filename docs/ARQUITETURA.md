# Conciliação Bancária — Guia do Código

Projeto Banco · Ticket 37060 · **Agiw Sistemas**

Este documento explica **como o código funciona**: quais camadas existem, o que
cada arquivo faz, por onde passa um dado desde a API do banco até a grade da
tela, e por que algumas decisões estranhas à primeira vista são propositais.

O `README.md` descreve o que o módulo **faz** (funcionalidades, item por item do
documento de visão). Aqui o assunto é a implementação.

---

## 1. Visão geral em uma página

O módulo confronta dois extratos da mesma conta corrente e do mesmo período:

| Lado | Fonte | Onde mora |
| --- | --- | --- |
| **Movimentos no Sistema** (Satis/ERP) | tabela `lancamento_sistema` | MySQL |
| **Movimentos no Banco** | API da instituição, gravada na primeira leitura | `movimento_banco` |

A regra central, que explica metade do código:

> **O extrato é copiado para o MySQL, e a API só é consultada para os dias que
> ainda não temos.** A tabela `extrato_dia` guarda um registro por dia coberto —
> sem ela não haveria como distinguir "dia sem movimento" de "dia nunca
> consultado", já que os dois chegam como lista vazia.

Duas razões, e nenhuma é só desempenho: as APIs têm janela limitada (o BB não
devolve nada além de 5 anos), então sem cópia local a conciliação de períodos
antigos seria impossível; e reconsultar o mesmo período a cada abertura de tela
gasta cota do gateway à toa.

Fluxo de uma leitura completa:

```
navegador                    servidor (Next.js Route Handler)             externo
─────────                    ────────────────────────────────             ───────
useConciliacao.buscaMovimentos()
   │
   ├─ conciliacaoService ─► GET /api/conciliacao/lancamentos ─► lancamentoRepository ─► MySQL
   │
   └─ conciliacaoService ─► GET /api/bank/extrato ─► lib/extratoBanco.js
                                                       ├─ extrato_dia: que dias faltam?
                                                       ├─ BankProviderFactory (só os buracos)
                                                       │     └─ XProvider.fetchExtrato() ─► API do banco
                                                       └─ movimentoRepository (grava, depois lê)
```

Ao receber as duas listas, o hook casa automaticamente os pares de mesma data,
valor e sentido e devolve tudo pronto para as grades.

---

## 2. Stack e organização

| Camada | Tecnologia |
| --- | --- |
| Interface | Next.js 14 (App Router) + React 18, componentes `'use client'` |
| API | Route Handlers (`src/app/api/**/route.js`) |
| Banco | MySQL / MariaDB via `mysql2/promise` |
| Relatórios | ExcelJS (xlsx), CSV, HTML de impressão (PDF) e OFX (SGML) |
| Ícones | `lucide-react` |
| Estilo | CSS próprio em `src/styles/globals.css` (sem framework de UI) |

```
src/
├── app/                     rotas (páginas) e API Routes
│   ├── layout.jsx           providers globais (conta + notificações)
│   ├── page.jsx             "/"            → escolha da conta
│   ├── conciliacao/         "/conciliacao" → tela principal
│   ├── auditoria/           "/auditoria"   → trilha de auditoria
│   └── api/                 endpoints (ver seção 6)
├── components/              telas, modais, menu de contexto, campos
├── contexts/BankContext.jsx conta selecionada, usuário, catálogos
├── hooks/useConciliacao.js  todas as regras da tela de conciliação
├── lib/
│   ├── db.js                pool MySQL + conversão de datas
│   ├── extratoBanco.js      extrato: cache no MySQL + consulta dos buracos
│   ├── conciliacao/         utilitários de valor e data
│   ├── relatorios/          geração de xlsx, csv, HTML de impressão e OFX
│   └── repositories/        acesso ao MySQL, um arquivo por agregado
├── providers/               integrações bancárias (Strategy + Factory)
├── services/                cliente HTTP do navegador + regra do auto-match
└── utils/                   formatação, subset-sum, permissões, origens
```

Regra de dependência: `components` → `hooks` → `services` → `api` →
`lib/repositories` | `providers`. Componente nenhum importa repositório ou
provider — segredo de banco não chega ao navegador.

---

## 3. Convenções de código

O projeto segue o *Padrão Programação* da Agiw (`docs/Padrao Programação.pdf`).
O padrão tem **duas tabelas diferentes**, e confundi-las é o erro comum.

**Nomes de variáveis** — notação húngara pelo **tipo**:

| Prefixo | Tipo | Exemplo |
| --- | --- | --- |
| `s` | string | `sCodConta` |
| `i` | inteiro / contador | `iQuantidade` |
| `b` | booleano | `bConciliado` |
| `a` | array | `aMovimentos` |
| `dt` | Date (TDateTime no padrão) | `dtVencimento` |
| `n` | número decimal | `nValorPago` |
| `o` | objeto | `oConta` |

`n` e `o` são adaptações para JavaScript: o padrão original é Delphi e traz `e`
para `Extended` (que não existe em JS) e nada para objeto.

O prefixo indica o **tipo**, não o significado. Por isso
`const sDataFim = oParams.get('dataFim')` é `s` e não `dt`: o valor é o texto
`"20/03/2026"`, não um `Date`.

**Nomes de campos** (colunas de tabela) — prefixo pelo **papel**:
`cod_` código · `des_` descrição · `dat_` data · `val_` valor · `num_` número ·
`tip_` tipo · `sta_` status · `b_` booleano.

**Outras convenções observadas em todo o código:**

- comentário de fechamento nas funções: `} // nomeDaFuncao`;
- JSDoc em toda função exportada, com `@param` e `@returns`;
- cabeçalho em bloco no topo do arquivo dizendo o que ele resolve e **qual item
  do documento de visão** atende;
- em rotas que gravam: **todas as validações antes de iniciar a gravação**, e a
  mensagem de sucesso montada **somente depois** de concluí-la;
- datas trafegam sempre em `DD/MM/AAAA` entre tela, API interna e relatórios; a
  conversão para/de `AAAA-MM-DD` acontece só na borda do MySQL
  (`dataBrParaMysql` / `dataMysqlParaBr` em [db.js](../src/lib/db.js));
- valores monetários são comparados em **centavos inteiros**, nunca em `float`
  (ver seção 9.1).

---

## 4. Modelo de dados

[`database/schema.sql`](../database/schema.sql) — só estrutura e o catálogo de
bancos. Contas vêm do cadastro, extrato vem da API, lançamentos vêm do Satis;
nada de massa falsa no schema.

| Tabela | Papel |
| --- | --- |
| `banco` | catálogo de compensação (TBGENE015): nome, slug do provider, cores, logo |
| `conta_corrente` | contas cadastradas; guarda `dat_ultimo_bloqueio` |
| `conta_credencial` | credenciais por conta (opcional); segredos globais ficam no `.env` |
| `lancamento_sistema` | extrato do Satis (TBCONB001): o lado esquerdo da tela |
| `movimento_banco` | extrato do banco, copiado da instituição |
| `extrato_dia` | um registro por dia de extrato já consultado |
| `auditoria` | trilha de todas as ações do módulo |
| `tipo_documento`, `subgrupo_fluxo`, `conta_contabil`, `centro_custo` | catálogos das caixas de lançamento (TBFLCX002, TBGENE023, TBCOMP008) |
| `usuario`, `usuario_permissao` | usuário corrente e permissões |

### 4.1 `movimento_banco` e `extrato_dia`

O extrato do banco é gravado por inteiro — data, valor, sentido, histórico,
documento e o código de tipo da instituição. `sta_conciliado` é a única coluna
que é **nossa**, e por isso nunca é sobrescrita ao reconsultar um período.

A chave é `cod_movimento`, **determinístico**, montado em
[extratoBanco.js](../src/lib/extratoBanco.js):

```
API-<codConta>-<dataSóDígitos>-<numDocumento|índice>-<E|S>-<valorEmCentavos>-<codTipo>-<ocorrência>
```

A mesma linha do extrato produz sempre o mesmo código, então reconsultar
atualiza em vez de duplicar. Dois detalhes que custaram bug:

- o `codigoLancamento` do Bradesco **não** serve como chave: identifica o *tipo*
  da transação (ex.: `03584` = rendimento) e se repete entre movimentos;
- o **discriminador de ocorrência** no fim é obrigatório. Sem ele, dois
  movimentos de mesmo dia, documento, sentido e valor geram a mesma chave e um
  sobrescreve o outro. Acontece de verdade: o sandbox do Itaú devolve três
  liquidações idênticas do mesmo título. Quando o banco fornece identificador
  próprio de transação (o BB o faz na v2, em
  `TextoIdentificadorUnicoTransacao`), é ele que entra ali; senão, a posição na
  resposta.

`extrato_dia` marca os dias já consultados, e é gravada **depois** dos
movimentos: falha no meio deixa o dia pendente e a próxima busca refaz a
consulta, em vez de dar por coberto um dia com extrato incompleto.

**Não há exclusão de movimento.** O item 6.1.3.8 permite excluir apenas
registros do ERP; o extrato do banco é o registro da instituição e não se apaga.

### 4.2 Chaves lógicas

- `cod_conta` = `slug-agencia-conta` em minúsculas (`montaCodConta`), a chave
  que a tela usa em toda chamada;
- `cod_lancamento` sequencial por conta (`geraProximoCodigoLancamento`);
- `cod_transferencia` (`TR-000001`) compartilhado pelas **duas pernas** de uma
  transferência — é o que as torna um par indivisível na exclusão.

---

## 5. Integrações bancárias (`src/providers/`)

Padrão **Strategy + Factory**. Incluir um banco novo não altera os existentes.

[`BankProvider.js`](../src/providers/BankProvider.js) é a classe abstrata —
instanciá-la direto lança erro. Contrato:

| Método | Responsabilidade |
| --- | --- |
| `getName()` / `getSlug()` / `getColor()` | identificação para a UI |
| `getConfig()` | lê as variáveis de ambiente do banco |
| `isConfigured()` | há credencial suficiente para tentar? |
| `verificaConfiguracao()` | lista o que falta, em texto acionável |
| `verificaConta(oConta)` | a **conta** tem o que a API exige? |
| `authenticate()` | devolve o access token, com cache interno |
| `fetchExtrato(dataInicio, dataFim, oConta)` | extrato **normalizado** do período |
| `clearCache()` | descarta token e agentes HTTPS |

A separação entre `isConfigured()` e `verificaConta()` importa: a credencial é
global (do `.env`), mas agência, conta e DAC vêm do cadastro. Um provider com
credencial válida e conta incompleta está "configurado" e mesmo assim não
consegue buscar aquela conta — era assim que o Itaú aparecia pronto na tela
inicial e só quebrava na busca.

`fetchExtrato` devolve sempre o mesmo formato, seja qual for o banco:

```js
{ datMovimento: 'DD/MM/AAAA', desHistorico, numDocumento,
  valEntrada: number|null, valSaida: number|null,
  codigoLancamento, idTransacao, staConciliado: false }
```

[`BankProviderFactory.js`](../src/providers/BankProviderFactory.js) mantém o
registry `{ bradesco, itau, bb, safra }` e um **singleton por slug** (o cache do
token vive na instância).

### 5.1 Bradesco — `fornecimento-extratos-contas`

OAuth2 **com mTLS obrigatório**: sem certificado de cliente o endpoint de token
responde `401 SSL with client authentication is required` e todos os outros
caminhos respondem 404.

- datas na API em `DDMMAAAA`;
- o grupo `"saldo anterior"` na resposta **não** é movimento e é descartado;
- valores em formato pt-BR, convertidos por `limpaSeparadores`.

### 5.2 Itaú — *API Boletos: Extrato Boleto Cobrança*

Token `client_credentials` em `POST {host}/api/oauth/jwt`; o token do sandbox
vale **5 minutos**. Headers obrigatórios: `x-itau-apikey` e
`x-itau-correlationID`.

A "francesa" é a **posição diária** da carteira de cobrança. A API não aceita
período: cada consulta devolve **um dia**. Por isso `fetchExtrato` quebra o
período em meses de referência, descobre em `/francesas` quais dias têm posição,
recusa acima de 62 dias e percorre os dias **sequencialmente** (paralelo só
aumentaria o risco de throttling).

Detalhes que custaram bug:

- **a data do movimento é a do dia consultado**, não a do registro.
  `/movimentacoes?data=X` devolve, por definição, as movimentações de X; o
  sandbox manda `dataMovimentacao` fixo (03/05/2022) para qualquer data pedida,
  e confiar nele fazia todo movimento nascer fora do período — o recorte
  descartava tudo e a grade ficava vazia sem erro aparente;
- **só liquidações** entram na conciliação: é o único evento da francesa que
  credita a conta. O filtro é conferido no cliente (`ehLiquidacao`) porque o
  gateway devolve os mesmos registros para `tipoMovimentacao=entradas` e
  `=liquidacoes`, ou seja, ignora o filtro pedido na URL;
- o valor usado é `valorLiquidoLancado` (já com juros, multa e desconto);
- `leValorItau` converte com `Number()`, sem `limpaSeparadores`: o Itaú manda
  `"128847.13"` com ponto decimal, e o utilitário pt-BR leria `"1234.567"` como
  separador de milhar, multiplicando por mil;
- **escopo**: é o extrato da *cobrança*, não da conta corrente. TED, PIX e
  tarifas avulsas exigem a API de Conta Corrente, produto separado.

### 5.3 Safra — Kit Welcome API COB V3.0

Token OAuth2 `grant_type=password`. Cobrança implementada (consulta, consulta
detalhada, baixa e instrução), cada uma em seu gateway próprio conforme o
manual — os swaggers do kit declaram tudo sob `/gateway/cobrancas/v1` e estão
desatualizados.

O **extrato de conta corrente** é produto contratado à parte; o caminho fica em
`SAFRA_EXTRATO_PATH` para ser apenas configurado.

### 5.4 Banco do Brasil — API Extratos v2

OAuth2 `client_credentials` com Basic em `{host}/oauth/token`, escopo
`extrato-info`; extrato em `GET /conta-corrente/agencia/{ag}/conta/{cc}`,
paginado por `numeroPaginaProximo`.

Particularidades que o código trata:

- a resposta mistura **saldos e limites** aos lançamentos, na mesma lista. Quem
  separa é `indicadorTipoLancamento`: só o tipo `1` (contabilizado) movimentou a
  conta. `SA`, `SD`, `LC`, `LU` e os demais são informativos e, se entrassem na
  grade, seriam somados como movimento;
- datas em `DDMMAAAA` **sem zeros à esquerda**; agência e conta na URL **sem
  DV** e sem zeros à esquerda;
- valores com ponto decimal, como no Itaú — conversão direta;
- `404` significa tanto conta inexistente quanto "sem lançamentos no período";
  o segundo caso não é erro;
- limites de 31 dias por consulta e 5 anos de retroatividade, validados antes de
  chamar.

O extrato exige **mTLS** nos dois ambientes (o host tem `.mtls.`), com
certificado A1 e-CNPJ cadastrado no Portal Developers. O **token não exige**,
então `_pendenciasCredencial()` e `_pendenciasCertificado()` são separados: dá
para validar as credenciais antes de o certificado ser autorizado.

### 5.5 O cache — `lib/extratoBanco.js`

`leExtratoDaConta(oConta, sDataInicio, sDataFim)` é o **único** caminho para
obter o extrato. Tela e relatório usam o mesmo, porque o item 6.2 manda imprimir
"os registros exibidos nas grades".

O que ela faz, em ordem:

1. quebra o período em dias;
2. `extrato_dia` diz quais já foram consultados;
3. os que faltam viram **faixas contíguas** de no máximo 31 dias
   (`agrupaEmFaixas`) — buscar dia a dia multiplicaria as chamadas, buscar tudo
   de uma vez estouraria o limite do BB;
4. cada faixa vai à API; o retorno é recortado pelo período, gravado, e só então
   os dias são marcados;
5. a grade sai **sempre** do MySQL, inclusive no caminho novo.

O recorte do passo 4 não é opcional, e é a diferença mais importante em relação
ao desenho anterior: o que sai da API vai ser **gravado**, e gravar movimento de
fora da faixa marcaria como coberto um dia que não foi consultado. Ambientes de
homologação devolvem datas fora do pedido — o sandbox do Bradesco responde
sempre out/2024 a jan/2025 — e é esse lixo que não pode entrar na base.

**Nunca lança por falha da instituição.** O que já está gravado continua
disponível para conciliar com a API fora do ar; o motivo volta em `sAviso`.

---

## 6. API interna (`src/app/api/`)

Todas as rotas são `dynamic = 'force-dynamic'`, respondem JSON e concentram
validação, autorização e auditoria.

| Rota | Métodos | Para que serve |
| --- | --- | --- |
| [`/api/sessao`](../src/app/api/sessao/route.js) | GET | usuário corrente, permissões e catálogos das caixas |
| [`/api/bank/providers`](../src/app/api/bank/providers/route.js) | GET | providers disponíveis + contas cadastradas |
| [`/api/bank/contas`](../src/app/api/bank/contas/route.js) | GET, POST, PUT, DELETE | catálogo de bancos; cadastro, alteração e inativação de conta |
| [`/api/bank/extrato`](../src/app/api/bank/extrato/route.js) | GET | extrato do período; consulta a API só para os dias que faltam |
| [`/api/bank/boletos`](../src/app/api/bank/boletos/route.js) | GET, POST | consulta e baixa de boleto na instituição (cobrança) |
| [`/api/conciliacao/lancamentos`](../src/app/api/conciliacao/lancamentos/route.js) | GET, POST, DELETE | extrato do sistema + saldos; novo lançamento; exclusão |
| [`/api/conciliacao/conciliar`](../src/app/api/conciliacao/conciliar/route.js) | POST | grava conciliação ou estorno |
| [`/api/conciliacao/auto-match`](../src/app/api/conciliacao/auto-match/route.js) | POST | devolve os grupos conciliáveis (não grava) |
| [`/api/conciliacao/transferencia`](../src/app/api/conciliacao/transferencia/route.js) | POST | gera as duas pernas da transferência |
| [`/api/conciliacao/bloqueio`](../src/app/api/conciliacao/bloqueio/route.js) | POST | fecha/reabre período (exige permissão) |
| [`/api/relatorios/conciliacao`](../src/app/api/relatorios/conciliacao/route.js) | GET | xlsx, csv, OFX ou HTML de impressão |
| [`/api/auditoria`](../src/app/api/auditoria/route.js) | GET | trilha filtrada por conta, ação e período |

Códigos de status usados com significado: **400** dado faltando ou inválido,
**403** sem permissão, **404** conta não localizada, **409** regra de negócio
recusou (diferença ≠ 0, período bloqueado, registro conciliado), **500** falha
nossa, **502** falha da instituição.

### 6.1 Repositórios (`src/lib/repositories/`)

Todo SQL vive aqui; nenhuma rota escreve SQL.

| Arquivo | Destaques |
| --- | --- |
| `contaRepository` | `listaContasCorrentes` calcula o saldo previsto somando os lançamentos e marca `bIntegracaoConfigurada` cruzando provider + `verificaConta`; `atualizaBloqueioConta`; `inativaConta` (lógica) |
| `lancamentoRepository` | `listaLancamentosPeriodo`, `calculaSaldoAnterior`, `insereLancamento`, `insereTransferencia` (duas pernas), `excluiLancamento`, `atualizaStatusLancamentos` |
| `movimentoRepository` | `listaMovimentosPeriodo` (a grade), `gravaMovimentos` (upsert que preserva `sta_conciliado`), `listaDiasConsultados` / `marcaDiasConsultados` (o cache), `atualizaStatusMovimentos` |
| `auditoriaRepository` | constantes `ACAO_*`, `ROTULOS_ACAO`, `registraAuditoria`, `listaAuditoria` |
| `usuarioRepository` | `nomUsuarioAtual`, `carregaUsuarioAtual`, `temPermissao`, `mensagemSemPermissao` |
| `catalogoRepository` | `listaCatalogos` |

---

## 7. Camada de tela

### 7.1 `contexts/BankContext.jsx`

Contas cadastradas, providers, conta selecionada (persistida no `localStorage`),
usuário e catálogos de `/api/sessao`. **Contas sem integração configurada são
filtradas** e não chegam à tela.

### 7.2 `hooks/useConciliacao.js`

O arquivo mais denso do projeto e o lugar certo para procurar qualquer regra da
tela. Detém todo o estado das grades e devolve um objeto agrupado em: período e
bloqueio · dados · seleção · totalizadores · filtros · ações.

Funções puras de módulo, fáceis de ler primeiro:

- `calculaPeriodoInicial` — bloqueio + 1 até hoje − 1 (item 6.1.3.2); o período
  fixo do `.env` tem precedência;
- `excedePeriodoMaximo` — trava de `MAX_DIAS_PERIODO` (60 dias);
- `chaveCorrespondencia` = `data|valor|E ou S`;
- `casaPorDataEValor` — pareamento **um-para-um** dos não conciliados, com fila
  por chave: dois lançamentos de mesmo valor não casam com o mesmo movimento.

| Ação | Regra |
| --- | --- |
| `buscaMovimentos` | recusa período acima de 60 dias; dispara as duas leituras em paralelo; falha do extrato vira alerta sem derrubar o lado do sistema |
| `concilia` / `desfazConciliacao` | exigem diferença zero e nenhum registro em período bloqueado |
| `conciliaAutomaticamente` | **descarta grupos inteiros** que toquem o período bloqueado — o grupo é indivisível: conciliar metade deixaria a outra órfã |
| `excluiRegistro` | só o lado do ERP; movimento do banco é recusado com o motivo |
| `aplicaBloqueio` / `removeBloqueio` | gravam em `conta_corrente` |

### 7.3 `services/`

- [`conciliacaoService.js`](../src/services/conciliacaoService.js) — cliente HTTP
  do navegador, com `fetch` central que padroniza o tratamento de erro;
- [`autoMatchService.js`](../src/services/autoMatchService.js) — **roda só no
  servidor**; contém a regra da conciliação automática (seção 8.4).

---

## 8. Fluxos ponta a ponta

### 8.1 Buscar (item 6.1.3.2)

`buscaMovimentos` valida o período (máx. 60 dias) e dispara em paralelo
`/api/conciliacao/lancamentos` e `/api/bank/extrato`. Ao final, os pares de
mesma data/valor/sentido já vêm selecionados.

### 8.2 Leitura do extrato

`GET /api/bank/extrato` → `leExtratoDaConta` (seção 5.5). O primeiro acesso a um
período consulta a instituição; os seguintes saem do MySQL.

### 8.3 Conciliação manual

Seleciona N de um lado e N do outro; a conciliação exige **diferença zero** entre
as somatórias. É N:N por natureza — nada limita a quantidade de cada lado.

### 8.4 Conciliação automática

`POST /api/conciliacao/auto-match` → `executaConciliacaoAutomatica`, em **quatro
passadas**, da correspondência mais forte para a mais fraca; cada registro casado
sai das seguintes:

1. **1:1 exata** — mesmo valor (em centavos), mesmo sentido, datas dentro da
   janela de `JANELA_DIAS_PADRAO` (3 dias);
2. **N:1** — vários lançamentos do ERP somam um movimento do banco;
3. **1:N** — um lançamento corresponde a vários movimentos (o espelho da 2ª);
4. **N:N** — os dois lados são conjuntos; combina os movimentos de 2 a
   `TAMANHO_MAXIMO_LADO` e, para cada soma, procura o conjunto de lançamentos
   que a fecha.

O subset-sum ([`subsetSum.js`](../src/utils/subsetSum.js)) é uma busca em
profundidade por **tamanho crescente**, em centavos inteiros, com três podas e
teto de avaliações para não travar a requisição.

A rota **não grava**: devolve os grupos. Quem grava é o hook, com
`automatica: true` — o que dispensa a verificação de diferença, já que os grupos
são equivalentes por construção.

### 8.5 Conciliar, estornar e excluir

`POST /api/conciliacao/conciliar` valida nesta ordem: corpo, conta, seleção não
vazia, diferença zero e período bloqueado. A verificação de bloqueio lê as datas
**da base**, não do corpo da requisição.

Exclusão (item 6.1.3.8): só `lancamento_sistema`, apenas com origem
`Conciliação` ou `Transferência`, nunca conciliado. Excluir uma perna de
transferência exclui **as duas**.

### 8.6 Bloqueio de período e permissões (item 6.1.3.1)

`POST /api/conciliacao/bloqueio` confere `conciliacao.bloqueio` **no servidor**
(403 quando falta) e exige data anterior à data do dia. A tela só desabilita
botão e explica o motivo — autorização é sempre da rota que grava.

### 8.7 Relatórios (item 6.2)

`formato` ∈ `xlsx | csv | pdf | ofx`, `escopo` ∈ `sistema | banco | ambos`. Os
chips de situação viajam como parâmetros, para o arquivo conter exatamente as
linhas exibidas.

O **OFX** é o formato de troca que os bancos publicam e a contabilidade importa
direto — os outros três são leitura humana. Sai em OFX 1.0.2 (SGML), que é o
suportado pelos ERPs brasileiros. Um arquivo OFX descreve **uma** conta, então
escopo `ambos` cai para o extrato do banco.

---

## 9. Decisões que parecem estranhas (e não são)

### 9.1 Dinheiro em centavos inteiros

A regra "não é permitido conciliar valores divergentes" exige igualdade exata, e
`0.1 + 0.2` em `float` não é `0.3`.

### 9.2 Datas: `DDMMAAAA` × `AAAAMMDD`

`separaComponentesData` tenta **`DDMMAAAA` primeiro** e só recai para `AAAAMMDD`
quando a primeira leitura produz data impossível — foi o que corrigiu
`"20062025"` sendo lido como `25/20/2006`.

### 9.3 Período máximo de 60 dias

Conferir mais de dois meses de uma vez não é conciliação, é relatório — e o custo
cai no gateway do banco, que impõe os próprios limites (31 dias no BB).

### 9.4 Cache de token na instância do provider

A factory devolve singleton por slug justamente para o token sobreviver entre
requisições. Cada provider renova com folga antes de expirar.

### 9.5 Erro de banco não derruba a tela

Provider fora do ar, produto não contratado ou credencial ausente viram
**aviso**. O extrato já gravado continua conciliável.

---

## 10. Variáveis de ambiente

| Grupo | Variáveis |
| --- | --- |
| Banco de dados | `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` |
| Módulo | `BANK_PROVIDER`, `USUARIO_ATUAL`, `NEXT_PUBLIC_PERIODO_INICIO`, `NEXT_PUBLIC_PERIODO_FIM` |
| Bradesco | `BRADESCO_CLIENT_ID`, `_CLIENT_SECRET`, `_APP_KEY`, `_AGENCIA`, `_CONTA`, `_CERT_PATH`, `_KEY_PATH`, `_BASE_URL`, `_API_URL` |
| Itaú | `ITAU_AMBIENTE`, `ITAU_CLIENT_ID`, `_CLIENT_SECRET`, `_API_KEY`, `_AGENCIA`, `_CONTA`, `_DAC`, `_BASE_URL`, `_SANDBOX_URL` |
| Safra | `SAFRA_API_URL`, `_CLIENT_ID`, `_USERNAME`, `_PASSWORD`, `_AGENCIA`, `_CONTA`, `_EXTRATO_PATH` |
| Banco do Brasil | `BB_AMBIENTE`, `_CLIENT_ID`, `_CLIENT_SECRET`, `_BASIC`, `_APP_KEY`, `_AGENCIA`, `_CONTA`, `_MCI_TESTE`, `_CERT_PATH`, `_KEY_PATH`, `_CA_PATH` |

Só `NEXT_PUBLIC_*` chega ao navegador. Agência e conta do `.env` são **reserva**:
a conta cadastrada na tela sempre tem precedência.

---

## 11. Scripts (`scripts/`)

| Comando | O que faz |
| --- | --- |
| `npm run db:init` | aplica `schema.sql`, reconcilia colunas e remove tabelas obsoletas |
| `npm run db:erp` | lê a API do banco e cria em `lancamento_sistema` o lançamento equivalente a cada movimento, deixando um sem contrapartida para exercitar a pendência |
| `npm run diag:bradesco` · `diag:itau` · `diag:safra` · `diag:bb` | diagnóstico ponta a ponta: configuração, token e extrato. Cada etapa reporta sem interromper as seguintes |

---

## 12. Onde mexer para…

| Tarefa | Comece por |
| --- | --- |
| **Adicionar um banco** | nova classe em `src/providers/` estendendo `BankProvider`; registre o slug em `BankProviderFactory`; acrescente a linha na tabela `banco` e as variáveis no `.env.example`; crie um `scripts/diag-<banco>.mjs` |
| **Mudar uma regra de conciliação** | `useConciliacao.js` (tela) e/ou `autoMatchService.js` (automática); a trava que grava está em `api/conciliacao/conciliar` |
| **Novo campo no lançamento** | coluna em `schema.sql` + entrada em `COLUNAS_INCREMENTAIS` do `init-db.mjs`; `insereLancamento`; rota; `ModalNovoLancamento` |
| **Nova coluna nos relatórios** | `montaBlocos` e `calculaTotais` — as quatro saídas partem dos mesmos blocos |
| **Nova ação auditada** | constante `ACAO_*` + rótulo em `auditoriaRepository`, e a chamada na rota |
| **Formatação de valor ou data** | `utils/formatters.js` (tela e relatórios) e `lib/conciliacao/valorUtils.js` (integrações) |
