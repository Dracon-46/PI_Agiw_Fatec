// scripts/init-db.js - Aplica database/schema.sql no MySQL/MariaDB
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sSqlPath = path.join(__dirname, '..', 'database', 'schema.sql');

async function main() {
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
      console.log('Schema aplicado com sucesso em', process.env.MYSQL_DATABASE || 'conciliacao_agiw');
   } finally {
      await oConn.end();
   }
}

main().catch((oErro) => {
   console.error('Falha ao aplicar schema:', oErro.message);
   process.exit(1);
});
