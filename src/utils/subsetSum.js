// ============================================================================
// subsetSum.js - Identificação de conjuntos de lançamentos por somatória
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Resolve o problema descrito na ata de 28/04/2026: identificar o conjunto de
// lançamentos de um extrato que, somados, correspondem ao valor de um
// lançamento específico do outro extrato.
//
// Os valores são convertidos para centavos (inteiros) antes do processamento,
// evitando os erros de arredondamento do ponto flutuante em comparações de
// igualdade — requisito da regra "não é permitido conciliar valores divergentes".
// ============================================================================

/** Tolerância padrão da comparação, em centavos (0 = igualdade exata) */
export const TOLERANCIA_CENTAVOS = 0;

/** Limite de combinações avaliadas por tamanho, evitando travar a interface */
export const LIMITE_COMBINACOES = 200000;

/** Quantidade máxima de lançamentos agrupados em uma única correspondência */
export const TAMANHO_MAXIMO_CONJUNTO = 6;

/**
 * Converte um valor monetário em centavos inteiros.
 * @param {number} nValor
 * @returns {number}
 */
export function converteParaCentavos(nValor) {
   return Math.round((nValor ?? 0) * 100);
}

/**
 * Prepara a lista de candidatos: descarta valores nulos e ordena de forma
 * decrescente, o que antecipa as podas da busca.
 * @param {Array<object>} aItens
 * @param {(item: object) => number} fnObtemValor
 * @returns {Array<{ oItem: object, iValor: number }>}
 */
function preparaCandidatos(aItens, fnObtemValor) {
   return aItens
      .map((oItem) => ({ oItem, iValor: converteParaCentavos(fnObtemValor(oItem)) }))
      .filter((oCandidato) => oCandidato.iValor > 0)
      .sort((oA, oB) => oB.iValor - oA.iValor);
} // preparaCandidatos

/**
 * Percorre as combinações de tamanho exato buscando a soma alvo.
 * @param {object} oContexto Estado compartilhado da busca
 * @param {number} iPosicao Índice atual na lista de candidatos
 * @param {number} iSomaAtual Soma acumulada no caminho, em centavos
 * @param {Array<object>} aSelecionados Itens escolhidos até aqui
 * @returns {boolean} true quando encontra um conjunto válido
 */
function percorreCombinacoes(oContexto, iPosicao, iSomaAtual, aSelecionados) {
   const { aCandidatos, aSomaRestante, iAlvo, iTolerancia, iTamanhoAlvo } = oContexto;

   oContexto.iAvaliadas += 1;
   if (oContexto.iAvaliadas > LIMITE_COMBINACOES) {
      return false;
   }

   // Conjunto completo: só é válido se a diferença estiver dentro da tolerância
   if (aSelecionados.length === iTamanhoAlvo) {
      if (Math.abs(iAlvo - iSomaAtual) <= iTolerancia) {
         oContexto.aResultado = aSelecionados.slice();
         return true;
      }
      return false;
   }

   // Podas: soma já estourou o alvo, lista esgotada, ou o restante
   // disponível não é suficiente para alcançar o valor procurado
   if (iSomaAtual > iAlvo + iTolerancia || iPosicao >= aCandidatos.length) {
      return false;
   }
   if (iSomaAtual + aSomaRestante[iPosicao] < iAlvo - iTolerancia) {
      return false;
   }

   for (let iPos = iPosicao; iPos < aCandidatos.length; iPos += 1) {
      // Evita percorrer ramos idênticos quando existem valores repetidos
      if (iPos > iPosicao && aCandidatos[iPos].iValor === aCandidatos[iPos - 1].iValor) {
         continue;
      }

      aSelecionados.push(aCandidatos[iPos].oItem);
      if (percorreCombinacoes(oContexto, iPos + 1, iSomaAtual + aCandidatos[iPos].iValor, aSelecionados)) {
         return true;
      }
      aSelecionados.pop();
   }

   return false;
} // percorreCombinacoes

