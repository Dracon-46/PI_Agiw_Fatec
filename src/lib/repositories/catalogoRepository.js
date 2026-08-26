// ============================================================================
// catalogoRepository.js - Catálogos usados nas caixas do módulo
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Tipos de documento, subgrupos de fluxo de caixa, contas contábeis e centros
// de custo alimentam a caixa "Novo Lançamento" (item 6.1.3.8 — ação 1) e a
// "Transferência entre Contas" (ação 2).
//
// No Satis a origem é TBFLCX002, TBGENE023 e TBCOMP008. Aqui vêm do MySQL —
// antes estavam fixos em utils/mockData.js, o que impedia o cliente de manter
// os próprios códigos.
// ============================================================================

import { query } from '../db.js';

/**
 * Tipos de documento aceitos no lançamento bancário.
 * @returns {Promise<Array<{ codTipoDocumento: string, desTipoDocumento: string }>>}
 */
export async function listaTiposDocumento() {
   return query(
      `SELECT cod_tipo_documento AS codTipoDocumento,
              des_tipo_documento AS desTipoDocumento
         FROM tipo_documento
        WHERE b_ativo = 1
     ORDER BY num_ordem, des_tipo_documento`
   );
} // listaTiposDocumento

/**
 * Subgrupos de fluxo de caixa (TBFLCX002).
 * @returns {Promise<Array<{ codSubgrupo: string, desSubgrupo: string }>>}
 */
export async function listaSubgrupos() {
   return query(
      `SELECT cod_subgrupo AS codSubgrupo,
              des_subgrupo AS desSubgrupo,
              cod_grupo AS codGrupo
         FROM subgrupo_fluxo
        WHERE b_ativo = 1
     ORDER BY des_subgrupo`
   );
} // listaSubgrupos

/**
 * Contas contábeis (TBGENE023).
 * @returns {Promise<Array<{ codContaContabil: string, desContaContabil: string }>>}
 */
export async function listaContasContabeis() {
   return query(
      `SELECT cod_conta_contabil AS codContaContabil,
              des_conta_contabil AS desContaContabil
         FROM conta_contabil
        WHERE b_ativo = 1
     ORDER BY cod_conta_contabil`
   );
} // listaContasContabeis

/**
 * Centros de custo (TBCOMP008).
 * @returns {Promise<Array<{ codCentroCusto: string, desCentroCusto: string }>>}
 */
export async function listaCentrosCusto() {
   return query(
      `SELECT cod_centro_custo AS codCentroCusto,
              des_centro_custo AS desCentroCusto
         FROM centro_custo
        WHERE b_ativo = 1
     ORDER BY des_centro_custo`
   );
} // listaCentrosCusto

/**
 * Carrega todos os catálogos em uma única ida ao banco.
 * A tela pede os quatro juntos ao abrir; separar em quatro requisições só
 * multiplicaria a latência sem ganho nenhum.
 * @returns {Promise<object>}
 */
export async function listaCatalogos() {
   const [aTiposDocumento, aSubgrupos, aContasContabeis, aCentrosCusto] = await Promise.all([
      listaTiposDocumento(),
      listaSubgrupos(),
      listaContasContabeis(),
      listaCentrosCusto(),
   ]);

   return { aTiposDocumento, aSubgrupos, aContasContabeis, aCentrosCusto };
} // listaCatalogos
