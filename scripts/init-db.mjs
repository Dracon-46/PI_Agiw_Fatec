// ============================================================================
// init-db.mjs - Aplica database/schema.sql no MySQL/MariaDB
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// O schema usa CREATE TABLE IF NOT EXISTS, que não altera tabelas já criadas.
// Por isso, depois de aplicá-lo, o script reconcilia as colunas acrescentadas
// em versões posteriores — mantendo bases antigas em dia sem perder dados e
// sem depender de "ADD COLUMN IF NOT EXISTS", que não existe no MySQL.
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sSqlPath = path.join(__dirname, '..', 'database', 'schema.sql');

/**
 * Colunas introduzidas após a primeira versão do schema.
 * Cada entrada descreve a tabela, a coluna e sua definição completa.
 */
const COLUNAS_INCREMENTAIS = [
   {
      sTabela: 'lancamento_sistema',
      sColuna: 'cod_transferencia',
      sDefinicao: 'VARCHAR(80) NULL AFTER sta_conciliado',
   },
   {
      sTabela: 'lancamento_sistema',
      sColuna: 'tip_documento',
      sDefinicao: 'VARCHAR(10) NULL AFTER tip_origem',
   },
   {
      sTabela: 'lancamento_sistema',
      sColuna: 'cod_subgrupo',
      sDefinicao: 'VARCHAR(20) NULL AFTER tip_documento',
   },
   {
      sTabela: 'lancamento_sistema',
      sColuna: 'cod_conta_contabil',
      sDefinicao: 'VARCHAR(20) NULL AFTER cod_subgrupo',
   },
   { sTabela: 'banco', sColuna: 'url_logo', sDefinicao: 'VARCHAR(300) NULL AFTER cor_texto' },
   {
      sTabela: 'movimento_banco',
      sColuna: 'cod_lancamento_banco',
      sDefinicao: 'VARCHAR(40) NULL AFTER num_documento',
   },
   {
      sTabela: 'movimento_banco',
      sColuna: 'des_historico',
      sDefinicao: 'VARCHAR(500) NULL AFTER b_entrada',
   },
   {
      sTabela: 'movimento_banco',
      sColuna: 'num_documento',
      sDefinicao: 'VARCHAR(40) NULL AFTER des_historico',
   },
];

/**
 * Colunas que deixaram de existir.
 *
 * O extrato do banco passou a ser gravado por inteiro, então movimento_banco
 * não distingue mais origem (tip_origem) nem esconde linha (b_excluido) — o
 * item 6.1.3.8 só permite excluir registro do ERP. E a baixa de título saiu do
 * módulo, levando junto cod_titulo.
 */
const COLUNAS_REMOVIDAS = [
   { sTabela: 'movimento_banco', sColuna: 'tip_origem' },
   { sTabela: 'movimento_banco', sColuna: 'b_excluido' },
   { sTabela: 'movimento_banco', sColuna: 'dat_importacao' },
   { sTabela: 'lancamento_sistema', sColuna: 'cod_titulo' },
];

/**
 * Tabelas que saíram do modelo.
 *
 * titulo_aberto sustentava a ação "Baixar Título", removida do módulo;
 * arquivo_importado guardava o rastro da importação por arquivo, também
 * removida. O DROP apaga os dados dessas tabelas em definitivo.
 */
const TABELAS_REMOVIDAS = ['titulo_aberto', 'arquivo_importado'];

/**
 * Remove as tabelas que não fazem mais parte do modelo.
 * @param {import('mysql2/promise').Connection} oConn
 * @param {string} sBanco Nome do schema
 * @returns {Promise<number>} Quantidade de tabelas removidas
 */
async function removeTabelasObsoletas(oConn, sBanco) {
   let iRemovidas = 0;

   for (const sTabela of TABELAS_REMOVIDAS) {
      const [aLinhas] = await oConn.query(
         `SELECT COUNT(*) AS total
            FROM information_schema.tables
           WHERE table_schema = ? AND table_name = ?`,
         [sBanco, sTabela]
      );

      if (Number(aLinhas[0]?.total ?? 0) === 0) {
         continue;
      }

      await oConn.query(`DROP TABLE \`${sTabela}\``);
      console.log(`  - tabela ${sTabela} removida`);
      iRemovidas += 1;
   }

   return iRemovidas;
} // removeTabelasObsoletas

/**
 * Marca como consultados os dias que já têm movimento gravado.
 *
 * extrato_dia nasceu depois de movimento_banco. Sem esta carga, uma base que
 * já tinha extrato ficaria com a tabela vazia e o sistema tentaria buscar na
 * instituição períodos que ele já possui — repetindo a chamada a cada abertura
 * de tela, e falhando em ambientes de homologação, que só respondem para
 * janelas específicas.
 *
 * A afirmação é segura no sentido usado: dia com movimento gravado é,
 * necessariamente, dia que já foi consultado. O contrário não vale — dia sem
 * movimento pode não ter sido consultado nunca —, então nada é inferido para
 * os dias vazios.
 *
 * @param {import('mysql2/promise').Connection} oConn
 * @returns {Promise<number>} Quantidade de dias marcados
 */
