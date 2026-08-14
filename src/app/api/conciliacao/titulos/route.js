// ============================================================================
// api/conciliacao/titulos - Busca e baixa de títulos (Contas a Pagar/Receber)
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Item 6.1.3.8 — ação 3 ("Baixar Título") do documento de visão:
//   GET  relaciona os títulos abertos até a data do movimento;
//   POST realiza a baixa de um ou mais documentos, informando data e valores
//        de baixa, multa, juros, desconto e tarifa, atualizando a origem do
//        título e gerando o lançamento no extrato do sistema.
// ============================================================================

import { NextResponse } from 'next/server';
import { buscaContaPorCodigo } from '../../../../lib/repositories/contaRepository.js';
import {
   ORIGEM_BAIXA_TITULO,
   insereLancamento,
} from '../../../../lib/repositories/lancamentoRepository.js';
import {
   buscaTituloPorCodigo,
   listaTitulosAbertos,
   marcaTituloBaixado,
} from '../../../../lib/repositories/tituloRepository.js';
import {
   ACAO_LANCAMENTO_INCLUIDO,
   registraAuditoria,
} from '../../../../lib/repositories/auditoriaRepository.js';
import { dataBrParaMysql } from '../../../../lib/db.js';

export const dynamic = 'force-dynamic';

/**
 * Arredonda para duas casas, evitando o resíduo binário das somas de moeda.
 * @param {number} nValor
 * @returns {number}
 */
function arredonda(nValor) {
   return Math.round(nValor * 100) / 100;
} // arredonda

/**
 * GET /api/conciliacao/titulos?conta=&dataLimite=&tipo=Entrada|Saída
 * @param {Request} oRequisicao
 * @returns {Promise<NextResponse>}
 */
export async function GET(oRequisicao) {
   const oParams = new URL(oRequisicao.url).searchParams;
   const sCodConta = oParams.get('conta') ?? '';
   const sDataLimite = oParams.get('dataLimite') ?? '';
   const sTipo = oParams.get('tipo') ?? '';

   if (!sCodConta) {
      return NextResponse.json({ erro: 'Selecione a conta corrente.' }, { status: 400 });
   }

   try {
      const oConta = await buscaContaPorCodigo(sCodConta);
      if (!oConta) {
         return NextResponse.json({ erro: `Conta "${sCodConta}" não localizada.` }, { status: 404 });
      }

      const aTitulos = await listaTitulosAbertos(oConta.idConta, {
         sDataLimiteBr: sDataLimite,
         sTipMovimento: sTipo,
      });

      return NextResponse.json({
         titulos: aTitulos,
         resumo: {
            iQuantidade: aTitulos.length,
            valEntradas: arredonda(
               aTitulos.filter((oItem) => oItem.bEntrada).reduce((nSoma, oItem) => nSoma + oItem.valPagoSugerido, 0)
            ),
            valSaidas: arredonda(
               aTitulos.filter((oItem) => !oItem.bEntrada).reduce((nSoma, oItem) => nSoma + oItem.valPagoSugerido, 0)
            ),
         },
      });
   } catch (oErro) {
      console.error('[api/conciliacao/titulos] Falha ao listar:', oErro);
      return NextResponse.json({ erro: oErro.message }, { status: 500 });
   }
} // GET

