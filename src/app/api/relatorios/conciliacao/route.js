// ============================================================================
// api/relatorios/conciliacao - Exportação dos extratos
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Atende o item 6.2 do documento de visão: botão para exportar os extratos
// (bancário ou Satis) para Excel ou PDF, com saldo inicial, movimentos,
// saldo final e os totais de entradas, saídas, conciliado e não conciliado.
// ============================================================================

import { NextResponse } from 'next/server';
import { buscaContaPorCodigo } from '../../../../lib/repositories/contaRepository.js';
import {
   calculaSaldoAnterior,
   listaLancamentosPeriodo,
} from '../../../../lib/repositories/lancamentoRepository.js';
import {
   listaMovimentosConta,
   listaMovimentosPeriodo,
} from '../../../../lib/repositories/movimentoRepository.js';
import { ACAO_EXPORTACAO, registraAuditoria } from '../../../../lib/repositories/auditoriaRepository.js';
import {
   FORMATO_CSV,
   FORMATO_PDF,
   FORMATO_XLSX,
   geraCsv,
   geraExcel,
   geraHtmlImpressao,
} from '../../../../lib/relatorios/relatorioConciliacao.js';
import { formataDataBr } from '../../../../utils/formatters.js';

export const dynamic = 'force-dynamic';

/** Formatos aceitos pelo parâmetro "formato" */
const FORMATOS_VALIDOS = [FORMATO_XLSX, FORMATO_CSV, FORMATO_PDF];

/**
 * Monta o nome do arquivo exportado.
 * @param {object} oConta
 * @param {string} sExtensao
 * @returns {string}
 */
function montaNomeArquivo(oConta, sExtensao) {
   const sData = formataDataBr(new Date()).replace(/\//g, '-');
   return `conciliacao-${oConta.codBanco}-${oConta.codAgencia}-${oConta.numContaCorrente}-${sData}.${sExtensao}`;
} // montaNomeArquivo

/**
 * GET /api/relatorios/conciliacao?conta=&dataInicio=&dataFim=&formato=xlsx|csv|pdf
 * @param {Request} oRequisicao
 * @returns {Promise<Response>}
 */
export async function GET(oRequisicao) {
   const oParams = new URL(oRequisicao.url).searchParams;
   const sCodConta = oParams.get('conta') ?? '';
   const sDataInicio = oParams.get('dataInicio') ?? '';
   const sDataFim = oParams.get('dataFim') ?? '';
   const sFormato = (oParams.get('formato') ?? FORMATO_XLSX).toLowerCase();
   const bRecortaPeriodo = oParams.get('recortaPeriodo') === '1';

   // Validações antes de montar o relatório
   if (!sCodConta) {
      return NextResponse.json({ erro: 'Selecione a conta corrente.' }, { status: 400 });
   }
   if (!FORMATOS_VALIDOS.includes(sFormato)) {
      return NextResponse.json(
         { erro: `Formato inválido. Use ${FORMATOS_VALIDOS.join(', ')}.` },
         { status: 400 }
      );
   }

   try {
      const oConta = await buscaContaPorCodigo(sCodConta);
      if (!oConta) {
         return NextResponse.json({ erro: `Conta "${sCodConta}" não localizada.` }, { status: 404 });
      }

      const aLancamentos = await listaLancamentosPeriodo(oConta.idConta, sDataInicio, sDataFim);
      const nSaldoAnterior = await calculaSaldoAnterior(oConta.idConta, sDataInicio);

      // A grade do banco segue o mesmo critério da tela: por padrão, tudo
      const aMovimentos = bRecortaPeriodo
         ? await listaMovimentosPeriodo(oConta.idConta, sDataInicio, sDataFim)
         : await listaMovimentosConta(oConta.idConta);

      const oDados = {
         oConta,
         sDataInicio,
         sDataFim,
         aLancamentos,
         aMovimentos,
         nSaldoAnterior,
         sDataEmissao: formataDataBr(new Date()),
      };

      await registraAuditoria({
         idConta: oConta.idConta,
         tipAcao: ACAO_EXPORTACAO,
         desEntidade: 'relatorio',
         codEntidade: sFormato.toUpperCase(),
         desDetalhe:
            `Relatório de conciliação exportado em ${sFormato.toUpperCase()} ` +
            `(${aLancamentos.length} lançamento(s) e ${aMovimentos.length} movimento(s)).`,
      });

      // ---------- Excel ----------
      if (sFormato === FORMATO_XLSX) {
         const oBuffer = await geraExcel(oDados);
         return new Response(oBuffer, {
            headers: {
               'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
               'Content-Disposition': `attachment; filename="${montaNomeArquivo(oConta, 'xlsx')}"`,
               'Cache-Control': 'no-store',
            },
         });
      }

      // ---------- CSV ----------
      if (sFormato === FORMATO_CSV) {
         return new Response(geraCsv(oDados), {
            headers: {
               'Content-Type': 'text/csv; charset=utf-8',
               'Content-Disposition': `attachment; filename="${montaNomeArquivo(oConta, 'csv')}"`,
               'Cache-Control': 'no-store',
            },
         });
      }

      // ---------- PDF (página de impressão) ----------
      return new Response(geraHtmlImpressao(oDados), {
         headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
         },
      });
   } catch (oErro) {
      console.error('[api/relatorios/conciliacao] Falha ao exportar:', oErro);
      return NextResponse.json({ erro: oErro.message }, { status: 500 });
   }
} // GET