/**
 * Localiza o menor conjunto de itens cuja soma corresponde ao valor alvo.
 *
 * A busca é feita por tamanho crescente (1 item, depois 2, e assim por diante),
 * porque a correspondência 1-para-1 é sempre a conciliação preferencial.
 *
 * @param {Array<object>} aItens Lista de candidatos
 * @param {number} nValorAlvo Valor que deve ser atingido pela soma
 * @param {object} [oOpcoes]
 * @param {(item: object) => number} [oOpcoes.obtemValor] Extrator do valor do item
 * @param {number} [oOpcoes.iTamanhoMaximo] Máximo de itens no conjunto
 * @param {number} [oOpcoes.iToleranciaCentavos] Diferença aceita, em centavos
 * @returns {Array<object>|null} Itens que somam o alvo, ou null se não houver
 */
export function encontraConjuntoPorSoma(aItens, nValorAlvo, oOpcoes = {}) {
   const fnObtemValor = oOpcoes.obtemValor ?? ((oItem) => oItem.valor);
   const iTamanhoMaximo = oOpcoes.iTamanhoMaximo ?? TAMANHO_MAXIMO_CONJUNTO;
   const iTolerancia = oOpcoes.iToleranciaCentavos ?? TOLERANCIA_CENTAVOS;
   const iAlvo = converteParaCentavos(nValorAlvo);

   if (!Array.isArray(aItens) || aItens.length === 0 || iAlvo <= 0) {
      return null;
   }

   const aCandidatos = preparaCandidatos(aItens, fnObtemValor);
   if (aCandidatos.length === 0) {
      return null;
   }

   // Somas acumuladas a partir de cada posição, consultadas nas podas
   const aSomaRestante = new Array(aCandidatos.length + 1).fill(0);
   for (let iPos = aCandidatos.length - 1; iPos >= 0; iPos -= 1) {
      aSomaRestante[iPos] = aSomaRestante[iPos + 1] + aCandidatos[iPos].iValor;
   }

   const iLimiteTamanho = Math.min(iTamanhoMaximo, aCandidatos.length);

   for (let iTamanho = 1; iTamanho <= iLimiteTamanho; iTamanho += 1) {
      const oContexto = {
         aCandidatos,
         aSomaRestante,
         iAlvo,
         iTolerancia,
         iTamanhoAlvo: iTamanho,
         iAvaliadas: 0,
         aResultado: null,
      };

      if (percorreCombinacoes(oContexto, 0, 0, [])) {
         return oContexto.aResultado;
      }
   }

   return null;
} // encontraConjuntoPorSoma

/**
 * Verifica se um conjunto de itens soma exatamente o valor alvo.
 * @param {Array<object>} aItens
 * @param {number} nValorAlvo
 * @param {(item: object) => number} [fnObtemValor]
 * @returns {boolean}
 */
export function conjuntoSomaValor(aItens, nValorAlvo, fnObtemValor = (oItem) => oItem.valor) {
   const iSoma = (aItens ?? []).reduce(
      (iAcumulado, oItem) => iAcumulado + converteParaCentavos(fnObtemValor(oItem)),
      0
   );
   return iSoma === converteParaCentavos(nValorAlvo);
} // conjuntoSomaValor

/**
 * Calcula a diferença, em reais, entre duas somatórias de seleção.
 * Alimenta o campo "Diferença" da tela — a conciliação só é permitida
 * quando o resultado é zero (item 6.1.3.6 do documento de visão).
 * @param {number} nTotalSistema
 * @param {number} nTotalBanco
 * @returns {number}
 */
export function calculaDiferenca(nTotalSistema, nTotalBanco) {
   const iDiferenca = converteParaCentavos(nTotalSistema) - converteParaCentavos(nTotalBanco);
   return iDiferenca / 100;
} // calculaDiferenca