/**
 * POST /api/conciliacao/titulos
 * Corpo: {
 *   conta,
 *   baixas: [{ codTitulo, datBaixa, valPago, valMulta?, valJuros?, valDesconto?, valTarifa? }]
 * }
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
   const aBaixas = Array.isArray(oCorpo?.baixas) ? oCorpo.baixas : [];

   if (!sCodConta) {
      return NextResponse.json({ erro: 'Selecione a conta corrente.' }, { status: 400 });
   }
   if (aBaixas.length === 0) {
      return NextResponse.json({ erro: 'Selecione ao menos um título para baixar.' }, { status: 400 });
   }

   try {
      const oConta = await buscaContaPorCodigo(sCodConta);
      if (!oConta) {
         return NextResponse.json({ erro: `Conta "${sCodConta}" não localizada.` }, { status: 404 });
      }

      // ---------- Validação completa antes de gravar qualquer baixa ----------
      const aPreparadas = [];
      const sDatBloqueio = oConta.datUltimoBloqueio ? dataBrParaMysql(oConta.datUltimoBloqueio) : '';

      for (const oBaixa of aBaixas) {
         const sCodTitulo = String(oBaixa?.codTitulo ?? '');
         const oTitulo = await buscaTituloPorCodigo(sCodTitulo);

         if (!oTitulo) {
            return NextResponse.json(
               { erro: `Título "${sCodTitulo}" não localizado.` },
               { status: 404 }
            );
         }
         if (oTitulo.staBaixado) {
            return NextResponse.json(
               { erro: `O título ${sCodTitulo} já está baixado.` },
               { status: 409 }
            );
         }

         const sDatBaixa = String(oBaixa?.datBaixa ?? '').trim();
         const sDatBaixaMysql = dataBrParaMysql(sDatBaixa);
         if (!sDatBaixaMysql) {
            return NextResponse.json(
               { erro: `Informe a data de baixa do título ${sCodTitulo}.` },
               { status: 400 }
            );
         }
         if (sDatBloqueio && sDatBaixaMysql <= sDatBloqueio) {
            return NextResponse.json(
               {
                  erro:
                     `A conta está bloqueada para lançamentos até ${oConta.datUltimoBloqueio}. ` +
                     `Ajuste a data de baixa do título ${sCodTitulo}.`,
               },
               { status: 409 }
            );
         }

         const nValPago = Number(oBaixa?.valPago ?? oTitulo.valPagoSugerido);
         if (!Number.isFinite(nValPago) || nValPago <= 0) {
            return NextResponse.json(
               { erro: `O valor pago do título ${sCodTitulo} deve ser maior que zero.` },
               { status: 400 }
            );
         }

         aPreparadas.push({
            oTitulo,
            sDatBaixa,
            nValPago: arredonda(nValPago),
            nValMulta: arredonda(Number(oBaixa?.valMulta ?? oTitulo.valMulta) || 0),
            nValJuros: arredonda(Number(oBaixa?.valJuros ?? oTitulo.valJuros) || 0),
            nValDesconto: arredonda(Number(oBaixa?.valDesconto ?? oTitulo.valDesconto) || 0),
            nValTarifa: arredonda(Number(oBaixa?.valTarifa ?? 0) || 0),
         });
      }

      // ---------- Gravação ----------
      const aLancamentos = [];
      let nTotalEntradas = 0;
      let nTotalSaidas = 0;

      for (const oPreparada of aPreparadas) {
         const { oTitulo } = oPreparada;

         const oLancamento = await insereLancamento(oConta.idConta, {
            datMovimento: oPreparada.sDatBaixa,
            datCompensacao: oPreparada.sDatBaixa,
            numDocumento: oTitulo.numDocumento || oTitulo.codTitulo,
            desHistorico:
               `Baixa do título ${oTitulo.codTitulo} — ${oTitulo.nomEmitente}` +
               (oTitulo.numParcela ? ` (parcela ${oTitulo.numParcela})` : ''),
            valMovimento: oPreparada.nValPago,
            bEntrada: oTitulo.bEntrada,
            tipOrigem: ORIGEM_BAIXA_TITULO,
            codTitulo: oTitulo.codTitulo,
         });

         await marcaTituloBaixado({
            sCodTitulo: oTitulo.codTitulo,
            iIdConta: oConta.idConta,
            sDatBaixaBr: oPreparada.sDatBaixa,
            nValPago: oPreparada.nValPago,
            nValMulta: oPreparada.nValMulta,
            nValJuros: oPreparada.nValJuros,
            nValDesconto: oPreparada.nValDesconto,
            nValTarifa: oPreparada.nValTarifa,
            sCodLancamento: oLancamento.codLancamento,
         });

         // A tarifa é um custo à parte: vira um lançamento de saída próprio
         if (oPreparada.nValTarifa > 0) {
            const oTarifa = await insereLancamento(oConta.idConta, {
               datMovimento: oPreparada.sDatBaixa,
               datCompensacao: oPreparada.sDatBaixa,
               numDocumento: oTitulo.numDocumento || oTitulo.codTitulo,
               desHistorico: `Tarifa de cobrança — título ${oTitulo.codTitulo}`,
               valMovimento: oPreparada.nValTarifa,
               bEntrada: false,
               tipOrigem: ORIGEM_BAIXA_TITULO,
               codTitulo: oTitulo.codTitulo,
            });
            aLancamentos.push({ ...oTarifa, codConta: sCodConta });
            nTotalSaidas += oPreparada.nValTarifa;
         }

         aLancamentos.push({ ...oLancamento, codConta: sCodConta });

         if (oTitulo.bEntrada) {
            nTotalEntradas += oPreparada.nValPago;
         } else {
            nTotalSaidas += oPreparada.nValPago;
         }

         await registraAuditoria({
            idConta: oConta.idConta,
            tipAcao: ACAO_LANCAMENTO_INCLUIDO,
            desEntidade: 'titulo',
            codEntidade: oTitulo.codTitulo,
            desDetalhe:
               `Título ${oTitulo.codTitulo} (${oTitulo.nomEmitente}) baixado em ` +
               `${oPreparada.sDatBaixa} pelo lançamento ${oLancamento.codLancamento}.`,
            valReferencia: oPreparada.nValPago,
         });
      }

      return NextResponse.json({
         lancamentos: aLancamentos,
         resumo: {
            iTitulosBaixados: aPreparadas.length,
            valEntradas: arredonda(nTotalEntradas),
            valSaidas: arredonda(nTotalSaidas),
         },
         mensagem:
            `${aPreparadas.length} título(s) baixado(s): ${aLancamentos.length} lançamento(s) ` +
            'gerado(s) no extrato do sistema.',
      });
   } catch (oErro) {
      console.error('[api/conciliacao/titulos] Falha ao baixar:', oErro);
      return NextResponse.json({ erro: oErro.message }, { status: 500 });
   }
} // POST
