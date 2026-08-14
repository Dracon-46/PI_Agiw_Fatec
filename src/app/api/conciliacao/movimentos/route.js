// ============================================================================
// api/conciliacao/movimentos - Exclusão de movimentos do extrato bancário
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Item 6.1.3.8 — ação 4: "Para grade movimentos não há outra restrição de
// exclusão além do status de conciliado."
//
// Antes a exclusão acontecia apenas no estado da tela: o movimento voltava
// assim que o usuário clicava em Buscar. Aqui ela é efetivada no MySQL.
// ============================================================================

import { NextResponse } from 'next/server';
import { buscaContaPorCodigo } from '../../../../lib/repositories/contaRepository.js';
import { excluiMovimento } from '../../../../lib/repositories/movimentoRepository.js';
import {
   ACAO_MOVIMENTO_EXCLUIDO,
   registraAuditoria,
} from '../../../../lib/repositories/auditoriaRepository.js';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/conciliacao/movimentos?conta=&movimento=
 * @param {Request} oRequisicao
 * @returns {Promise<NextResponse>}
 */
export async function DELETE(oRequisicao) {
   const oParams = new URL(oRequisicao.url).searchParams;
   const sCodConta = oParams.get('conta') ?? '';
   const sCodMovimento = oParams.get('movimento') ?? '';

   if (!sCodConta || !sCodMovimento) {
      return NextResponse.json(
         { erro: 'Informe a conta e o movimento a ser excluído.' },
         { status: 400 }
      );
   }

   try {
      const oConta = await buscaContaPorCodigo(sCodConta);
      if (!oConta) {
         return NextResponse.json({ erro: `Conta "${sCodConta}" não localizada.` }, { status: 404 });
      }

      const oResultado = await excluiMovimento(oConta.idConta, sCodMovimento);
      if (!oResultado.bExcluido) {
         return NextResponse.json({ erro: oResultado.sMotivo }, { status: 409 });
      }

      await registraAuditoria({
         idConta: oConta.idConta,
         tipAcao: ACAO_MOVIMENTO_EXCLUIDO,
         desEntidade: 'movimento',
         codEntidade: sCodMovimento,
         desDetalhe: `Movimento ${sCodMovimento} excluído do extrato bancário importado.`,
      });

      return NextResponse.json({ ok: true, mensagem: 'Movimento excluído do extrato.' });
   } catch (oErro) {
      console.error('[api/conciliacao/movimentos] Falha ao excluir:', oErro);
      return NextResponse.json({ erro: oErro.message }, { status: 500 });
   }
} // DELETE
