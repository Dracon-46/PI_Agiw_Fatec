// ============================================================================
// api/conciliacao/conciliar - Gravação do status de conciliação
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Atende os itens 6.1.3.6 (Conciliar) e 6.1.3.7 (Desfazer Conciliação):
// a diferença entre as somatórias selecionadas deve ser zero; só então o
// status SIM/NÃO é gravado nos lançamentos e movimentos escolhidos.
//
// Segue a orientação do padrão de programação para transações:
//   - todas as validações ocorrem ANTES de iniciar a gravação;
//   - a mensagem de sucesso é montada somente após a conclusão.
// ============================================================================

import { NextResponse } from 'next/server';
import { buscaContaPorCodigo } from '../../../../lib/repositories/contaRepository.js';
import {
   atualizaStatusLancamentos,
   geraProximoNumSeqConc,
   listaDatasLancamentos,
} from '../../../../lib/repositories/lancamentoRepository.js';
import {
   atualizaStatusMovimentos,
   listaDatasMovimentos,
} from '../../../../lib/repositories/movimentoRepository.js';
import { dataBrParaSql } from '../../../../lib/db.js';
import {
   ACAO_CONCILIACAO,
   ACAO_CONCILIACAO_AUTOMATICA,
   ACAO_ESTORNO,
   registraAuditoria,
} from '../../../../lib/repositories/auditoriaRepository.js';
import { calculaDiferenca } from '../../../../utils/subsetSum.js';

export const dynamic = 'force-dynamic';

/**
 * Soma o valor líquido (entradas menos saídas) de uma lista de registros.
 * @param {Array<{ valMovimento: number, bEntrada: boolean }>} aItens
 * @returns {number}
 */
function somaLiquido(aItens) {
   return (aItens ?? []).reduce(
      (nSoma, oItem) => (oItem.bEntrada ? nSoma + Number(oItem.valMovimento) : nSoma - Number(oItem.valMovimento)),
      0
   );
} // somaLiquido

/**
 * Localiza registros em período já bloqueado (item 6.1.3.1).
 *
 * O bloqueio fecha o período: conciliar ou estornar ali mudaria o resultado de
 * um mês já encerrado, tanto quanto lançar. Por isso a trava vale para as duas
 * operações — conciliar e desfazer.
 *
 * As datas são lidas da base, e não do corpo da requisição: quem grava não
 * pode aceitar a data que o navegador informou.
 *
 * @param {object} oConta Conta com datUltimoBloqueio
 * @param {string[]} aCodLancamentos
 * @param {string[]} aCodMovimentos
 * @returns {Promise<{ sMensagem: string, aRegistros: string[] }>}
 */
async function verificaPeriodoBloqueado(oConta, aCodLancamentos, aCodMovimentos) {
   if (!oConta.datUltimoBloqueio) {
      return { sMensagem: '', aRegistros: [] };
   }

   const sBloqueio = dataBrParaSql(oConta.datUltimoBloqueio);
   if (!sBloqueio) {
      return { sMensagem: '', aRegistros: [] };
   }

   const [aDatasLanc, aDatasMov] = await Promise.all([
      listaDatasLancamentos(oConta, aCodLancamentos),
      listaDatasMovimentos(oConta, aCodMovimentos),
   ]);

   const aBloqueados = [
      ...aDatasLanc.map((oItem) => ({ sCodigo: oItem.codLancamento, sData: oItem.datMovimento })),
      ...aDatasMov.map((oItem) => ({ sCodigo: oItem.codMovimento, sData: oItem.datMovimento })),
   ].filter((oItem) => {
      const sDataSql = dataBrParaSql(oItem.sData);
      return sDataSql && sDataSql <= sBloqueio;
   });

   if (aBloqueados.length === 0) {
      return { sMensagem: '', aRegistros: [] };
   }

   const aRegistros = aBloqueados.map((oItem) => `${oItem.sCodigo} (${oItem.sData})`);

   return {
      sMensagem:
         `A conta está bloqueada para lançamentos até ${oConta.datUltimoBloqueio} e ` +
         `${aBloqueados.length} registro(s) da seleção estão nesse período: ` +
         `${aRegistros.slice(0, 5).join(', ')}` +
         (aRegistros.length > 5 ? ` e mais ${aRegistros.length - 5}.` : '.') +
         ' Remova o bloqueio ou retire esses registros da seleção.',
      aRegistros,
   };
} // verificaPeriodoBloqueado

