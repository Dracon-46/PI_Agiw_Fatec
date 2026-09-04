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
import { leExtratoDaConta } from '../../../../lib/extratoBanco.js';
import { ACAO_EXPORTACAO, registraAuditoria } from '../../../../lib/repositories/auditoriaRepository.js';
import {
   ESCOPOS_VALIDOS,
   ESCOPO_AMBOS,
   ESCOPO_BANCO,
   ESCOPO_SISTEMA,
   FORMATO_CSV,
   FORMATO_OFX,
   FORMATO_PDF,
   FORMATO_XLSX,
   descreveFiltroStatus,
   filtraPorStatus,
   geraCsv,
   geraExcel,
   geraHtmlImpressao,
   geraOfx,
} from '../../../../lib/relatorios/relatorioConciliacao.js';
import { formataDataBr } from '../../../../utils/formatters.js';

export const dynamic = 'force-dynamic';

/** Formatos aceitos pelo parâmetro "formato" */
const FORMATOS_VALIDOS = [FORMATO_XLSX, FORMATO_CSV, FORMATO_PDF, FORMATO_OFX];

/** Rótulos de escopo exibidos no cabeçalho do relatório */
const ROTULOS_ESCOPO = {
   [ESCOPO_AMBOS]: 'extrato do sistema (Satis) e extrato do banco',
   [ESCOPO_SISTEMA]: 'somente o extrato do sistema (Satis)',
   [ESCOPO_BANCO]: 'somente o extrato do banco',
};

/** Sufixo do nome do arquivo por escopo */
const SUFIXO_ESCOPO = {
   [ESCOPO_AMBOS]: '',
   [ESCOPO_SISTEMA]: '-satis',
   [ESCOPO_BANCO]: '-banco',
};

/**
 * Lê um parâmetro booleano da query string.
 * Ausente significa "ligado", que é o estado inicial dos chips das grades.
 * @param {URLSearchParams} oParams
 * @param {string} sChave
 * @returns {boolean}
 */
function leBooleano(oParams, sChave) {
   const sValor = oParams.get(sChave);
   return sValor === null ? true : sValor === '1' || sValor === 'true';
} // leBooleano

/**
 * Monta o nome do arquivo exportado.
 * @param {object} oConta
 * @param {string} sExtensao
 * @param {string} sEscopo
 * @returns {string}
 */
function montaNomeArquivo(oConta, sExtensao, sEscopo) {
   const sData = formataDataBr(new Date()).replace(/\//g, '-');
   return (
      `conciliacao${SUFIXO_ESCOPO[sEscopo] ?? ''}-${oConta.codBanco}-${oConta.codAgencia}-` +
      `${oConta.numContaCorrente}-${sData}.${sExtensao}`
   );
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
   const sEscopo = (oParams.get('escopo') ?? ESCOPO_AMBOS).toLowerCase();

   // Chips de situação das grades (item 6.1.3.4): o relatório imprime os
   // registros exibidos, então o mesmo recorte precisa chegar até aqui
   const bLancConciliados = leBooleano(oParams, 'lancConciliados');
   const bLancNaoConciliados = leBooleano(oParams, 'lancNaoConciliados');
   const bMovConciliados = leBooleano(oParams, 'movConciliados');
   const bMovNaoConciliados = leBooleano(oParams, 'movNaoConciliados');

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
   if (!ESCOPOS_VALIDOS.includes(sEscopo)) {
      return NextResponse.json(
         { erro: `Escopo inválido. Use ${ESCOPOS_VALIDOS.join(', ')}.` },
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

      // O item 6.2 manda imprimir "os registros exibidos nas grades": o
      // relatório lê o extrato pelo mesmo caminho da tela — API da
      // instituição mais o que foi importado por arquivo.
      const { aMovimentos } = await leExtratoDaConta(oConta, sDataInicio, sDataFim);

      const aLancFiltrados = filtraPorStatus(aLancamentos, bLancConciliados, bLancNaoConciliados);
      const aMovFiltrados = filtraPorStatus(aMovimentos, bMovConciliados, bMovNaoConciliados);

      // Cada lado tem o seu par de chips; a descrição junta os dois quando o
      // escopo é "ambos" e mostra só o pertinente quando é um extrato isolado
      const sDescricaoStatus =
         sEscopo === ESCOPO_SISTEMA
            ? descreveFiltroStatus({ bConciliados: bLancConciliados, bNaoConciliados: bLancNaoConciliados })
            : sEscopo === ESCOPO_BANCO
              ? descreveFiltroStatus({ bConciliados: bMovConciliados, bNaoConciliados: bMovNaoConciliados })
              : `sistema — ${descreveFiltroStatus({ bConciliados: bLancConciliados, bNaoConciliados: bLancNaoConciliados })}; ` +
                `banco — ${descreveFiltroStatus({ bConciliados: bMovConciliados, bNaoConciliados: bMovNaoConciliados })}`;

      const oDados = {
         oConta,
         sEscopo,
         sDataInicio,
         sDataFim,
         aLancamentos: aLancFiltrados,
         aMovimentos: aMovFiltrados,
         nSaldoAnterior,
         sDataEmissao: formataDataBr(new Date()),
         oFiltros: {
            sDescricaoEscopo: ROTULOS_ESCOPO[sEscopo],
            sDescricaoStatus,
         },
      };

      await registraAuditoria({
         idConta: oConta.idConta,
         tipAcao: ACAO_EXPORTACAO,
         desEntidade: 'relatorio',
         codEntidade: `${sFormato.toUpperCase()}/${sEscopo}`,
         desDetalhe:
            `Relatório de conciliação exportado em ${sFormato.toUpperCase()} (${ROTULOS_ESCOPO[sEscopo]}): ` +
            `${aLancFiltrados.length} lançamento(s) e ${aMovFiltrados.length} movimento(s).`,
      });

      // ---------- Excel ----------
      if (sFormato === FORMATO_XLSX) {
         const oBuffer = await geraExcel(oDados);
         return new Response(oBuffer, {
            headers: {
               'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
               'Content-Disposition': `attachment; filename="${montaNomeArquivo(oConta, 'xlsx', sEscopo)}"`,
               'Cache-Control': 'no-store',
            },
         });
      }

      // ---------- CSV ----------
      if (sFormato === FORMATO_CSV) {
         return new Response(geraCsv(oDados), {
            headers: {
               'Content-Type': 'text/csv; charset=utf-8',
               'Content-Disposition': `attachment; filename="${montaNomeArquivo(oConta, 'csv', sEscopo)}"`,
               'Cache-Control': 'no-store',
            },
         });
      }

      // ---------- OFX ----------
      // Um arquivo OFX descreve UMA conta, então o escopo "ambos" não se
      // aplica: nesse caso sai o extrato do banco, que é o que a
      // contabilidade espera receber nesse formato.
      if (sFormato === FORMATO_OFX) {
         return new Response(geraOfx({ ...oDados, sEscopo: sEscopo === ESCOPO_AMBOS ? ESCOPO_BANCO : sEscopo }), {
            headers: {
               "Content-Type": "application/x-ofx; charset=utf-8",
               "Content-Disposition": `attachment; filename="${montaNomeArquivo(oConta, "ofx", sEscopo)}"`,
               "Cache-Control": "no-store",
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
