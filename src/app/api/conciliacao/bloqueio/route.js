// ============================================================================
// api/conciliacao/bloqueio - Bloqueio de período da conta corrente
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Atende o item 6.1.3.1 do documento de visão: caixa "Conta Bloqueada para
// Lançamentos Até", com os botões de bloquear e desbloquear, "tendo como regra
// que a data deverá ser menor que a data do dia".
//
// A data é gravada em conta_corrente.dat_ultimo_bloqueio: antes o bloqueio
// vivia apenas no estado da tela e se perdia ao recarregar, deixando passar
// lançamentos em período já fechado.
// ============================================================================

import { NextResponse } from 'next/server';
import {
   atualizaBloqueioConta,
   buscaContaPorCodigo,
} from '../../../../lib/repositories/contaRepository.js';
import {
   ACAO_BLOQUEIO,
   ACAO_DESBLOQUEIO,
   registraAuditoria,
} from '../../../../lib/repositories/auditoriaRepository.js';
import {
   PERM_BLOQUEIO,
   mensagemSemPermissao,
   nomUsuarioAtual,
   temPermissao,
} from '../../../../lib/repositories/usuarioRepository.js';
import { dataBrParaSql } from '../../../../lib/db.js';
import { formataDataBr } from '../../../../utils/formatters.js';

export const dynamic = 'force-dynamic';

/**
 * POST /api/conciliacao/bloqueio
 * Corpo: { conta, datBloqueio }  — datBloqueio vazio remove o bloqueio.
 * @param {Request} oRequisicao
 * @returns {Promise<NextResponse>}
 */
export async function POST(oRequisicao) {
   let oCorpo = null;

   try {
      oCorpo = await oRequisicao.json();
   } catch {
      return NextResponse.json({ erro: 'Corpo da requisição inválido.' }, { status: 400 });
   }

   const sCodConta = String(oCorpo?.conta ?? '');
   const sDatBloqueio = String(oCorpo?.datBloqueio ?? '').trim();
   const bRemove = sDatBloqueio === '';

   // ---------- Validações (antes de qualquer gravação) ----------
   if (!sCodConta) {
      return NextResponse.json({ erro: 'Selecione a conta corrente.' }, { status: 400 });
   }

   // Item 6.1.3.1: "Verificar permissão de acesso para uso desses botões."
   // A conferência é feita aqui, no servidor, e não apenas na tela.
   if (!(await temPermissao(PERM_BLOQUEIO))) {
      return NextResponse.json({ erro: mensagemSemPermissao(PERM_BLOQUEIO) }, { status: 403 });
   }

   if (!bRemove) {
      const sDatSql = dataBrParaSql(sDatBloqueio);
      if (!sDatSql) {
         return NextResponse.json(
            { erro: `Data de bloqueio inválida: "${sDatBloqueio}".` },
            { status: 400 }
         );
      }

      // Regra do item 6.1.3.1: a data deve ser menor que a data do dia
      const sHojeSql = dataBrParaSql(formataDataBr(new Date()));
      if (sDatSql >= sHojeSql) {
         return NextResponse.json(
            { erro: 'A data de bloqueio deve ser anterior à data do dia.' },
            { status: 409 }
         );
      }
   }

   try {
      const oConta = await buscaContaPorCodigo(sCodConta);
      if (!oConta) {
         return NextResponse.json({ erro: `Conta "${sCodConta}" não localizada.` }, { status: 404 });
      }

      await atualizaBloqueioConta(sCodConta, bRemove ? '' : sDatBloqueio);

      await registraAuditoria({
         oConta,
         tipAcao: bRemove ? ACAO_DESBLOQUEIO : ACAO_BLOQUEIO,
         desEntidade: 'conta',
         codEntidade: sCodConta,
         nomUsuario: nomUsuarioAtual(),
         desDetalhe: bRemove
            ? `Bloqueio removido da conta ${oConta.codAgencia}/${oConta.numContaCorrente}.`
            : `Conta ${oConta.codAgencia}/${oConta.numContaCorrente} bloqueada para lançamentos até ${sDatBloqueio}.`,
      });

      return NextResponse.json({
         ok: true,
         datUltimoBloqueio: bRemove ? '' : sDatBloqueio,
         mensagem: bRemove
            ? 'Bloqueio removido. A conta aceita lançamentos em todo o período.'
            : `Conta bloqueada para lançamentos até ${sDatBloqueio}.`,
      });
   } catch (oErro) {
      console.error('[api/conciliacao/bloqueio] Falha ao gravar:', oErro);
      return NextResponse.json({ erro: oErro.message }, { status: 500 });
   }
} // POST
