-- ============================================================================
-- schema.sql - Banco MySQL da Conciliação Bancária
-- Projeto Banco - Ticket 37060 | Agiw Sistemas
--
-- Contém apenas estrutura + catálogo de bancos (TBGENE015).
-- Contas, lançamentos e movimentos NÃO são pré-populados com dados falsos:
-- contas vêm do cadastro; extrato vem da API do banco; lançamentos do Satis.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS conciliacao_agiw
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE conciliacao_agiw;

-- --------------------------------------------------------------------------
-- Catálogo de bancos (compensação)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS banco (
  cod_banco       CHAR(3)       NOT NULL,
  nom_banco       VARCHAR(120)  NOT NULL,
  slug_provider   VARCHAR(40)   NOT NULL,
  cor_banco       VARCHAR(20)   NOT NULL DEFAULT '#3b82f6',
  cor_texto       VARCHAR(20)   NOT NULL DEFAULT '#ffffff',
  -- Logotipo exibido no cartão da conta (item 6.1.1). No Satis a origem é
  -- "/pesqgen?nompesquisa=LOGO_BANCO"; aqui aponta para o arquivo local
  -- servido em /public. Vazio faz a tela cair no selo com o código.
  url_logo        VARCHAR(300)  NULL,
  PRIMARY KEY (cod_banco),
  UNIQUE KEY uk_banco_slug (slug_provider)
) ENGINE=InnoDB;

INSERT INTO banco (cod_banco, nom_banco, slug_provider, cor_banco, cor_texto, url_logo) VALUES
  ('001', 'Banco do Brasil', 'bb',       '#f7d117', '#0033a0', '/bancos/bb.svg'),
  ('341', 'Banco Itaú',      'itau',     '#ec7000', '#ffffff', '/bancos/itau.svg'),
  ('237', 'Banco Bradesco',  'bradesco', '#cc092f', '#ffffff', '/bancos/bradesco.svg'),
  ('422', 'Banco Safra',     'safra',    '#0a3b7c', '#ffffff', '/bancos/safra.svg')
ON DUPLICATE KEY UPDATE
  nom_banco = VALUES(nom_banco),
  slug_provider = VALUES(slug_provider),
  cor_banco = VALUES(cor_banco),
  cor_texto = VALUES(cor_texto),
  url_logo = VALUES(url_logo);

-- --------------------------------------------------------------------------
-- Catálogos do lançamento bancário (item 6.1.3.8 — ação 1).
-- No Satis correspondem a TBGENE023 (contas contábeis), TBFLCX002 (subgrupos)
-- e TBCOMP008 (centros de custo). Ficam no banco, e não no código, porque a
-- caixa "Novo Lançamento" precisa oferecê-los ao usuário.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tipo_documento (
  cod_tipo_documento VARCHAR(10)   NOT NULL,
  des_tipo_documento VARCHAR(120)  NOT NULL,
  num_ordem          INT           NOT NULL DEFAULT 0,
  b_ativo            TINYINT(1)    NOT NULL DEFAULT 1,
  PRIMARY KEY (cod_tipo_documento)
) ENGINE=InnoDB;

INSERT INTO tipo_documento (cod_tipo_documento, des_tipo_documento, num_ordem) VALUES
  ('MC', 'Movimentos na Conciliação',   1),
  ('NF', 'Nota Fiscal',                 2),
  ('TR', 'Transferência entre Contas',  3),
  ('TB', 'Tarifa Bancária',             4),
  ('BL', 'Boleto',                      5),
  ('PX', 'PIX',                         6),
  ('TE', 'TED / DOC',                   7)
ON DUPLICATE KEY UPDATE
  des_tipo_documento = VALUES(des_tipo_documento),
  num_ordem = VALUES(num_ordem);

