// ============================================================================
// formatters.js - Funções utilitárias de formatação e datas
// Projeto Banco - Ticket 37060 | Agiw Sistemas
// Padrão de nomenclatura conforme "Padrao Programacao.pdf" (notação húngara)
// ============================================================================

/** Quantidade de casas decimais usada em valores totais (padrão Agiw) */
export const CASAS_DECIMAIS_VALOR = 2;

/** Data padrão do Delphi quando o campo não está preenchido */
export const DATA_NULA_DELPHI = '30/12/1899';

// ---------------------------------------------------------------------------
// Moeda e valores
// ---------------------------------------------------------------------------

/**
 * Formata valor monetário em Real brasileiro.
 * @param {number|null|undefined} nValor
 * @returns {string} Ex.: "R$ 1.250,00"
 */
export function formataMoeda(nValor) {
   if (nValor === null || nValor === undefined || Number.isNaN(nValor)) {
      return '—';
   }
   return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: CASAS_DECIMAIS_VALOR,
      maximumFractionDigits: CASAS_DECIMAIS_VALOR,
   }).format(nValor);
}

/**
 * Formata valor numérico sem o símbolo da moeda.
 * @param {number|null|undefined} nValor
 * @returns {string} Ex.: "1.250,00"
 */
export function formataValor(nValor) {
   if (nValor === null || nValor === undefined || Number.isNaN(nValor)) {
      return '—';
   }
   return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: CASAS_DECIMAIS_VALOR,
      maximumFractionDigits: CASAS_DECIMAIS_VALOR,
   }).format(nValor);
}

/**
 * Converte texto digitado pelo usuário (pt-BR) em número.
 * @param {string|number} sTexto
 * @returns {number} 0 quando não for possível converter
 */
export function converteTextoParaValor(sTexto) {
   if (typeof sTexto === 'number') {
      return Number.isNaN(sTexto) ? 0 : sTexto;
   }
   if (!sTexto) {
      return 0;
   }
   const sLimpo = String(sTexto)
      .replace(/[^\d,.-]/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
   const nValor = parseFloat(sLimpo);
   return Number.isNaN(nValor) ? 0 : nValor;
}

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

/**
 * Converte data no formato DD/MM/AAAA para o formato ISO AAAA-MM-DD,
 * usado pelos inputs nativos do tipo "date".
 * @param {string} sDataBr
 * @returns {string} String vazia quando a data for inválida
 */
export function converteDataBrParaIso(sDataBr) {
   if (!sDataBr) {
      return '';
   }
   const aPartes = String(sDataBr).split('/');
   if (aPartes.length !== 3) {
      return '';
   }
   const [sDia, sMes, sAno] = aPartes;
   return `${sAno}-${sMes.padStart(2, '0')}-${sDia.padStart(2, '0')}`;
}

/**
 * Converte data ISO (AAAA-MM-DD) para o formato brasileiro DD/MM/AAAA.
 * @param {string} sDataIso
 * @returns {string} String vazia quando a data for inválida
 */
export function converteIsoParaDataBr(sDataIso) {
   if (!sDataIso) {
      return '';
   }
   const aPartes = String(sDataIso).split('-');
   if (aPartes.length !== 3) {
      return '';
   }
   const [sAno, sMes, sDia] = aPartes;
   return `${sDia}/${sMes}/${sAno}`;
}

/**
 * Converte data DD/MM/AAAA em objeto Date (meia-noite no fuso local).
 * @param {string} sDataBr
 * @returns {Date|null}
 */
export function converteDataBrParaObjeto(sDataBr) {
   const sIso = converteDataBrParaIso(sDataBr);
   if (!sIso) {
      return null;
   }
   const [sAno, sMes, sDia] = sIso.split('-');
   const dtData = new Date(Number(sAno), Number(sMes) - 1, Number(sDia));
   return Number.isNaN(dtData.getTime()) ? null : dtData;
}

/**
 * Formata um objeto Date no padrão brasileiro DD/MM/AAAA.
 * @param {Date} dtData
 * @returns {string}
 */
export function formataDataBr(dtData) {
   if (!(dtData instanceof Date) || Number.isNaN(dtData.getTime())) {
      return '';
   }
   const sDia = String(dtData.getDate()).padStart(2, '0');
   const sMes = String(dtData.getMonth() + 1).padStart(2, '0');
   return `${sDia}/${sMes}/${dtData.getFullYear()}`;
}

/**
 * Soma (ou subtrai) dias a uma data no formato DD/MM/AAAA.
 * @param {string} sDataBr
 * @param {number} iDias Quantidade de dias (aceita valores negativos)
 * @returns {string} Data resultante em DD/MM/AAAA
 */
export function somaDiasData(sDataBr, iDias) {
   const dtData = converteDataBrParaObjeto(sDataBr);
   if (!dtData) {
      return '';
   }
   dtData.setDate(dtData.getDate() + iDias);
   return formataDataBr(dtData);
}

/**
 * Compara duas datas no formato DD/MM/AAAA.
 * @param {string} sDataA
 * @param {string} sDataB
 * @returns {number} Negativo se A < B, zero se iguais, positivo se A > B
 */
export function comparaDatas(sDataA, sDataB) {
   const dtA = converteDataBrParaObjeto(sDataA);
   const dtB = converteDataBrParaObjeto(sDataB);
   if (!dtA || !dtB) {
      return 0;
   }
   return dtA.getTime() - dtB.getTime();
}

/**
 * Trata a impressão de datas nulas, conforme item "Valores dos Relatórios"
 * do padrão de programação (não exibir "30/12/1899").
 * @param {string} sData
 * @returns {string}
 */
export function trataDataNula(sData) {
   if (!sData || sData === DATA_NULA_DELPHI) {
      return '—';
   }
   return sData;
}

// ---------------------------------------------------------------------------
// Apoio à interface
// ---------------------------------------------------------------------------

/**
 * Formata a identificação Banco/Agência/Conta Corrente exibida na tela.
 * @param {{ codBanco: string, codAgencia: string, numContaCorrente: string }} oConta
 * @returns {string} Ex.: "237/2366/39245-0"
 */
export function formataContaCorrente(oConta) {
   if (!oConta) {
      return '';
   }
   return `${oConta.codBanco}/${oConta.codAgencia}/${oConta.numContaCorrente}`;
}

/**
 * Normaliza texto para comparações e filtros (sem acentos, minúsculo).
 * @param {string} sTexto
 * @returns {string}
 */
export function normalizaTexto(sTexto) {
   return String(sTexto ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
}
