// ============================================================================
// catalogoRepository.js - Catálogos usados nas caixas do módulo
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Tipos de documento, subgrupos de fluxo de caixa, contas contábeis e centros
// de custo alimentam a caixa "Novo Lançamento" (item 6.1.3.8 — ação 1) e a
// "Transferência entre Contas" (ação 2).
//
// Todos os quatro são tabelas do próprio ERP, e é de lá que vêm:
//
//   TBGENE009  tipos de documento (o CODDOCUM que TBCONB001 exige na chave)
//   TBFLCX002  subgrupos do fluxo de caixa
//   TBGENE023  contas contábeis
//   TBCOMP008  centros de custo
//
// Antes o módulo mantinha cópias dessas listas, o que obrigava a cadastrar
// duas vezes o mesmo código e deixava a caixa de lançamento oferecendo
// classificação que o Satis não reconhece.
// ============================================================================

import { codEmp, limpa, prisma } from '../db.js';

/**
 * Tipos de documento aceitos no lançamento bancário (TBGENE009).
 *
 * Só os de uso do sistema entram: STADOCUM marca o documento ativo, e é o
 * CODDOCUM que vai para a chave de TBCONB001.
 *
 * @returns {Promise<Array<{ codTipoDocumento: string, desTipoDocumento: string }>>}
 */
export async function listaTiposDocumento() {
   const aLinhas = await prisma.TBGENE009.findMany({
      where: { STADOCUM: 'S' },
      select: { CODDOCUM: true, DESDOCUM: true },
      orderBy: { DESDOCUM: 'asc' },
   });

   return aLinhas.map((oLinha) => ({
      codTipoDocumento: limpa(oLinha.CODDOCUM),
      desTipoDocumento: limpa(oLinha.DESDOCUM),
   }));
} // listaTiposDocumento

/**
 * Subgrupos de fluxo de caixa (TBFLCX002).
 *
 * A chave real é CATEGORIA + CODGRUPO + SUBGRUPO; a tela trabalha só com o
 * subgrupo, e as outras duas colunas são recuperadas na gravação do
 * lançamento (ver lancamentoRepository).
 *
 * @returns {Promise<Array<{ codSubgrupo: string, desSubgrupo: string, codGrupo: string }>>}
 */
export async function listaSubgrupos() {
   const aLinhas = await prisma.TBFLCX002.findMany({
      select: { SUBGRUPO: true, DESCSUBGRUPO: true, CODGRUPO: true, CATEGORIA: true },
      orderBy: { DESCSUBGRUPO: 'asc' },
   });

   return aLinhas.map((oLinha) => ({
      codSubgrupo: limpa(oLinha.SUBGRUPO),
      desSubgrupo: limpa(oLinha.DESCSUBGRUPO),
      codGrupo: limpa(oLinha.CODGRUPO),
      categoria: limpa(oLinha.CATEGORIA),
   }));
} // listaSubgrupos

/**
 * Contas contábeis (TBGENE023).
 * @returns {Promise<Array<{ codContaContabil: string, desContaContabil: string }>>}
 */
export async function listaContasContabeis() {
   const aLinhas = await prisma.TBGENE023.findMany({
      // Conta sintética (a que só soma as filhas) não aceita lançamento:
      // oferecê-la faria o Satis recusar a contabilização depois.
      where: { CODEMP: codEmp(), ACEITACC: 'S', NOT: { STACONTA: 'N' } },
      select: { CONTESTO: true, DESCCONTA: true },
      orderBy: { CONTESTO: 'asc' },
   });

   return aLinhas.map((oLinha) => ({
      codContaContabil: limpa(oLinha.CONTESTO),
      desContaContabil: limpa(oLinha.DESCCONTA),
   }));
} // listaContasContabeis

/**
 * Centros de custo (TBCOMP008).
 * @returns {Promise<Array<{ codCentroCusto: string, desCentroCusto: string }>>}
 */
export async function listaCentrosCusto() {
   const aLinhas = await prisma.TBCOMP008.findMany({
      where: { CODEMP: codEmp(), STACCUSTO: 'S' },
      select: { CCUSTO: true, DESCCUSTO: true },
      orderBy: { DESCCUSTO: 'asc' },
   });

   return aLinhas.map((oLinha) => ({
      codCentroCusto: limpa(oLinha.CCUSTO),
      desCentroCusto: limpa(oLinha.DESCCUSTO),
   }));
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
