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
import { calculaSaldoAnteriorBanco } from '../../../../lib/repositories/movimentoRepository.js';

export const dynamic = 'force-dynamic';

/**
 * Monta o bloco de saldos de um dos lados da tela.
 *
 * O item 6.1.2 pede que "ambos os extratos" tragam saldo anterior, entradas e
 * saídas no período e saldo final — por isso a mesma função serve ao sistema
 * e ao banco.
 *
 * @param {number} nSaldoAnterior
 * @param {Array<object>} aRegistros Lançamentos ou movimentos do período
 * @returns {{ valSaldoAnterior: number, valEntradas: number,
 *             valSaidas: number, valSaldoFinal: number }}
 */
function montaSaldos(nSaldoAnterior, aRegistros) {
   let nEntradas = 0;
   let nSaidas = 0;

   for (const oRegistro of aRegistros) {
      if (oRegistro.bEntrada) {
         nEntradas += oRegistro.valMovimento;
      } else {
         nSaidas += oRegistro.valMovimento;
      }
   }

   return {
      valSaldoAnterior: nSaldoAnterior,
      valEntradas: nEntradas,
      valSaidas: nSaidas,
      valSaldoFinal: nSaldoAnterior + nEntradas - nSaidas,
   };
} // montaSaldos

/**
 * GET /api/conciliacao/lancamentos?conta=&dataInicio=&dataFim=
 */
export async function GET(oRequisicao) {
   const oParams = new URL(oRequisicao.url).searchParams;
   const sCodConta = oParams.get('conta') ?? '';
   const sDataInicio = oParams.get('dataInicio') ?? '';
   const sDataFim = oParams.get('dataFim') ?? '';

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

      // Os lançamentos do sistema SEMPRE respeitam o período (item 6.1.3.2:
      // o botão Buscar "traz os lançamentos e movimentos já registrados no
      // Satis" do período informado). Aqui a base é nossa e as datas são
      // confiáveis, então o recorte é legítimo.
      // As duas grades precisam cobrir a mesma janela, senão a conferência
      // fica impossível. Quando BANK_FILTRA_PERIODO=false o extrato do banco
      // não é recortado (o sandbox ignora as datas), então o lado do sistema
      // também não pode ser — caso contrário sobrariam movimentos do banco
      // sem nenhum lançamento correspondente à vista.
      const bRecortaPeriodo =
         (process.env.BANK_FILTRA_PERIODO ?? '').trim().toLowerCase() !== 'false';

      const aLancamentos = bRecortaPeriodo
         ? await listaLancamentosPeriodo(oConta.idConta, sDataInicio, sDataFim)
         : await listaLancamentosConta(oConta.idConta);

      // Saldo anterior é o acumulado ANTES da primeira linha da grade. Sem
      // recorte a grade traz o extrato inteiro, então não há nada antes dela:
      // somar o período anterior contaria os mesmos movimentos duas vezes.
      const [nSaldoAnterior, nSaldoAnteriorBanco] = bRecortaPeriodo
         ? await Promise.all([
              calculaSaldoAnterior(oConta.idConta, sDataInicio),
              calculaSaldoAnteriorBanco(oConta.idConta, sDataInicio),
           ])
         : [0, 0];


      return NextResponse.json({
         lancamentos: aLancamentos,
         conta: oConta,
         saldos: {
            // Bloco do sistema — mantido na raiz por compatibilidade com a tela
            ...montaSaldos(nSaldoAnterior, aLancamentos),
            datSaldoAnterior: sDataInicio,
            datSaldoFinal: sDataFim,
            // Item 6.1.2: cada extrato tem o seu próprio conjunto de saldos.
            // O do banco sai sem entradas/saídas: os movimentos do período
            // chegam pela API, e a tela os soma ao receber o extrato.
            oSistema: montaSaldos(nSaldoAnterior, aLancamentos),
            valSaldoAnteriorBanco: nSaldoAnteriorBanco,
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
         // Campos do item 6.1.3.8 — ação 1
         tipDocumento: oCorpo.tipDocumento,
         codSubgrupo: oCorpo.codSubgrupo,
         codContaContabil: oCorpo.codContaContabil,
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


      const sDetalhe = oResultado.codTransferencia
         ? `Transferência ${oResultado.codTransferencia} excluída: ${oResultado.iPernasExcluidas} lançamento(s) removido(s) nas duas contas.`
         : `Lançamento ${sCodLancamento} excluído da conciliação.`;

      await registraAuditoria({
         idConta: oConta.idConta,
         tipAcao: ACAO_LANCAMENTO_EXCLUIDO,
         desEntidade: oResultado.codTransferencia ? 'transferencia' : 'lancamento',
         codEntidade: oResultado.codTransferencia ?? sCodLancamento,
         desDetalhe: sDetalhe,
      });

      return NextResponse.json({
         ok: true,
         codTransferencia: oResultado.codTransferencia ?? null,
         mensagem: sDetalhe,
      });
   } catch (oErro) {
      console.error('[api/conciliacao/lancamentos] Falha ao excluir:', oErro);
      return NextResponse.json({ erro: oErro.message }, { status: 500 });
   }
} // DELETE
