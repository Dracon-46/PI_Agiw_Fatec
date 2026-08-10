// ============================================================================
// api/conciliacao/lancamentos - Lançamentos do sistema (MySQL / Satis)
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
 // Sem massa falsa: se ainda não houver integração Satis, a grade vem vazia.
// ============================================================================

import { NextResponse } from 'next/server';
import { dataBrParaMysql } from '../../../../lib/db.js';
import { buscaContaPorCodigo } from '../../../../lib/repositories/contaRepository.js';
import {
   calculaSaldoAnterior,
   excluiLancamento,
   insereLancamento,
   listaLancamentosConta,
   listaLancamentosPeriodo,
} from '../../../../lib/repositories/lancamentoRepository.js';
import {
   ACAO_LANCAMENTO_EXCLUIDO,
   ACAO_LANCAMENTO_INCLUIDO,
   registraAuditoria,
} from '../../../../lib/repositories/auditoriaRepository.js';
import {
   listaMovimentosConta,
   listaMovimentosPeriodo,
} from '../../../../lib/repositories/movimentoRepository.js';

export const dynamic = 'force-dynamic';

function calculaSaldoFinal(nSaldoAnterior, aLancamentos) {
   return aLancamentos.reduce((nSaldo, oLancamento) => {
      return oLancamento.bEntrada ? nSaldo + oLancamento.valMovimento : nSaldo - oLancamento.valMovimento;
   }, nSaldoAnterior);
} // calculaSaldoFinal

/**
 * GET /api/conciliacao/lancamentos?conta=&dataInicio=&dataFim=
 */
export async function GET(oRequisicao) {
   const oParams = new URL(oRequisicao.url).searchParams;
   const sCodConta = oParams.get('conta') ?? '';
   const sDataInicio = oParams.get('dataInicio') ?? '';
   const sDataFim = oParams.get('dataFim') ?? '';
   // Por padrão a grade do banco exibe todo o extrato importado; passe
   // "recortaPeriodo=1" para limitá-la às datas informadas na tela.
   const bRecortaPeriodo = oParams.get('recortaPeriodo') === '1';

   if (!sCodConta) {
      return NextResponse.json(
         { erro: 'Selecione a conta corrente a ser conciliada.' },
         { status: 400 }
      );
   }

   try {
      const oConta = await buscaContaPorCodigo(sCodConta);
      if (!oConta) {
         return NextResponse.json(
            { erro: `Conta corrente "${sCodConta}" não localizada no MySQL.` },
            { status: 404 }
         );
      }

      const aLancamentos = bRecortaPeriodo
         ? await listaLancamentosPeriodo(oConta.idConta, sDataInicio, sDataFim)
         : await listaLancamentosConta(oConta.idConta);
      const nSaldoAnterior = await calculaSaldoAnterior(oConta.idConta, sDataInicio);

      // Repovoa a grade do banco com o extrato importado. Sem recorte, todo o
      // extrato da conta é devolvido — os bancos não respeitam necessariamente
      // o período solicitado e filtrar aqui esconderia movimentos importados.
      const aMovimentos = bRecortaPeriodo
         ? await listaMovimentosPeriodo(oConta.idConta, sDataInicio, sDataFim)
         : await listaMovimentosConta(oConta.idConta);

      return NextResponse.json({
         lancamentos: aLancamentos,
         movimentos: aMovimentos,
         titulos: [],
         conta: oConta,
         saldos: {
            valSaldoAnterior: nSaldoAnterior,
            valSaldoFinal: calculaSaldoFinal(nSaldoAnterior, aLancamentos),
            datSaldoAnterior: sDataInicio,
            datSaldoFinal: sDataFim,
         },
         periodo: { sDataInicio, sDataFim },
         aviso:
            aLancamentos.length === 0
               ? 'Nenhum lançamento do sistema no período. A grade ERP será preenchida quando a integração Satis estiver ativa.'
               : undefined,
      });
   } catch (oErro) {
      console.error('[api/conciliacao/lancamentos]', oErro);
      return NextResponse.json({ erro: oErro.message }, { status: 500 });
   }
} // GET

