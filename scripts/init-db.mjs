// ============================================================================
// init-db.mjs - Cria as tabelas novas do módulo no SQL Server
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// O módulo trabalha sobre as tabelas que o ERP JÁ TEM no BDAPRESENTACAO —
// TBGENE015, TBGENE016, TBCONB001, TBCONB002, TBCONB006 e os catálogos. Nada
// disso é criado ou alterado por aqui: são tabelas do ERP em produção.
//
// Este script aplica database/schema.sql, que cria APENAS as duas tabelas sem
// equivalente no ERP, porque nascem da leitura do extrato por API (o ERP
// importava arquivo):
//
//   TBCONB008  dias de extrato já consultados na instituição
//   TBCONB009  trilha de auditoria do módulo
//
// O schema só cria o que falta, então rodar duas vezes não faz efeito.
//
// NUNCA use `prisma db push` nem `prisma migrate` no lugar deste script: o
// prisma/schema.prisma descreve 21 tabelas de um banco com ~1300, e o Prisma
// trataria as outras como sobra a ser removida.
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const { prisma, fechaConexao } = await import('../src/lib/db.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sSqlPath = path.join(__dirname, '..', 'database', 'schema.sql');

/** Tabelas que o script cria, na ordem em que aparecem no schema */
const TABELAS_DO_MODULO = ['TBCONB008', 'TBCONB009'];

/**
 * Tabelas do ERP que o módulo precisa encontrar prontas.
 *
 * A conferência é o primeiro passo: apontar o .env para um banco que não é o
 * do ERP produziria erro só na primeira tela, e com mensagem obscura.
 */
const TABELAS_DO_ERP = [
   'TBGENE015',
   'TBGENE016',
   'TBGENE009',
   'TBGENE023',
   'TBCOMP008',
   'TBFLCX002',
   'TBCONB001',
   'TBCONB002',
   'TBCONB006',
   'TBSENH005',
   'TBSENH006',
];

/**
 * Indica se uma tabela existe no banco.
 * @param {string} sTabela
 * @returns {Promise<boolean>}
 */
async function existeTabela(sTabela) {
   const aLinhas = await prisma.$queryRawUnsafe(`SELECT OBJECT_ID('dbo.${sTabela}', 'U') AS idObjeto`);
   return aLinhas[0]?.idObjeto != null;
} // existeTabela

/**
 * Confere se as tabelas do ERP estão no banco apontado pelo .env.
 * @returns {Promise<string[]>} Tabelas ausentes
 */
async function conferaTabelasDoErp() {
   const aAusentes = [];

   for (const sTabela of TABELAS_DO_ERP) {
      if (!(await existeTabela(sTabela))) {
         aAusentes.push(sTabela);
      }
   }

   return aAusentes;
} // conferaTabelasDoErp

/**
 * Aplica o schema, lote por lote.
 *
 * CREATE TABLE e CREATE INDEX precisam de lote próprio no T-SQL — mandar o
 * arquivo inteiro em uma instrução faria o servidor recusar a partir do
 * segundo comando. O separador é a linha "GO", como no sqlcmd.
 *
 * @param {string} sSql Conteúdo de schema.sql
 * @returns {Promise<number>} Quantidade de lotes aplicados
 */
async function aplicaSchema(sSql) {
   const aLotes = sSql
      .split(/^[ \t]*GO[ \t]*\r?$/im)
      .map((sLote) => sLote.trim())
      .filter((sLote) => sLote.length > 0);

   let iAplicados = 0;
   for (const sLote of aLotes) {
      await prisma.$executeRawUnsafe(sLote);
      iAplicados += 1;
   }

   return iAplicados;
} // aplicaSchema

async function main() {
   const sBanco = process.env.DB_NAME || 'BDAPRESENTACAO';
   const sSql = fs.readFileSync(sSqlPath, 'utf8');

   try {
      const aBanco = await prisma.$queryRaw`SELECT DB_NAME() AS nomBanco, SCHEMA_NAME() AS nomSchema`;
      console.log(`Conectado em ${aBanco[0]?.nomBanco} (schema padrão ${aBanco[0]?.nomSchema}).`);

      console.log('\nConferindo as tabelas do ERP...');
      const aAusentes = await conferaTabelasDoErp();
      if (aAusentes.length > 0) {
         throw new Error(
            `As tabelas ${aAusentes.join(', ')} não existem em ${sBanco}. ` +
               'Confira DB_NAME no .env: o módulo trabalha dentro do banco do ERP.'
         );
      }
      console.log(`  ${TABELAS_DO_ERP.length} tabela(s) do ERP encontrada(s).`);

      console.log('\nCriando as tabelas do módulo...');
      const aAntes = [];
      for (const sTabela of TABELAS_DO_MODULO) {
         if (await existeTabela(sTabela)) {
            aAntes.push(sTabela);
         }
      }

      const iLotes = await aplicaSchema(sSql);

      for (const sTabela of TABELAS_DO_MODULO) {
         console.log(`  ${sTabela}: ${aAntes.includes(sTabela) ? 'já existia' : 'criada'}`);
      }
      console.log(`\nSchema aplicado em ${sBanco} (${iLotes} lote(s)).`);
   } finally {
      await fechaConexao();
   }
} // main

main().catch(async (oErro) => {
   console.error('Falha ao aplicar schema:', oErro.message);
   await fechaConexao().catch(() => {});
   process.exit(1);
});
