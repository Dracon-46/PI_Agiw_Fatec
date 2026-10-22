// ============================================================================
// rateio.js - Rateio do valor do lançamento por centro de custo
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Ata de 24/09/2026: "Implementar rateio de valor por Centro de Custo" e "Uma
// transferência pode ter mais de um Centro de Custo".
//
// O rateio é gravado em TBCONB003 (uma linha por centro de custo, com o valor
// da parcela em VALMOVTOCCUSTO). As mesmas regras valem na tela e na rota —
// a tela avisa antes, a rota garante.
// ============================================================================

import { converteParaCentavos } from './subsetSum.js';

/**
 * Normaliza as linhas de rateio vindas da tela ou da API.
 * Linhas sem centro de custo e sem valor são descartadas.
 * @param {Array<object>} aRateio
 * @returns {Array<{ codCentroCusto: string, valRateio: number }>}
 */
export function normalizaRateio(aRateio) {
   return (Array.isArray(aRateio) ? aRateio : [])
      .map((oLinha) => ({
         codCentroCusto: String(oLinha?.codCentroCusto ?? '').trim(),
         valRateio: Number(oLinha?.valRateio) || 0,
      }))
      .filter((oLinha) => oLinha.codCentroCusto || oLinha.valRateio !== 0);
} // normalizaRateio

/**
 * Soma o rateio, em reais.
 * @param {Array<{ valRateio: number }>} aRateio
 * @returns {number}
 */
export function somaRateio(aRateio) {
   const iCentavos = (aRateio ?? []).reduce((iSoma, oLinha) => iSoma + converteParaCentavos(oLinha.valRateio), 0);
   return iCentavos / 100;
} // somaRateio

/**
 * Valida o rateio contra o valor do lançamento.
 *
 * Rateio vazio é aceito: o centro de custo é opcional no ERP. Informado, ele
 * precisa fechar exatamente no valor do lançamento — a comparação é feita em
 * centavos, como em toda a conciliação.
 *
 * @param {Array<object>} aRateio Linhas já normalizadas
 * @param {number} nValorLancamento
 * @returns {string} Mensagem de erro, ou string vazia
 */
export function validaRateio(aRateio, nValorLancamento) {
   if (!aRateio || aRateio.length === 0) {
      return '';
   }

   const oVistos = new Set();
   for (const oLinha of aRateio) {
      if (!oLinha.codCentroCusto) {
         return 'Informe o centro de custo de todas as linhas do rateio.';
      }
      if (!(oLinha.valRateio > 0)) {
         return `O valor rateado para o centro de custo ${oLinha.codCentroCusto} deve ser maior que zero.`;
      }
      if (oVistos.has(oLinha.codCentroCusto)) {
         return `O centro de custo ${oLinha.codCentroCusto} aparece mais de uma vez no rateio.`;
      }
      oVistos.add(oLinha.codCentroCusto);
   }

   const iDiferenca = converteParaCentavos(nValorLancamento) - converteParaCentavos(somaRateio(aRateio));
   if (iDiferenca !== 0) {
      return (
         `O rateio por centro de custo soma ${somaRateio(aRateio).toFixed(2)} e o lançamento é de ` +
         `${Number(nValorLancamento).toFixed(2)}. A diferença de ${(iDiferenca / 100).toFixed(2)} precisa ser distribuída.`
      );
   }

   return '';
} // validaRateio
