// ============================================================================
// autoMatchService.js - Regras da conciliação automática
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Implementa o botão "Conciliação automática" (item 6.1.3.3 do documento de
// visão): o sistema localiza Movimento/Lançamento idêntico e concilia.
// A busca ocorre em quatro passadas, da correspondência mais forte para a mais
// fraca — cada registro casado sai das seguintes:
//   1ª) 1-para-1 exata, por valor, sentido e data;
//   2ª) N-para-1: vários lançamentos do ERP somam um movimento do banco;
//   3ª) 1-para-N: um lançamento do ERP corresponde a vários movimentos;
//   4ª) N-para-N: os dois lados são conjuntos e as somas batem.
//
// Os agrupamentos usam `buscaConjuntoPorSoma` (até 10 lançamentos por grupo).
// A execução inteira tem um prazo (LIMITE_TEMPO_TOTAL_MS): a rota roda no
// mesmo processo que atende as demais requisições, e uma busca sem fim
// travaria o servidor para todos. Buscas interrompidas pelo prazo são
// contadas e devolvidas, para a tela avisar que pode haver grupo não testado.
//
// Módulo executado apenas no servidor (API Route) — não acessa o DOM.
// ============================================================================

import { PRAZO_PADRAO_MS, buscaConjuntoPorSoma, converteParaCentavos } from '../utils/subsetSum.js';
import { comparaDatas } from '../utils/formatters.js';

/** Janela padrão, em dias, aceita entre a data do lançamento e a do banco */
export const JANELA_DIAS_PADRAO = 3;

/** Tempo máximo, em milissegundos, de uma execução da conciliação automática */
export const LIMITE_TEMPO_TOTAL_MS = 15000;

/**
 * Busca um conjunto respeitando o prazo da execução e registrando no
 * contexto quando a busca foi interrompida.
 * @param {object} oPrazo { nFim, iInterrompidas }
 * @param {Array<object>} aCandidatos
 * @param {number} nAlvo
 * @returns {Array<object>|null}
 */
function buscaComPrazo(oPrazo, aCandidatos, nAlvo) {
   const nAgora = performance.now();
   if (nAgora >= oPrazo.nFim) {
      oPrazo.iInterrompidas += 1;
      return null;
   }

   const { aConjunto, bTruncado } = buscaConjuntoPorSoma(aCandidatos, nAlvo, {
      obtemValor: (oItem) => oItem.valMovimento,
      nPrazo: Math.min(nAgora + PRAZO_PADRAO_MS, oPrazo.nFim),
   });
   if (bTruncado) {
      oPrazo.iInterrompidas += 1;
   }
   return aConjunto;
} // buscaComPrazo

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

/** Máximo de registros agrupados no mesmo lado em uma correspondência N:N */
export const TAMANHO_MAXIMO_LADO = 4;

/** Teto de combinações avaliadas na busca N:N, para não travar a requisição */
const LIMITE_COMBINACOES_NN = 20000;

/**
 * Gera as combinações de tamanho exato de uma lista, respeitando um teto.
 * @param {Array<object>} aItens
 * @param {number} iTamanho
 * @param {number} iLimite Máximo de combinações devolvidas
 * @returns {Array<Array<object>>}
 */
function geraCombinacoes(aItens, iTamanho, iLimite) {
   const aResultado = [];
   const aAtual = [];

   const percorre = (iPosicao) => {
      if (aResultado.length >= iLimite) {
         return;
      }
      if (aAtual.length === iTamanho) {
         aResultado.push(aAtual.slice());
         return;
      }
      for (let iPos = iPosicao; iPos < aItens.length; iPos += 1) {
         aAtual.push(aItens[iPos]);
         percorre(iPos + 1);
         aAtual.pop();
         if (aResultado.length >= iLimite) {
            return;
         }
      }
   };

   percorre(0);
   return aResultado;
} // geraCombinacoes

/**
 * Soma o valor de uma lista, em centavos.
 * @param {Array<object>} aItens
 * @returns {number}
 */
function somaCentavos(aItens) {
   return aItens.reduce((iSoma, oItem) => iSoma + converteParaCentavos(oItem.valMovimento), 0);
} // somaCentavos

/**
 * Localiza correspondências em que os DOIS lados são conjuntos.
 *
 * É o que sobra depois das passadas anteriores: vários lançamentos no ERP que
 * o banco liquidou em vários movimentos, sem que nenhum lado seja explicado
 * por um único registro do outro — três notas pagas em duas transferências,
 * por exemplo.
 *
 * A busca combina os movimentos de dois a TAMANHO_MAXIMO_LADO e, para cada
 * soma, procura o conjunto de lançamentos que a fecha. Conjunto de um item só
 * em qualquer lado já foi resolvido antes, então aqui os dois têm ao menos
 * dois registros.
 *
 * @param {object} oContexto
 * @returns {Array<object>} Grupos localizados
 */
function casaConjuntoComConjunto({ aLancPendentes, aMovPendentes, oLancUsados, oMovUsados, iJanelaDias, oPrazo }) {
   const aGrupos = [];
   let iAvaliadas = 0;

   for (let iTamanho = 2; iTamanho <= TAMANHO_MAXIMO_LADO; iTamanho += 1) {
      const aMovLivres = aMovPendentes.filter((oItem) => !oMovUsados.has(oItem.codMovimento));
      if (aMovLivres.length < iTamanho) {
         break;
      }

      for (const aConjuntoMov of geraCombinacoes(aMovLivres, iTamanho, LIMITE_COMBINACOES_NN)) {
         if (iAvaliadas >= LIMITE_COMBINACOES_NN || performance.now() >= oPrazo.nFim) {
            return aGrupos;
         }
         iAvaliadas += 1;

         // Um item pode ter sido consumido por uma combinação anterior
         if (aConjuntoMov.some((oItem) => oMovUsados.has(oItem.codMovimento))) {
            continue;
         }

         // Todo o conjunto precisa ter o mesmo sentido: misturar entrada com
         // saída faria a soma fechar por compensação, não por correspondência
         const bEntrada = Boolean(aConjuntoMov[0].bEntrada);
         if (aConjuntoMov.some((oItem) => Boolean(oItem.bEntrada) !== bEntrada)) {
            continue;
         }

         const aCandidatos = aLancPendentes.filter(
            (oLancamento) =>
               !oLancUsados.has(oLancamento.codLancamento) &&
               Boolean(oLancamento.bEntrada) === bEntrada &&
               aConjuntoMov.some((oMovimento) => saoCompativeis(oLancamento, oMovimento, iJanelaDias))
         );

         if (aCandidatos.length < 2) {
            continue;
         }

         const aConjuntoLanc = buscaComPrazo(oPrazo, aCandidatos, somaCentavos(aConjuntoMov) / 100);

         // Um lançamento sozinho fechando N movimentos é a 3ª passada
         if (!aConjuntoLanc || aConjuntoLanc.length < 2) {
            continue;
         }

         aConjuntoLanc.forEach((oItem) => oLancUsados.add(oItem.codLancamento));
         aConjuntoMov.forEach((oItem) => oMovUsados.add(oItem.codMovimento));
         aGrupos.push(montaGrupo(aConjuntoLanc, aConjuntoMov, 'AGRUPADA_NN'));
      }
   }

   return aGrupos;
} // casaConjuntoComConjunto

/**
 * Executa a conciliação automática entre os lançamentos do sistema e os
 * movimentos do banco ainda não conciliados.
 *
 * @param {Array<object>} aLancamentos Lançamentos do sistema
 * @param {Array<object>} aMovimentos Movimentos do extrato bancário
 * @param {object} [oOpcoes]
 * @param {number} [oOpcoes.iJanelaDias] Tolerância de dias entre as datas
 * @returns {{ aGrupos: Array<object>, iGrupos: number, iLancamentosConciliados: number,
 *             iMovimentosConciliados: number, iBuscasInterrompidas: number }}
 */
export function executaConciliacaoAutomatica(aLancamentos, aMovimentos, oOpcoes = {}) {
   const iJanelaDias = oOpcoes.iJanelaDias ?? JANELA_DIAS_PADRAO;
   const oPrazo = { nFim: performance.now() + LIMITE_TEMPO_TOTAL_MS, iInterrompidas: 0 };

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

      const aConjunto = buscaComPrazo(oPrazo, aCandidatos, oMovimento.valMovimento);

      // Conjuntos de um único item já teriam sido resolvidos na 1ª passada
      if (aConjunto && aConjunto.length > 1) {
         aConjunto.forEach((oItem) => oLancUsados.add(oItem.codLancamento));
         oMovUsados.add(oMovimento.codMovimento);
         aGrupos.push(montaGrupo(aConjunto, [oMovimento], 'AGRUPADA'));
      }
   }

   // ---------- 3ª passada: 1 lançamento -> N movimentos ----------
   // O espelho da 2ª: uma única despesa no ERP que o banco debitou em parcelas.
   for (const oLancamento of aLancPendentes) {
      if (oLancUsados.has(oLancamento.codLancamento)) {
         continue;
      }

      const aCandidatos = aMovPendentes.filter(
         (oItem) => !oMovUsados.has(oItem.codMovimento) && saoCompativeis(oLancamento, oItem, iJanelaDias)
      );

      if (aCandidatos.length < 2) {
         continue;
      }

      const aConjunto = buscaComPrazo(oPrazo, aCandidatos, oLancamento.valMovimento);

      if (aConjunto && aConjunto.length > 1) {
         aConjunto.forEach((oItem) => oMovUsados.add(oItem.codMovimento));
         oLancUsados.add(oLancamento.codLancamento);
         aGrupos.push(montaGrupo([oLancamento], aConjunto, 'AGRUPADA'));
      }
   }

   // ---------- 4ª passada: N lançamentos -> N movimentos ----------
   aGrupos.push(
      ...casaConjuntoComConjunto({
         aLancPendentes,
         aMovPendentes,
         oLancUsados,
         oMovUsados,
         iJanelaDias,
         oPrazo,
      })
   );

   return {
      aGrupos,
      iGrupos: aGrupos.length,
      iLancamentosConciliados: oLancUsados.size,
      iMovimentosConciliados: oMovUsados.size,
      iBuscasInterrompidas: oPrazo.iInterrompidas,
   };
} // executaConciliacaoAutomatica
