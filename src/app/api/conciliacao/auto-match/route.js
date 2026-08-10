// ============================================================================
// api/conciliacao/auto-match - Conciliação automática
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Atende o botão "Conciliação automática" (item 6.1.3.3 do documento de visão):
// localiza Movimento/Lançamento idêntico e devolve os grupos conciliáveis.
// A gravação do status ocorre no endpoint "/gfn/lancamento_conb/conciliado".
// ============================================================================

import { NextResponse } from 'next/server';
import { executaConciliacaoAutomatica, JANELA_DIAS_PADRAO } from '../../../../services/autoMatchService.js';

export const dynamic = 'force-dynamic';

/**
 * POST /api/conciliacao/auto-match
 * Corpo: { lancamentos: Array, movimentos: Array, janelaDias?: number }
 * @param {Request} oRequisicao
 * @returns {Promise<NextResponse>}
 */
export async function POST(oRequisicao) {
   let oCorpo = null;

   try {
      oCorpo = await oRequisicao.json();
   } catch {
      return NextResponse.json(
         { erro: 'Corpo da requisição inválido. Envie um JSON válido.' },
         { status: 400 }
      );
   }

   const aLancamentos = oCorpo?.lancamentos;
   const aMovimentos = oCorpo?.movimentos;

   // Validação antes do processamento, conforme padrão de transações
   if (!Array.isArray(aLancamentos) || !Array.isArray(aMovimentos)) {
      return NextResponse.json(
         { erro: 'Informe as listas de lançamentos e de movimentos.' },
         { status: 400 }
      );
   }

   if (aLancamentos.length === 0 || aMovimentos.length === 0) {
      return NextResponse.json({
         aGrupos: [],
         iGrupos: 0,
         iLancamentosConciliados: 0,
         iMovimentosConciliados: 0,
         mensagem: 'Não há lançamentos e movimentos pendentes para conciliar.',
      });
   }

   try {
      const iJanelaDias = Number(oCorpo.janelaDias ?? JANELA_DIAS_PADRAO);
      const oResultado = executaConciliacaoAutomatica(aLancamentos, aMovimentos, { iJanelaDias });

      const sMensagem =
         oResultado.iGrupos > 0
            ? `${oResultado.iGrupos} correspondência(s) localizada(s).`
            : 'Nenhuma correspondência automática foi encontrada no período.';

      return NextResponse.json({ ...oResultado, mensagem: sMensagem });
   } catch (oErro) {
      console.error('[api/conciliacao/auto-match] Falha no processamento:', oErro);
      return NextResponse.json(
         { erro: 'Falha ao executar a conciliação automática.' },
         { status: 500 }
      );
   }
} // POST