/**
 * POST /api/conciliacao/lancamentos
 * Inclui um lançamento no extrato do sistema (ação "Novo Lançamento").
 * Corpo: { conta, datMovimento, datCompensacao?, numDocumento?, desHistorico, valMovimento, bEntrada, tipOrigem? }
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

   // Validações antes de iniciar a gravação
   if (!sCodConta) {
      return NextResponse.json({ erro: 'Selecione a conta corrente.' }, { status: 400 });
   }
   if (!oCorpo.desHistorico || !String(oCorpo.desHistorico).trim()) {
      return NextResponse.json({ erro: 'Informe o histórico do lançamento.' }, { status: 400 });
   }
   if (!oCorpo.datMovimento) {
      return NextResponse.json({ erro: 'Informe a data do movimento.' }, { status: 400 });
   }

   const nValor = Number(oCorpo.valMovimento);
   if (!Number.isFinite(nValor) || nValor <= 0) {
      return NextResponse.json({ erro: 'O valor do lançamento deve ser maior que zero.' }, { status: 400 });
   }

   try {
      const oConta = await buscaContaPorCodigo(sCodConta);
      if (!oConta) {
         return NextResponse.json({ erro: `Conta "${sCodConta}" não localizada.` }, { status: 404 });
      }

      // Não aceita lançamento em período já bloqueado (item 6.1.3.1)
      if (oConta.datUltimoBloqueio) {
         const sDatBloqueioMysql = dataBrParaMysql(oConta.datUltimoBloqueio);
         const sDatMovimentoMysql = dataBrParaMysql(oCorpo.datMovimento);
         if (sDatMovimentoMysql && sDatBloqueioMysql && sDatMovimentoMysql <= sDatBloqueioMysql) {
            return NextResponse.json(
               {
                  erro: `A conta está bloqueada para lançamentos até ${oConta.datUltimoBloqueio}. Informe uma data posterior.`,
               },
               { status: 409 }
            );
         }
      }

      const oLancamento = await insereLancamento(oConta.idConta, {
         datMovimento: oCorpo.datMovimento,
         datCompensacao: oCorpo.datCompensacao,
         numDocumento: oCorpo.numDocumento,
         desHistorico: String(oCorpo.desHistorico).trim(),
         valMovimento: nValor,
         bEntrada: Boolean(oCorpo.bEntrada),
         tipOrigem: oCorpo.tipOrigem,
      });

      // A mensagem de sucesso é emitida somente após concluir a gravação
      await registraAuditoria({
         idConta: oConta.idConta,
         tipAcao: ACAO_LANCAMENTO_INCLUIDO,
         desEntidade: 'lancamento',
         codEntidade: oLancamento.codLancamento,
         desDetalhe:
            `Lançamento ${oLancamento.codLancamento} incluído: ${oLancamento.desHistorico} ` +
            `(${oLancamento.bEntrada ? 'entrada' : 'saída'} em ${oLancamento.datMovimento}).`,
         valReferencia: oLancamento.valMovimento,
      });

      return NextResponse.json({
         lancamento: { ...oLancamento, codConta: sCodConta },
         mensagem: `Lançamento ${oLancamento.codLancamento} incluído com sucesso.`,
      });
   } catch (oErro) {
      console.error('[api/conciliacao/lancamentos] Falha ao incluir:', oErro);
      return NextResponse.json({ erro: oErro.message }, { status: 500 });
   }
} // POST

/**
 * DELETE /api/conciliacao/lancamentos?conta=&lancamento=
 * Exclui um lançamento originado na conciliação (item 6.1.3.8 — ação 4).
 * @param {Request} oRequisicao
 * @returns {Promise<NextResponse>}
 */
export async function DELETE(oRequisicao) {
   const oParams = new URL(oRequisicao.url).searchParams;
   const sCodConta = oParams.get('conta') ?? '';
   const sCodLancamento = oParams.get('lancamento') ?? '';

   if (!sCodConta || !sCodLancamento) {
      return NextResponse.json(
         { erro: 'Informe a conta e o lançamento a ser excluído.' },
         { status: 400 }
      );
   }

   try {
      const oConta = await buscaContaPorCodigo(sCodConta);
      if (!oConta) {
         return NextResponse.json({ erro: `Conta "${sCodConta}" não localizada.` }, { status: 404 });
      }

      const oResultado = await excluiLancamento(oConta.idConta, sCodLancamento);
      if (!oResultado.bExcluido) {
         return NextResponse.json({ erro: oResultado.sMotivo }, { status: 409 });
      }

      await registraAuditoria({
         idConta: oConta.idConta,
         tipAcao: ACAO_LANCAMENTO_EXCLUIDO,
         desEntidade: 'lancamento',
         codEntidade: sCodLancamento,
         desDetalhe: `Lançamento ${sCodLancamento} excluído da conciliação.`,
      });

      return NextResponse.json({ ok: true, mensagem: `Lançamento ${sCodLancamento} excluído.` });
   } catch (oErro) {
      console.error('[api/conciliacao/lancamentos] Falha ao excluir:', oErro);
      return NextResponse.json({ erro: oErro.message }, { status: 500 });
   }
} // DELETE