CREATE TABLE IF NOT EXISTS subgrupo_fluxo (
  cod_subgrupo VARCHAR(20)   NOT NULL,
  des_subgrupo VARCHAR(160)  NOT NULL,
  cod_grupo    VARCHAR(20)   NULL COMMENT 'TBFLCX001 - grupo do fluxo de caixa',
  b_ativo      TINYINT(1)    NOT NULL DEFAULT 1,
  PRIMARY KEY (cod_subgrupo)
) ENGINE=InnoDB;

INSERT INTO subgrupo_fluxo (cod_subgrupo, des_subgrupo, cod_grupo) VALUES
  ('18007',  'Conta Aplicação',          '18000'),
  ('100000', 'Despesas Operacionais',    '100000'),
  ('200000', 'Receitas Operacionais',    '200000'),
  ('300000', 'Tarifas Bancárias',        '100000'),
  ('400000', 'Transferências entre Contas', '400000')
ON DUPLICATE KEY UPDATE
  des_subgrupo = VALUES(des_subgrupo),
  cod_grupo = VALUES(cod_grupo);

CREATE TABLE IF NOT EXISTS conta_contabil (
  cod_conta_contabil VARCHAR(20)   NOT NULL,
  des_conta_contabil VARCHAR(160)  NOT NULL,
  b_ativo            TINYINT(1)    NOT NULL DEFAULT 1,
  PRIMARY KEY (cod_conta_contabil)
) ENGINE=InnoDB;

INSERT INTO conta_contabil (cod_conta_contabil, des_conta_contabil) VALUES
  ('1110301', 'Bancos Conta Movimento'),
  ('1110308', 'Conta Aplicação'),
  ('4110201', 'Despesas Financeiras'),
  ('3110101', 'Receitas Operacionais')
ON DUPLICATE KEY UPDATE des_conta_contabil = VALUES(des_conta_contabil);

CREATE TABLE IF NOT EXISTS centro_custo (
  cod_centro_custo VARCHAR(20)   NOT NULL,
  des_centro_custo VARCHAR(160)  NOT NULL,
  b_ativo          TINYINT(1)    NOT NULL DEFAULT 1,
  PRIMARY KEY (cod_centro_custo)
) ENGINE=InnoDB;

INSERT INTO centro_custo (cod_centro_custo, des_centro_custo) VALUES
  ('1100', 'ADMINISTRATIVO'),
  ('1200', 'COMERCIAL'),
  ('1300', 'OPERAÇÕES')
ON DUPLICATE KEY UPDATE des_centro_custo = VALUES(des_centro_custo);

-- --------------------------------------------------------------------------
-- Usuários e permissões de acesso.
-- O item 6.1.3.1 pede "verificar permissão de acesso" para os botões de
-- bloquear e desbloquear o período. A conferência é feita no servidor; a tela
-- apenas reflete o que o servidor autoriza.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuario (
  nom_usuario  VARCHAR(80)   NOT NULL,
  des_nome     VARCHAR(160)  NOT NULL,
  des_empresa  VARCHAR(160)  NOT NULL DEFAULT 'AGIW SISTEMAS LTDA — Matriz',
  b_ativo      TINYINT(1)    NOT NULL DEFAULT 1,
  PRIMARY KEY (nom_usuario)
) ENGINE=InnoDB;

INSERT INTO usuario (nom_usuario, des_nome, des_empresa) VALUES
  ('INFTEC', 'Informática Técnica', 'AGIW SISTEMAS LTDA — Matriz'),
  ('OPERADOR', 'Operador Financeiro', 'AGIW SISTEMAS LTDA — Matriz')
ON DUPLICATE KEY UPDATE des_nome = VALUES(des_nome);

CREATE TABLE IF NOT EXISTS usuario_permissao (
  nom_usuario   VARCHAR(80)  NOT NULL,
  cod_permissao VARCHAR(60)  NOT NULL,
  PRIMARY KEY (nom_usuario, cod_permissao),
  CONSTRAINT fk_perm_usuario FOREIGN KEY (nom_usuario) REFERENCES usuario (nom_usuario) ON DELETE CASCADE
) ENGINE=InnoDB;

