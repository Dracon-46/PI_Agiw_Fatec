// ============================================================================
// bancos.js - Ligação entre o banco do ERP e o provider de integração
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// O catálogo de bancos é o do ERP (TBGENE015), e é ele que manda: nome,
// código de compensação (NUMBANCO) e situação saem de lá. O que a tabela do
// ERP não tem é o que só existe neste módulo:
//
//   - o SLUG do provider, que liga o banco à classe de integração
//     (src/providers/); sem ele não há como saber que "237" é o Bradesco;
//   - as CORES e o LOGO do cartão da conta (item 6.1.1). TBGENE015 tem
//     CAMINHOLOGOBANCO, mas é um caminho de arquivo da estação onde o Satis
//     roda em Delphi — não serve para o navegador, que precisa de uma URL
//     servida pelo /public.
//
// Ficam aqui, e não em uma tabela nova, porque são atributos do CÓDIGO: um
// banco só aparece na tela quando existe uma classe de provider para ele, e
// essa classe é versionada junto com este arquivo. Banco do ERP que não esteja
// neste mapa é ignorado pela tela — é o que impede a lista de contas de
// oferecer uma conta que o módulo não sabe consultar.
// ============================================================================

/**
 * Bancos integrados, indexados pelo código de compensação (TBGENE015.NUMBANCO).
 * @type {Record<string, { sSlug: string, sCor: string, sCorTexto: string, sLogo: string }>}
 */
export const BANCOS_INTEGRADOS = {
   '001': { sSlug: 'bb', sCor: '#f7d117', sCorTexto: '#0033a0', sLogo: '/bancos/bb.svg' },
   341: { sSlug: 'itau', sCor: '#ec7000', sCorTexto: '#ffffff', sLogo: '/bancos/itau.svg' },
   237: { sSlug: 'bradesco', sCor: '#cc092f', sCorTexto: '#ffffff', sLogo: '/bancos/bradesco.svg' },
   422: { sSlug: 'safra', sCor: '#0a3b7c', sCorTexto: '#ffffff', sLogo: '/bancos/safra.svg' },
};

/** Cor usada quando o banco existe no ERP mas não tem identidade visual aqui */
const COR_PADRAO = { sCor: '#3b82f6', sCorTexto: '#ffffff', sLogo: '' };

/**
 * Normaliza o código de compensação para a chave do mapa.
 *
 * TBGENE015.NUMBANCO é CHAR(10) e aparece como "001", "341" ou até
 * "0000000000" (o caixa interno). Só os dígitos significativos identificam a
 * instituição, e três posições é o tamanho do código de compensação.
 *
 * @param {string} sNumBanco
 * @returns {string} Código com 3 posições, ou vazio quando não há dígito
 */
export function normalizaNumBanco(sNumBanco) {
   const sDigitos = String(sNumBanco ?? '').replace(/\D/g, '');
   if (!sDigitos) {
      return '';
   }

   // "0000000000" do caixa interno vira "000", que não está no mapa
   return sDigitos.slice(-3).padStart(3, '0');
} // normalizaNumBanco

/**
 * Devolve o provider e a identidade visual de um banco do ERP.
 * @param {string} sNumBanco Código de compensação (TBGENE015.NUMBANCO)
 * @returns {{ sSlug: string, sCor: string, sCorTexto: string, sLogo: string }|null}
 *          null quando o módulo não integra esse banco
 */
export function bancoIntegrado(sNumBanco) {
   const oBanco = BANCOS_INTEGRADOS[normalizaNumBanco(sNumBanco)];
   return oBanco ? { ...COR_PADRAO, ...oBanco } : null;
} // bancoIntegrado

/**
 * Códigos de compensação que o módulo integra.
 * @returns {string[]}
 */
export function compensacoesIntegradas() {
   return Object.keys(BANCOS_INTEGRADOS);
} // compensacoesIntegradas
