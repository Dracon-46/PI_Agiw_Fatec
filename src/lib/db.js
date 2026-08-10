// ============================================================================
// db.js - Pool de conexão MySQL
// Projeto Banco - Ticket 37060 | Agiw Sistemas
// ============================================================================

import mysql from 'mysql2/promise';
import { separaComponentesData } from './conciliacao/valorUtils.js';

/** @type {import('mysql2/promise').Pool | null} */
let oPool = null;

/**
 * Obtém (ou cria) o pool de conexões MySQL.
 * @returns {import('mysql2/promise').Pool}
 */
export function getPool() {
   if (oPool) {
      return oPool;
   }

   oPool = mysql.createPool({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'conciliacao_agiw',
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
      dateStrings: true,
      timezone: 'Z',
   });

   return oPool;
} // getPool

/**
 * Executa uma consulta com parâmetros nomeados ou posicionais.
 * @param {string} sSql
 * @param {object|Array} [oParams]
 * @returns {Promise<any>}
 */
export async function query(sSql, oParams) {
   const [aRows] = await getPool().execute(sSql, oParams);
   return aRows;
} // query

/**
 * Converte DATE MySQL (AAAA-MM-DD) para DD/MM/AAAA.
 * @param {string|null} sData
 * @returns {string}
 */
export function dataMysqlParaBr(sData) {
   if (!sData) {
      return '';
   }
   const s = String(sData).slice(0, 10);
   const [sAno, sMes, sDia] = s.split('-');
   if (!sAno || !sMes || !sDia) {
      return '';
   }
   return `${sDia}/${sMes}/${sAno}`;
} // dataMysqlParaBr

/**
 * Converte DD/MM/AAAA para DATE MySQL (AAAA-MM-DD).
 * Reaproveita a interpretação de datas usada na integração bancária, que
 * resolve a ambiguidade entre DDMMAAAA e AAAAMMDD.
 * @param {string} sDataBr
 * @returns {string|null} null quando a data não é interpretável
 */
export function dataBrParaMysql(sDataBr) {
   const oPartes = separaComponentesData(sDataBr);
   if (!oPartes) {
      return null;
   }
   return `${oPartes.sAno}-${oPartes.sMes}-${oPartes.sDia}`;
} // dataBrParaMysql
