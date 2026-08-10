// ============================================================================
// autoMatchService.js - Regras da conciliação automática
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Implementa o botão "Conciliação automática" (item 6.1.3.3 do documento de
// visão): o sistema localiza Movimento/Lançamento idêntico e concilia.
// A busca ocorre em duas passadas:
//   1ª) correspondência 1-para-1 por valor, sentido e data;
//   2ª) agrupamento N-para-1, quando vários lançamentos do sistema somam
//       o valor de um único movimento do banco (e vice-versa).
//
// Módulo executado apenas no servidor (API Route) — não acessa o DOM.
// ============================================================================

import { encontraConjuntoPorSoma, converteParaCentavos } from '../utils/subsetSum.js';
import { comparaDatas } from '../utils/formatters.js';

/** Janela padrão, em dias, aceita entre a data do lançamento e a do banco */
export const JANELA_DIAS_PADRAO = 3;

/** Milissegundos em um dia, usado no cálculo da janela de datas */
const MILISSEGUNDOS_POR_DIA = 86400000;

/**
 * Calcula a diferença absoluta, em dias, entre duas datas DD/MM/AAAA.
 * @param {string} sDataA
 * @param {string} sDataB
 * @returns {number}
 */
function calculaDistanciaEmDias(sDataA, sDataB) {
   return Math.abs(comparaDatas(sDataA, sDataB)) / MILISSEGUNDOS_POR_DIA;
} // calculaDistanciaEmDias

/**
 * Verifica se dois movimentos são compatíveis para conciliação:
 * mesmo sentido (entrada/saída) e datas dentro da janela configurada.
 * @param {object} oLancamento Lançamento do sistema
 * @param {object} oMovimento Movimento do banco
 * @param {number} iJanelaDias
 * @returns {boolean}
 */
function saoCompativeis(oLancamento, oMovimento, iJanelaDias) {
   if (Boolean(oLancamento.bEntrada) !== Boolean(oMovimento.bEntrada)) {
      return false;
   }
   return calculaDistanciaEmDias(oLancamento.datMovimento, oMovimento.datMovimento) <= iJanelaDias;
} // saoCompativeis

/**
 * Monta o objeto que representa uma correspondência encontrada.
 * @param {Array<object>} aLancamentos Lançamentos do sistema envolvidos
 * @param {Array<object>} aMovimentos Movimentos do banco envolvidos
 * @param {string} sTipo Identificador da regra aplicada
 * @returns {object}
 */
function montaGrupo(aLancamentos, aMovimentos, sTipo) {
   const nValorGrupo = aLancamentos.reduce((nSoma, oItem) => nSoma + oItem.valMovimento, 0);
   return {
      tipCorrespondencia: sTipo,
      aCodLancamentos: aLancamentos.map((oItem) => oItem.codLancamento),
      aCodMovimentos: aMovimentos.map((oItem) => oItem.codMovimento),
      valGrupo: nValorGrupo,
      bEntrada: Boolean(aMovimentos[0]?.bEntrada),
   };
} // montaGrupo

/**
 * Executa a conciliação automática entre os lançamentos do sistema e os
 * movimentos do banco ainda não conciliados.
 *
 * @param {Array<object>} aLancamentos Lançamentos do sistema
 * @param {Array<object>} aMovimentos Movimentos do extrato bancário
 * @param {object} [oOpcoes]
 * @param {number} [oOpcoes.iJanelaDias] Tolerância de dias entre as datas
 * @returns {{ aGrupos: Array<object>, iGrupos: number, iLancamentosConciliados: number, iMovimentosConciliados: number }}
 */
export function executaConciliacaoAutomatica(aLancamentos, aMovimentos, oOpcoes = {}) {
   const iJanelaDias = oOpcoes.iJanelaDias ?? JANELA_DIAS_PADRAO;

   // Trabalha apenas sobre o que ainda está pendente de conciliação
   const aLancPendentes = (aLancamentos ?? []).filter((oItem) => !oItem.staConciliado);
   const aMovPendentes = (aMovimentos ?? []).filter((oItem) => !oItem.staConciliado);

   const oLancUsados = new Set();
   const oMovUsados = new Set();
   const aGrupos = [];

   // ---------- 1ª passada: correspondência exata 1-para-1 ----------
   // Percorrida antes do agrupamento porque é a conciliação preferencial.
   for (const oMovimento of aMovPendentes) {
      if (oMovUsados.has(oMovimento.codMovimento)) {
         continue;
      }

      const oLancamento = aLancPendentes.find((oItem) => {
         if (oLancUsados.has(oItem.codLancamento)) {
            return false;
         }
         if (converteParaCentavos(oItem.valMovimento) !== converteParaCentavos(oMovimento.valMovimento)) {
            return false;
         }
         return saoCompativeis(oItem, oMovimento, iJanelaDias);
      });

      if (oLancamento) {
         oLancUsados.add(oLancamento.codLancamento);
         oMovUsados.add(oMovimento.codMovimento);
         aGrupos.push(montaGrupo([oLancamento], [oMovimento], 'EXATA'));
      }
   }

   // ---------- 2ª passada: agrupamento N lançamentos -> 1 movimento ----------
   for (const oMovimento of aMovPendentes) {
      if (oMovUsados.has(oMovimento.codMovimento)) {
         continue;
      }

      const aCandidatos = aLancPendentes.filter(
         (oItem) => !oLancUsados.has(oItem.codLancamento) && saoCompativeis(oItem, oMovimento, iJanelaDias)
      );

      if (aCandidatos.length < 2) {
         continue;
      }

      const aConjunto = encontraConjuntoPorSoma(aCandidatos, oMovimento.valMovimento, {
         obtemValor: (oItem) => oItem.valMovimento,
      });

      // Conjuntos de um único item já teriam sido resolvidos na 1ª passada
      if (aConjunto && aConjunto.length > 1) {
         aConjunto.forEach((oItem) => oLancUsados.add(oItem.codLancamento));
         oMovUsados.add(oMovimento.codMovimento);
         aGrupos.push(montaGrupo(aConjunto, [oMovimento], 'AGRUPADA'));
      }
   }

   return {
      aGrupos,
      iGrupos: aGrupos.length,
      iLancamentosConciliados: oLancUsados.size,
      iMovimentosConciliados: oMovUsados.size,
   };
} // executaConciliacaoAutomatica

/**
 * Sugere os lançamentos do sistema que correspondem a um movimento do banco.
 * Alimenta a ação "Buscar e associar lançamentos" (2ª parte da conciliação).
 *
 * @param {object} oMovimento Movimento do banco selecionado
 * @param {Array<object>} aCandidatos Títulos ou lançamentos disponíveis
 * @param {(item: object) => number} [fnObtemValor] Extrator do valor
 * @returns {Array<object>} Conjunto sugerido (vazio quando não há correspondência)
 */
export function sugereAssociacao(oMovimento, aCandidatos, fnObtemValor = (oItem) => oItem.valTitulo) {
   if (!oMovimento) {
      return [];
   }
   const aConjunto = encontraConjuntoPorSoma(aCandidatos, oMovimento.valMovimento, {
      obtemValor: fnObtemValor,
   });
   return aConjunto ?? [];
} // sugereAssociacao