-- INFTEC administra o módulo; OPERADOR concilia mas não fecha o período.
INSERT INTO usuario_permissao (nom_usuario, cod_permissao) VALUES
  ('INFTEC',   'conciliacao.bloqueio'),
  ('INFTEC',   'conciliacao.conciliar'),
  ('INFTEC',   'conciliacao.lancamento'),
  ('OPERADOR', 'conciliacao.conciliar'),
  ('OPERADOR', 'conciliacao.lancamento')
ON DUPLICATE KEY UPDATE cod_permissao = VALUES(cod_permissao);

-- --------------------------------------------------------------------------
-- Contas correntes cadastradas (agência / C.C.)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conta_corrente (
  id_conta            INT            NOT NULL AUTO_INCREMENT,
  cod_conta           VARCHAR(80)    NOT NULL COMMENT 'Chave lógica slug-agencia-conta',
  cod_banco           CHAR(3)        NOT NULL,
  cod_agencia         VARCHAR(10)    NOT NULL,
  num_conta_corrente  VARCHAR(20)    NOT NULL,
  tip_conta           ENUM('cc','cp') NOT NULL DEFAULT 'cc',
  des_agencia         VARCHAR(160)   NULL,
  val_saldo_sistema   DECIMAL(18,2)  NOT NULL DEFAULT 0,
  dat_ultimo_bloqueio DATE           NULL,
  b_ativo             TINYINT(1)     NOT NULL DEFAULT 1,
  dat_cadastro        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dat_atualizacao     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_conta),
  UNIQUE KEY uk_conta_cod (cod_conta),
  UNIQUE KEY uk_conta_banco_ag_cc (cod_banco, cod_agencia, num_conta_corrente, tip_conta),
  CONSTRAINT fk_conta_banco FOREIGN KEY (cod_banco) REFERENCES banco (cod_banco)
) ENGINE=InnoDB;

-- --------------------------------------------------------------------------
-- Credenciais por conta (opcional). Segredos globais ficam no .env do servidor.
-- Nunca exponha esta tabela via API pública.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conta_credencial (
  id_conta       INT           NOT NULL,
  client_id      VARCHAR(255)  NULL,
  client_secret  VARCHAR(255)  NULL,
  app_key        VARCHAR(255)  NULL,
  cert_path      VARCHAR(500)  NULL,
  key_path       VARCHAR(500)  NULL,
  base_url       VARCHAR(500)  NULL,
  api_url        VARCHAR(500)  NULL,
  dat_atualizacao DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_conta),
  CONSTRAINT fk_cred_conta FOREIGN KEY (id_conta) REFERENCES conta_corrente (id_conta) ON DELETE CASCADE
) ENGINE=InnoDB;

-- --------------------------------------------------------------------------
-- Lançamentos do sistema (Satis / ERP) — preenchidos pela integração real
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lancamento_sistema (
  id_lancamento    BIGINT         NOT NULL AUTO_INCREMENT,
  id_conta         INT            NOT NULL,
  cod_lancamento   VARCHAR(80)    NOT NULL,
  dat_movimento    DATE           NOT NULL,
  dat_compensacao  DATE           NULL,
  num_documento    VARCHAR(40)    NULL,
  des_historico    VARCHAR(500)   NOT NULL,
  val_movimento    DECIMAL(18,2)  NOT NULL,
  b_entrada        TINYINT(1)     NOT NULL,
  tip_origem       VARCHAR(60)    NOT NULL DEFAULT 'Conciliação',
  -- Campos da caixa "Novo Lançamento" (item 6.1.3.8 — ação 1)
  tip_documento      VARCHAR(10)  NULL,
  cod_subgrupo       VARCHAR(20)  NULL,
  cod_conta_contabil VARCHAR(20)  NULL,
  sta_conciliado   TINYINT(1)     NOT NULL DEFAULT 0,
  -- Identificador comum às duas pernas de uma transferência entre contas
  -- (item 6.1.3.8 — ação 2): o débito e o crédito compartilham o mesmo código.
  cod_transferencia VARCHAR(80)   NULL,
  -- Título que originou o lançamento na baixa (item 6.1.3.8 — ação 3)
  cod_titulo       VARCHAR(80)    NULL,
  dat_importacao   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_lancamento),
  UNIQUE KEY uk_lanc_cod (id_conta, cod_lancamento),
  KEY ix_lanc_periodo (id_conta, dat_movimento),
  KEY ix_lanc_transferencia (cod_transferencia),
  CONSTRAINT fk_lanc_conta FOREIGN KEY (id_conta) REFERENCES conta_corrente (id_conta) ON DELETE CASCADE
) ENGINE=InnoDB;

