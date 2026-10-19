// ============================================================================
// subgrupos.js - Relação entre subgrupo, categoria e tipo de movimento
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Ata de 24/09/2026:
//   - "Subgrupo é obrigatório, conforme regra do ERP";
//   - "O tipo de movimento é definido a partir do subgrupo";
//   - "Débito → sugere Entrada" e "Crédito → sugere Saída" (o usuário pode
//     alterar a sugestão);
//   - o subgrupo é trocado automaticamente quando o tipo de movimento muda.
//
// O subgrupo do fluxo de caixa (TBFLCX002) tem chave CATEGORIA + CODGRUPO +
// SUBGRUPO — o mesmo código de subgrupo pode existir nas duas categorias. É a
// CATEGORIA que diz o sentido. Os dois padrões de codificação usados pelo ERP
// são aceitos: D/C (débito/crédito, do ponto de vista da conta bancária) e
// E/S (entrada/saída).
// ============================================================================

/** Sentido sugerido para cada letra de CATEGORIA (true = entrada) */
const ENTRADA_POR_CATEGORIA = {
   D: true,
   E: true,
   C: false,
   S: false,
};

/** Separador da chave composta do subgrupo usada na tela */
const SEPARADOR_SUBGRUPO = '|';

/**
 * Sentido sugerido pela categoria do subgrupo.
 * @param {string} sCategoria Letra da categoria (TBFLCX002.CATEGORIA)
 * @returns {boolean|null} true entrada, false saída, null quando desconhecido
 */
export function sentidoDaCategoria(sCategoria) {
   const sLetra = String(sCategoria ?? '').trim().toUpperCase();
   return sLetra in ENTRADA_POR_CATEGORIA ? ENTRADA_POR_CATEGORIA[sLetra] : null;
} // sentidoDaCategoria

/**
 * Chave do subgrupo na tela: categoria + subgrupo.
 *
 * Só o código do subgrupo não identifica a linha de TBFLCX002, porque ele se
 * repete entre as categorias — e é justamente essa repetição que permite
 * trocar o subgrupo de lado quando o tipo de movimento muda.
 *
 * @param {{ categoria?: string, codSubgrupo?: string }} oSubgrupo
 * @returns {string}
 */
export function chaveSubgrupo(oSubgrupo) {
   if (!oSubgrupo?.codSubgrupo) {
      return '';
   }
   return `${oSubgrupo.categoria ?? ''}${SEPARADOR_SUBGRUPO}${oSubgrupo.codSubgrupo}`;
} // chaveSubgrupo

/**
 * Localiza o subgrupo do catálogo pela chave da tela.
 * @param {Array<object>} aSubgrupos Catálogo
 * @param {string} sChave
 * @returns {object|null}
 */
export function buscaSubgrupoPorChave(aSubgrupos, sChave) {
   if (!sChave) {
      return null;
   }
   return (aSubgrupos ?? []).find((oItem) => chaveSubgrupo(oItem) === sChave) ?? null;
} // buscaSubgrupoPorChave

/**
 * Localiza no catálogo o subgrupo gravado em um lançamento.
 *
 * O lançamento guarda subgrupo e categoria. Sem a categoria (registros
 * antigos), vale o subgrupo do mesmo sentido do lançamento.
 *
 * @param {Array<object>} aSubgrupos
 * @param {string} sCodSubgrupo
 * @param {string} [sCategoria]
 * @param {boolean} [bEntrada]
 * @returns {object|null}
 */
export function localizaSubgrupo(aSubgrupos, sCodSubgrupo, sCategoria, bEntrada) {
   const aMesmoCodigo = (aSubgrupos ?? []).filter((oItem) => oItem.codSubgrupo === sCodSubgrupo);
   if (aMesmoCodigo.length === 0) {
      return null;
   }

   return (
      aMesmoCodigo.find((oItem) => sCategoria && oItem.categoria === sCategoria) ??
      aMesmoCodigo.find((oItem) => sentidoDaCategoria(oItem.categoria) === bEntrada) ??
      aMesmoCodigo[0]
   );
} // localizaSubgrupo

/**
 * Indica se o subgrupo é compatível com o tipo de movimento.
 * Categoria desconhecida não restringe: o subgrupo serve aos dois sentidos.
 * @param {object} oSubgrupo
 * @param {boolean} bEntrada
 * @returns {boolean}
 */
export function subgrupoAtendeSentido(oSubgrupo, bEntrada) {
   const bSentido = sentidoDaCategoria(oSubgrupo?.categoria);
   return bSentido === null || bSentido === Boolean(bEntrada);
} // subgrupoAtendeSentido

/**
 * Troca o subgrupo de lado quando o tipo de movimento muda.
 *
 * Procura o mesmo código de subgrupo na categoria do novo sentido. Quando ele
 * não existe do outro lado, a escolha do usuário é mantida: a ata permite que
 * o tipo de movimento diverja da sugestão do subgrupo.
 *
 * @param {Array<object>} aSubgrupos Catálogo
 * @param {object|null} oAtual Subgrupo selecionado
 * @param {boolean} bEntrada Novo tipo de movimento
 * @returns {object|null} Subgrupo a selecionar
 */
export function trocaSubgrupoPorSentido(aSubgrupos, oAtual, bEntrada) {
   if (!oAtual || subgrupoAtendeSentido(oAtual, bEntrada)) {
      return oAtual;
   }

   const oEquivalente = (aSubgrupos ?? []).find(
      (oItem) =>
         oItem.codSubgrupo === oAtual.codSubgrupo &&
         sentidoDaCategoria(oItem.categoria) === Boolean(bEntrada)
   );

   return oEquivalente ?? oAtual;
} // trocaSubgrupoPorSentido
