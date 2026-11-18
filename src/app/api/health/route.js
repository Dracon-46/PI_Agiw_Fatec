// ============================================================================
// api/health - Verificação de saúde da aplicação
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Usada pelo HEALTHCHECK do contêiner e pela pipeline de CI:
//   GET /api/health        -> a aplicação está no ar (não toca no banco)
//   GET /api/health?db=1   -> também confere a conexão com o SQL Server do ERP
//
// Responde 200 quando tudo está disponível e 503 quando o banco não responde,
// sem expor detalhes da conexão.
// ============================================================================

import { NextResponse } from 'next/server';
import { getPrisma } from '../../../lib/db.js';
import oPacote from '../../../../package.json';

export const dynamic = 'force-dynamic';

/** Tempo máximo de espera pela resposta do SQL Server, em milissegundos */
const PRAZO_BANCO_MS = 3000;

/**
 * Executa uma consulta mínima no banco, limitada pelo prazo.
 * @returns {Promise<void>}
 */
async function verificaBanco() {
   let iTemporizador = null;
   const oPrazo = new Promise((_, fnRejeita) => {
      iTemporizador = setTimeout(() => fnRejeita(new Error('tempo esgotado')), PRAZO_BANCO_MS);
   });

   try {
      await Promise.race([getPrisma().$queryRaw`SELECT 1`, oPrazo]);
   } finally {
      clearTimeout(iTemporizador);
   }
} // verificaBanco

/**
 * @param {Request} oRequisicao
 * @returns {Promise<NextResponse>}
 */
export async function GET(oRequisicao) {
   const oStatus = {
      status: 'ok',
      versao: oPacote.version,
      uptime: Math.round(process.uptime()),
   };

   if (new URL(oRequisicao.url).searchParams.get('db') !== '1') {
      return NextResponse.json(oStatus);
   }

   try {
      await verificaBanco();
      return NextResponse.json({ ...oStatus, banco: 'ok' });
   } catch {
      return NextResponse.json({ ...oStatus, status: 'degradado', banco: 'indisponivel' }, { status: 503 });
   }
} // GET
