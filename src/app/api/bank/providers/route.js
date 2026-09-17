// ============================================================================
// api/bank/providers - Contas correntes cadastradas (SQL Server)
// Projeto Banco - Ticket 37060 | Agiw Sistemas
// ============================================================================

import { NextResponse } from 'next/server';
import { BankProviderFactory } from '../../../../providers/BankProviderFactory.js';
import { listaContasCorrentes } from '../../../../lib/repositories/contaRepository.js';
import { ehFalhaDeConexao } from '../../../../lib/db.js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/bank/providers
 * @returns {Promise<NextResponse>}
 */
export async function GET() {
   try {
      const aProviders = BankProviderFactory.getAvailableProviders();
      const aContas = await listaContasCorrentes();

      return NextResponse.json({
         providers: aProviders,
         contas: aContas,
         slugPadrao: BankProviderFactory.getDefaultProvider(),
      });
   } catch (oErro) {
      console.error('[api/bank/providers] Falha ao listar contas:', oErro);
      return NextResponse.json(
         {
            erro: ehFalhaDeConexao(oErro)
               ? 'SQL Server indisponível. Confira o serviço da instância e as variáveis DB_* no .env.'
               : 'Não foi possível carregar as contas correntes do banco de dados.',
            detalhe: oErro.message,
         },
         { status: 500 }
      );
   }
} // GET