-- --------------------------------------------------------------------------
-- Movimentos do extrato bancário.
--
-- A tabela tem dois papéis, distinguidos por tip_origem:
--
--   'API'     — o extrato NÃO é copiado. A grade "Movimentos no Banco" exibe
--               sempre o que a instituição devolve na consulta; aqui fica só
--               o que a API não sabe responder: se o movimento foi conciliado
--               e se o usuário o removeu da grade (item 6.1.3.8 — ação 4).
--               Histórico e documento ficam nulos, porque vêm da API.
--
--   'ARQUIVO' — importação de OFX/CSV/TXT (item 6.1.3.3). Aqui o registro é
--               guardado por inteiro: o arquivo é a única fonte, não há a que
--               voltar para reler o histórico.
--
-- A chave é o cod_movimento determinístico (data + documento + sentido +
-- valor): a mesma linha do extrato produz sempre o mesmo código, então o
-- estado reencontra o movimento a cada consulta.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS movimento_banco (
  id_movimento     BIGINT         NOT NULL AUTO_INCREMENT,
  id_conta         INT            NOT NULL,
  cod_movimento    VARCHAR(120)   NOT NULL,
  tip_origem       ENUM('API','ARQUIVO') NOT NULL DEFAULT 'API',
  dat_movimento    DATE           NOT NULL,
  val_movimento    DECIMAL(18,2)  NOT NULL,
  b_entrada        TINYINT(1)     NOT NULL,
  -- Preenchidos só na origem ARQUIVO; na origem API vêm da instituição
  des_historico    VARCHAR(500)   NULL,
  num_documento    VARCHAR(40)    NULL,
  sta_conciliado   TINYINT(1)     NOT NULL DEFAULT 0,
  -- Exclusão lógica: apagar a linha faria o movimento reaparecer na próxima
  -- leitura da API, porque o extrato da instituição continua o mesmo.
  b_excluido       TINYINT(1)     NOT NULL DEFAULT 0,
  dat_atualizacao  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_movimento),
  UNIQUE KEY uk_mov_cod (id_conta, cod_movimento),
  KEY ix_mov_periodo (id_conta, dat_movimento),
  KEY ix_mov_origem (id_conta, tip_origem),
  CONSTRAINT fk_mov_conta FOREIGN KEY (id_conta) REFERENCES conta_corrente (id_conta) ON DELETE CASCADE
) ENGINE=InnoDB;

