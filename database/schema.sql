-- ============================================================================
-- schema.sql - Tabelas novas da Conciliação Bancária no SQL Server
-- Projeto Banco - Ticket 37060 | Agiw Sistemas
--
-- O módulo trabalha sobre as tabelas que o ERP JÁ TEM no BDAPRESENTACAO:
--
--   TBGENE015  catálogo de bancos (compensação)
--   TBGENE016  conta corrente: agência, C.C., saldo, DATULTBLOQUEIO e as
--              credenciais de API da conta (API_CLIENTID, API_CHAVESECRETA…)
--   TBCONB001  movimento da conciliação — grade "Movimentos no Sistema"
--   TBCONB002  parâmetros e último período fechado da conciliação
--   TBCONB006  extrato bancário importado — grade "Movimentos no Banco"
--   TBGENE009  tipos de documento
--   TBFLCX002  subgrupos do fluxo de caixa
--   TBGENE023  contas contábeis
--   TBCOMP008  centros de custo
--   TBSENH006  usuários · TBSENH005  permissões por módulo
--
-- Nenhuma delas é criada ou alterada por este arquivo: são tabelas do ERP em
-- produção. Este script cria APENAS as duas que não têm equivalente, porque
-- nascem da leitura do extrato por API — o ERP importava arquivo:
--
--   TBCONB008  dias de extrato já consultados na instituição
--   TBCONB009  trilha de auditoria do módulo
--
-- Os nomes seguem o padrão TBXXXX999 da Agiw, na sequência do módulo de
-- conciliação bancária (TBCONB001 a TBCONB007 já existem), e as colunas usam
-- os prefixos do padrão de campos: COD código, DES descrição, DAT data,
-- VAL valor, NUM número, TIP tipo, STA situação, QTD quantidade.
--
-- Cada instrução é separada por GO: o script é aplicado lote por lote em
-- scripts/init-db.mjs, porque CREATE/ALTER exigem lote próprio no T-SQL.
-- O banco NÃO é criado aqui — BDAPRESENTACAO é a base do ERP e já existe.
-- ============================================================================

-- --------------------------------------------------------------------------
-- TBCONB008 - Dias de Extrato Consultados na API
--
-- Sem este registro não haveria como distinguir "dia sem movimento" de "dia
-- nunca consultado": os dois chegam da API como lista vazia, e o sistema
-- repetiria a mesma consulta para sempre.
--
-- A gravação acontece DEPOIS dos movimentos do dia: falha no meio deixa o dia
-- pendente e a próxima busca refaz a consulta, em vez de dar o dia por
-- coberto com o extrato incompleto.
--
-- A conta é identificada como em TBCONB006 — empresa, banco, agência e conta
-- corrente —, e não por um id próprio: é a mesma chave que o ERP usa.
-- --------------------------------------------------------------------------
IF OBJECT_ID('dbo.TBCONB008', 'U') IS NULL
CREATE TABLE dbo.TBCONB008 (
   CODEMP         CHAR(2)      NOT NULL,
   CODBANCO       CHAR(6)      NOT NULL,
   CODAGENCIA     CHAR(10)     NOT NULL,
   CODCTACORRENTE CHAR(15)     NOT NULL,
   -- Dia coberto pela consulta
   DATEXTRATO     DATETIME     NOT NULL,
   -- Quando a instituição foi consultada
   DATCONSULTA    DATETIME     NOT NULL CONSTRAINT DF_TBCONB008_DATCONSULTA DEFAULT GETDATE(),
   -- Quantos movimentos o dia trouxe; zero é resposta legítima
   QTDMOVTO       INT          NULL,
   -- Provider que respondeu (bradesco, itau, bb, safra)
   NOMPROVIDER    CHAR(20)     NULL,
   CONSTRAINT PKTBCONB008 PRIMARY KEY (CODEMP, CODBANCO, CODAGENCIA, CODCTACORRENTE, DATEXTRATO)
);
GO

-- --------------------------------------------------------------------------
-- TBCONB009 - Auditoria da Conciliação Bancária
--
-- Atende o item 6.5 das sugestões: registro detalhado de todas as ações
-- realizadas no módulo — quem conciliou, quem bloqueou período, quem lançou
-- ou excluiu —, necessário para compliance e auditorias financeiras.
--
-- A chave é IDENTITY, e não uma sequência em CHAR como no resto do módulo,
-- porque a trilha é gravada em concorrência: montar a sequência no cliente
-- exigiria travar a tabela a cada evento.
-- --------------------------------------------------------------------------
IF OBJECT_ID('dbo.TBCONB009', 'U') IS NULL
CREATE TABLE dbo.TBCONB009 (
   NUMSEQAUDIT    BIGINT           NOT NULL IDENTITY(1, 1),
   CODEMP         CHAR(2)          NOT NULL,
   DATEVENTO      DATETIME         NOT NULL CONSTRAINT DF_TBCONB009_DATEVENTO DEFAULT GETDATE(),
   -- Usuário responsável, no padrão do ERP (TBSENH006.USER_ID)
   USER_ID        CHAR(10)         NOT NULL,
   TIPACAO        CHAR(20)         NOT NULL,
   DESENTIDADE    CHAR(20)         NOT NULL,
   CODENTIDADE    VARCHAR(120)     NULL,
   DESDETALHE     VARCHAR(600)     NOT NULL,
   VALREFERENCIA  DECIMAL(28, 14)  NULL,
   -- Conta do evento; nula nas ações que não são de uma conta só
   CODBANCO       CHAR(6)          NULL,
   CODAGENCIA     CHAR(10)         NULL,
   CODCTACORRENTE CHAR(15)         NULL,
   CONSTRAINT PKTBCONB009 PRIMARY KEY (NUMSEQAUDIT)
);
GO

IF OBJECT_ID('dbo.TBCONB009', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes
                    WHERE name = 'INDTBCONB009_DATEVENTO'
                      AND object_id = OBJECT_ID('dbo.TBCONB009'))
CREATE INDEX INDTBCONB009_DATEVENTO ON dbo.TBCONB009 (CODEMP, DATEVENTO);
GO

IF OBJECT_ID('dbo.TBCONB009', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes
                    WHERE name = 'INDTBCONB009_TIPACAO'
                      AND object_id = OBJECT_ID('dbo.TBCONB009'))
CREATE INDEX INDTBCONB009_TIPACAO ON dbo.TBCONB009 (TIPACAO, DATEVENTO);
GO