/**
 * POST /api/conciliacao/conciliar
 * Corpo: {
 *   conta, bConciliado, automatica?,
 *   lancamentos: [{ codLancamento, valMovimento, bEntrada }],
 *   movimentos:  [{ codMovimento,  valMovimento, bEntrada }]
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
   const aLancamentos = Array.isArray(oCorpo?.lancamentos) ? oCorpo.lancamentos : [];
   const aMovimentos = Array.isArray(oCorpo?.movimentos) ? oCorpo.movimentos : [];
   const bConciliado = Boolean(oCorpo?.bConciliado);
   const bAutomatica = Boolean(oCorpo?.automatica);

   // ---------- Validações (fora da gravação) ----------
   if (!sCodConta) {
      return NextResponse.json({ erro: 'Selecione a conta corrente.' }, { status: 400 });
   }
   if (aLancamentos.length === 0 && aMovimentos.length === 0) {
      return NextResponse.json(
         { erro: 'Selecione os registros que deseja conciliar ou estornar.' },
         { status: 400 }
      );
   }

   // A conciliação automática já trabalha com pares equivalentes; na operação
   // manual a diferença precisa ser conferida antes de gravar
   if (!bAutomatica) {
      const nDiferenca = calculaDiferenca(somaLiquido(aLancamentos), somaLiquido(aMovimentos));
      if (nDiferenca !== 0) {
         return NextResponse.json(
            {
               erro:
                  'A diferença entre as somatórias selecionadas deve ser zero para ' +
                  `${bConciliado ? 'conciliar' : 'estornar'}. Diferença atual: ${nDiferenca.toFixed(2)}.`,
               valDiferenca: nDiferenca,
            },
            { status: 409 }
         );
      }
   }

   try {
      const oConta = await buscaContaPorCodigo(sCodConta);
      if (!oConta) {
         return NextResponse.json({ erro: `Conta "${sCodConta}" não localizada.` }, { status: 404 });
      }

      // Item 6.1.3.1: o período fechado também recusa conciliação e estorno
      const oBloqueio = await verificaPeriodoBloqueado(
         oConta,
         aLancamentos.map((oItem) => oItem.codLancamento),
         aMovimentos.map((oItem) => oItem.codMovimento)
      );
      if (oBloqueio.sMensagem) {
         return NextResponse.json(
            { erro: oBloqueio.sMensagem, aRegistrosBloqueados: oBloqueio.aRegistros },
            { status: 409 }
         );
      }

      // ---------- Gravação ----------
      // A sequência de conciliação (NUMSEQCONC) é o que amarra o grupo: todos
      // os registros selecionados, dos DOIS lados, recebem a mesma. É ela que
      // permite ao ERP reconstituir depois o que foi conciliado junto — e é
      // por isso que é gerada uma única vez, aqui, e não em cada repositório.
      const oOpcoes = {
         sNumSeqConc: bConciliado ? await geraProximoNumSeqConc() : null,
         bAutomatica,
      };

      const iLancAtualizados = await atualizaStatusLancamentos(
         oConta,
         aLancamentos.map((oItem) => oItem.codLancamento),
         bConciliado,
         oOpcoes
      );
      const iMovAtualizados = await atualizaStatusMovimentos(
         oConta,
         aMovimentos.map((oItem) => oItem.codMovimento),
         bConciliado,
         oOpcoes
      );

      const nValorConciliado = Math.abs(somaLiquido(aMovimentos.length > 0 ? aMovimentos : aLancamentos));
      const sTipAcao = bAutomatica
         ? ACAO_CONCILIACAO_AUTOMATICA
         : bConciliado
           ? ACAO_CONCILIACAO
           : ACAO_ESTORNO;

      await registraAuditoria({
         oConta,
         tipAcao: sTipAcao,
         desEntidade: 'conciliacao',
         codEntidade: aMovimentos[0]?.codMovimento ?? aLancamentos[0]?.codLancamento ?? null,
         desDetalhe:
            `${bConciliado ? 'Conciliação' : 'Estorno'}${bAutomatica ? ' automática' : ' manual'}: ` +
            `${iLancAtualizados} lançamento(s) e ${iMovAtualizados} movimento(s) atualizados.`,
         valReferencia: formataValorAuditoria(nValorConciliado),
      });

      return NextResponse.json({
         ok: true,
         iLancamentosAtualizados: iLancAtualizados,
         iMovimentosAtualizados: iMovAtualizados,
         mensagem: bConciliado
            ? `Conciliação gravada: ${iLancAtualizados} lançamento(s) e ${iMovAtualizados} movimento(s).`
            : `Conciliação estornada: ${iLancAtualizados} lançamento(s) e ${iMovAtualizados} movimento(s) voltaram para "Não Conciliado".`,
      });
   } catch (oErro) {
      console.error('[api/conciliacao/conciliar] Falha ao gravar:', oErro);
      return NextResponse.json({ erro: oErro.message }, { status: 500 });
   }
} // POST

/**
 * Protege o campo de auditoria contra valores não numéricos.
 * @param {number} nValor
 * @returns {number|null}
 */
function formataValorAuditoria(nValor) {
   return Number.isFinite(nValor) ? Number(nValor.toFixed(2)) : null;
}