async function preencheDiasConsultados(oConn) {
   const [oResultado] = await oConn.query(
      `INSERT IGNORE INTO extrato_dia (id_conta, dat_dia)
       SELECT DISTINCT id_conta, dat_movimento
         FROM movimento_banco`
   );

   return oResultado.affectedRows ?? 0;
} // preencheDiasConsultados

/**
 * Remove as colunas que não fazem mais parte do modelo.
 * @param {import('mysql2/promise').Connection} oConn
 * @param {string} sBanco Nome do schema
 * @returns {Promise<number>} Quantidade de colunas removidas
 */
async function removeColunasObsoletas(oConn, sBanco) {
   let iRemovidas = 0;

   for (const oColuna of COLUNAS_REMOVIDAS) {
      const [aLinhas] = await oConn.query(
         `SELECT COUNT(*) AS total
            FROM information_schema.columns
           WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
         [sBanco, oColuna.sTabela, oColuna.sColuna]
      );

      if (Number(aLinhas[0]?.total ?? 0) === 0) {
         continue;
      }

      await oConn.query(
         `ALTER TABLE \`${oColuna.sTabela}\` DROP COLUMN \`${oColuna.sColuna}\``
      );
      console.log(`  - ${oColuna.sTabela}.${oColuna.sColuna}`);
      iRemovidas += 1;
   }

   return iRemovidas;
} // removeColunasObsoletas

/**
 * Acrescenta as colunas que ainda não existem na base.
 * @param {import('mysql2/promise').Connection} oConn
 * @param {string} sBanco Nome do schema
 * @returns {Promise<number>} Quantidade de colunas criadas
 */
async function reconciliaColunas(oConn, sBanco) {
   let iCriadas = 0;

   for (const oColuna of COLUNAS_INCREMENTAIS) {
      const [aLinhas] = await oConn.query(
         `SELECT COUNT(*) AS total
            FROM information_schema.columns
           WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
         [sBanco, oColuna.sTabela, oColuna.sColuna]
      );

      if (Number(aLinhas[0]?.total ?? 0) > 0) {
         continue;
      }

      await oConn.query(
         `ALTER TABLE \`${oColuna.sTabela}\` ADD COLUMN \`${oColuna.sColuna}\` ${oColuna.sDefinicao}`
      );
      console.log(`  + ${oColuna.sTabela}.${oColuna.sColuna}`);
      iCriadas += 1;
   }

   return iCriadas;
} // reconciliaColunas

async function main() {
   const sBanco = process.env.MYSQL_DATABASE || 'conciliacao_agiw';
   const sSql = fs.readFileSync(sSqlPath, 'utf8');

   const oConn = await mysql.createConnection({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      multipleStatements: true,
   });

   try {
      // As colunas novas entram ANTES do schema: o schema.sql traz INSERTs que
      // já citam essas colunas, e em uma base antiga o CREATE TABLE IF NOT
      // EXISTS não as acrescenta — o INSERT falharia com "Unknown column".
      // Em base nova as tabelas ainda não existem e a reconciliação não faz
      // nada, porque consulta o information_schema antes de alterar.
      await oConn.query(`CREATE DATABASE IF NOT EXISTS \`${sBanco}\``);
      await oConn.query(`USE \`${sBanco}\``);
      console.log('Conferindo colunas de bases existentes...');
      const iPreCriadas = await reconciliaColunas(oConn, sBanco);

      await oConn.query(sSql);
      console.log('Schema aplicado com sucesso em', sBanco);

      await oConn.query(`USE \`${sBanco}\``);
      console.log('Conferindo colunas incrementais...');
      const iCriadas = iPreCriadas + (await reconciliaColunas(oConn, sBanco));
      const iRemovidas = await removeColunasObsoletas(oConn, sBanco);
      console.log(
         iCriadas === 0 && iRemovidas === 0
            ? '  nenhuma coluna pendente.'
            : `  ${iCriadas} coluna(s) acrescentada(s), ${iRemovidas} removida(s).`
      );

      console.log('Conferindo tabelas obsoletas...');
      const iTabelas = await removeTabelasObsoletas(oConn, sBanco);
      console.log(iTabelas === 0 ? '  nenhuma tabela pendente.' : `  ${iTabelas} tabela(s) removida(s).`);

      console.log('Marcando dias já cobertos pelo extrato gravado...');
      const iDias = await preencheDiasConsultados(oConn);
      console.log(iDias === 0 ? '  nada a marcar.' : `  ${iDias} dia(s) marcado(s) como consultado(s).`);
   } finally {
      await oConn.end();
   }
}

main().catch((oErro) => {
   console.error('Falha ao aplicar schema:', oErro.message);
   process.exit(1);
});
