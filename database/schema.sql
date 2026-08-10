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
  PRIMARY KEY (cod_banco),
  UNIQUE KEY uk_banco_slug (slug_provider)
) ENGINE=InnoDB;

INSERT INTO banco (cod_banco, nom_banco, slug_provider, cor_banco, cor_texto) VALUES
  ('001', 'Banco do Brasil', 'bb',       '#f7d117', '#0033a0'),
  ('341', 'Banco Itaú',      'itau',     '#ec7000', '#ffffff'),
  ('237', 'Banco Bradesco',  'bradesco', '#cc092f', '#ffffff'),
  ('422', 'Banco Safra',     'safra',    '#0a3b7c', '#ffffff')
ON DUPLICATE KEY UPDATE
  nom_banco = VALUES(nom_banco),
  slug_provider = VALUES(slug_provider),
  cor_banco = VALUES(cor_banco),
  cor_texto = VALUES(cor_texto);

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
  sta_conciliado   TINYINT(1)     NOT NULL DEFAULT 0,
  dat_importacao   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_lancamento),
  UNIQUE KEY uk_lanc_cod (id_conta, cod_lancamento),
  KEY ix_lanc_periodo (id_conta, dat_movimento),
  CONSTRAINT fk_lanc_conta FOREIGN KEY (id_conta) REFERENCES conta_corrente (id_conta) ON DELETE CASCADE
) ENGINE=InnoDB;

-- --------------------------------------------------------------------------
-- Movimentos do extrato bancário (importados da API do banco)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS movimento_banco (
  id_movimento     BIGINT         NOT NULL AUTO_INCREMENT,
  id_conta         INT            NOT NULL,
  cod_movimento    VARCHAR(120)   NOT NULL,
  dat_movimento    DATE           NOT NULL,
  des_historico    VARCHAR(500)   NOT NULL,
  num_documento    VARCHAR(40)    NULL,
  val_movimento    DECIMAL(18,2)  NOT NULL,
  b_entrada        TINYINT(1)     NOT NULL,
  sta_conciliado   TINYINT(1)     NOT NULL DEFAULT 0,
  cod_lancamento_banco VARCHAR(40) NULL,
  dat_importacao   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_movimento),
  UNIQUE KEY uk_mov_cod (id_conta, cod_movimento),
  KEY ix_mov_periodo (id_conta, dat_movimento),
  CONSTRAINT fk_mov_conta FOREIGN KEY (id_conta) REFERENCES conta_corrente (id_conta) ON DELETE CASCADE
) ENGINE=InnoDB;

-- --------------------------------------------------------------------------
-- Títulos em aberto (associação / baixa) — estrutura para Satis
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS titulo_aberto (
  id_titulo      BIGINT         NOT NULL AUTO_INCREMENT,
  id_conta       INT            NULL,
  cod_titulo     VARCHAR(80)    NOT NULL,
  dat_vencimento DATE           NOT NULL,
  nom_emitente   VARCHAR(160)   NOT NULL,
  val_titulo     DECIMAL(18,2)  NOT NULL,
  val_multa      DECIMAL(18,2)  NOT NULL DEFAULT 0,
  val_juros      DECIMAL(18,2)  NOT NULL DEFAULT 0,
  val_desconto   DECIMAL(18,2)  NOT NULL DEFAULT 0,
  tip_documento  VARCHAR(20)    NULL,
  num_documento  VARCHAR(40)    NULL,
  num_parcela    VARCHAR(10)    NULL,
  tip_movimento  ENUM('Entrada','Saída') NOT NULL,
  tip_origem     VARCHAR(60)    NOT NULL,
  PRIMARY KEY (id_titulo),
  UNIQUE KEY uk_titulo_cod (cod_titulo),
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