-- --------------------------------------------------------------------------
-- Títulos em aberto (associação / baixa) — estrutura para Satis
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS titulo_aberto (
  id_titulo      BIGINT         NOT NULL AUTO_INCREMENT,
  id_conta       INT            NULL,
  cod_titulo     VARCHAR(80)    NOT NULL,
  dat_emissao    DATE           NULL,
  dat_vencimento DATE           NOT NULL,
  nom_emitente   VARCHAR(160)   NOT NULL,
  des_historico  VARCHAR(500)   NULL,
  val_titulo     DECIMAL(18,2)  NOT NULL,
  val_multa      DECIMAL(18,2)  NOT NULL DEFAULT 0,
  val_juros      DECIMAL(18,2)  NOT NULL DEFAULT 0,
  val_desconto   DECIMAL(18,2)  NOT NULL DEFAULT 0,
  tip_documento  VARCHAR(20)    NULL,
  num_documento  VARCHAR(40)    NULL,
  num_parcela    VARCHAR(10)    NULL,
  -- Nosso número do boleto na instituição. É a chave das rotas de cobrança
  -- (consulta e baixa); sem ela o título só pode ser baixado localmente.
  num_boleto     VARCHAR(20)    NULL,
  tip_movimento  ENUM('Entrada','Saída') NOT NULL,
  tip_origem     VARCHAR(60)    NOT NULL,
  -- Situação da baixa (item 6.1.3.8 — ação 3). Um título baixado sai da
  -- relação de títulos em aberto e passa a ter lançamento no extrato Satis.
  sta_baixado    TINYINT(1)     NOT NULL DEFAULT 0,
  dat_baixa      DATE           NULL,
  val_pago       DECIMAL(18,2)  NULL,
  val_tarifa     DECIMAL(18,2)  NOT NULL DEFAULT 0,
  cod_lancamento_baixa VARCHAR(80) NULL,
  PRIMARY KEY (id_titulo),
  UNIQUE KEY uk_titulo_cod (cod_titulo),
  KEY ix_titulo_aberto (id_conta, sta_baixado, dat_vencimento),
  CONSTRAINT fk_titulo_conta FOREIGN KEY (id_conta) REFERENCES conta_corrente (id_conta) ON DELETE SET NULL
) ENGINE=InnoDB;

-- --------------------------------------------------------------------------
-- Auditoria de ações (item 6.5 das sugestões do documento da equipe)
-- Registra quem conciliou, quem bloqueou período, quem lançou ou excluiu.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auditoria (
  id_auditoria   BIGINT        NOT NULL AUTO_INCREMENT,
  id_conta       INT           NULL,
  dat_evento     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  nom_usuario    VARCHAR(80)   NOT NULL DEFAULT 'INFTEC',
  tip_acao       VARCHAR(40)   NOT NULL,
  des_entidade   VARCHAR(40)   NOT NULL,
  cod_entidade   VARCHAR(120)  NULL,
  des_detalhe    VARCHAR(600)  NOT NULL,
  val_referencia DECIMAL(18,2) NULL,
  PRIMARY KEY (id_auditoria),
  KEY ix_auditoria_conta (id_conta, dat_evento),
  KEY ix_auditoria_acao (tip_acao, dat_evento),
  CONSTRAINT fk_auditoria_conta FOREIGN KEY (id_conta) REFERENCES conta_corrente (id_conta) ON DELETE SET NULL
) ENGINE=InnoDB;

-- --------------------------------------------------------------------------
-- Arquivos de extrato enviados pelo usuário (OFX, CSV, TXT)
-- Guarda o rastro da importação por arquivo (item 6.1.3.3).
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS arquivo_importado (
  id_arquivo     BIGINT        NOT NULL AUTO_INCREMENT,
  id_conta       INT           NOT NULL,
  nom_arquivo    VARCHAR(260)  NOT NULL,
  tip_formato    VARCHAR(10)   NOT NULL,
  num_bytes      BIGINT        NOT NULL DEFAULT 0,
  qtd_lidos      INT           NOT NULL DEFAULT 0,
  qtd_importados INT           NOT NULL DEFAULT 0,
  qtd_ignorados  INT           NOT NULL DEFAULT 0,
  dat_importacao DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  nom_usuario    VARCHAR(80)   NOT NULL DEFAULT 'INFTEC',
  PRIMARY KEY (id_arquivo),
  KEY ix_arquivo_conta (id_conta, dat_importacao),
  CONSTRAINT fk_arquivo_conta FOREIGN KEY (id_conta) REFERENCES conta_corrente (id_conta) ON DELETE CASCADE
) ENGINE=InnoDB;
