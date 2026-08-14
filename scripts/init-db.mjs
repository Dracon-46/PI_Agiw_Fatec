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
      sColuna: 'cod_titulo',
      sDefinicao: 'VARCHAR(80) NULL AFTER cod_transferencia',
   },
   { sTabela: 'titulo_aberto', sColuna: 'dat_emissao', sDefinicao: 'DATE NULL AFTER cod_titulo' },
   {
      sTabela: 'titulo_aberto',
      sColuna: 'des_historico',
      sDefinicao: 'VARCHAR(500) NULL AFTER nom_emitente',
   },
   { sTabela: 'titulo_aberto', sColuna: 'num_boleto', sDefinicao: 'VARCHAR(20) NULL AFTER num_parcela' },
   { sTabela: 'titulo_aberto', sColuna: 'sta_baixado', sDefinicao: 'TINYINT(1) NOT NULL DEFAULT 0' },
   { sTabela: 'titulo_aberto', sColuna: 'dat_baixa', sDefinicao: 'DATE NULL' },
   { sTabela: 'titulo_aberto', sColuna: 'val_pago', sDefinicao: 'DECIMAL(18,2) NULL' },
   { sTabela: 'titulo_aberto', sColuna: 'val_tarifa', sDefinicao: 'DECIMAL(18,2) NOT NULL DEFAULT 0' },
   { sTabela: 'titulo_aberto', sColuna: 'cod_lancamento_baixa', sDefinicao: 'VARCHAR(80) NULL' },
];

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
      await oConn.query(sSql);
      console.log('Schema aplicado com sucesso em', sBanco);

      await oConn.query(`USE \`${sBanco}\``);
      console.log('Conferindo colunas incrementais...');
      const iCriadas = await reconciliaColunas(oConn, sBanco);
      console.log(
         iCriadas === 0 ? '  nenhuma coluna pendente.' : `  ${iCriadas} coluna(s) acrescentada(s).`
      );
   } finally {
      await oConn.end();
   }
}

main().catch((oErro) => {
   console.error('Falha ao aplicar schema:', oErro.message);
   process.exit(1);
});
