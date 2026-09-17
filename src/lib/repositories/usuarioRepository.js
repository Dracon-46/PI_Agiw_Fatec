// ============================================================================
// usuarioRepository.js - Usuário corrente e permissões de acesso
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// O item 6.1.3.1 pede "verificar permissão de acesso" para os botões de
// bloquear e desbloquear o período. Enquanto o módulo não recebe a sessão do
// Satis, o usuário corrente vem de USUARIO_ATUAL no .env — mas a conferência
// da permissão acontece sempre no servidor, contra as tabelas do ERP. A tela
// apenas reflete o que o servidor autoriza; desabilitar o botão no navegador
// não é controle de acesso.
//
// As tabelas são as mesmas do Satis:
//
//   TBSENH006  usuários (USER_ID, NOMUSUARIO, SUSPENSAO, BLOQUEIO)
//   TBSENH005  permissão por MÓDULO, em cinco colunas de uma letra:
//              INCLUSAO, ALTERACAO, CONSULTA, EXCLUSAO e IMPRESSAO
//
// A tradução entre as permissões do módulo e as do ERP está em PERMISSOES: o
// sistema é o CONB (conciliação bancária), CONB001 é a tela de movimento e
// CONB002 é a de parâmetros, onde o fechamento do período é mantido. É por
// isso que bloquear período exige ALTERACAO em CONB002 e não em CONB001 —
// fechar o mês é mexer no parâmetro, não no movimento.
// ============================================================================

import { codEmp, limpa, prisma } from '../db.js';

/** Permissão exigida para fechar e reabrir período (item 6.1.3.1) */
export const PERM_BLOQUEIO = 'conciliacao.bloqueio';

/** Permissão exigida para conciliar e estornar (itens 6.1.3.6 e 6.1.3.7) */
export const PERM_CONCILIAR = 'conciliacao.conciliar';

/** Permissão exigida para lançar e transferir (item 6.1.3.8) */
export const PERM_LANCAMENTO = 'conciliacao.lancamento';

/** Permissão exigida para excluir lançamento (item 6.1.3.8 — ação 4) */
export const PERM_EXCLUSAO = 'conciliacao.exclusao';

/** Usuário assumido quando o .env não define outro */
const USUARIO_PADRAO = 'INFTEC';

/** Sistema do ERP a que o módulo pertence (TBSENH005.SISTEMA_ID) */
const SISTEMA_PADRAO = 'CONB';

/** Módulo da tela de movimento da conciliação (TBSENH005.MODULO_ID) */
const MODULO_MOVIMENTO = 'CONB001';

/** Módulo de parâmetros da conciliação, onde vive o fechamento do período */
const MODULO_PARAMETRO = 'CONB002';

/**
 * Permissões do módulo traduzidas para (módulo do ERP, coluna de operação).
 *
 * Cada permissão é uma pergunta objetiva a TBSENH005: "este usuário tem a
 * operação X liberada no módulo Y?".
 */
const PERMISSOES = {
   [PERM_CONCILIAR]: { sModulo: MODULO_MOVIMENTO, sOperacao: 'ALTERACAO' },
   [PERM_LANCAMENTO]: { sModulo: MODULO_MOVIMENTO, sOperacao: 'INCLUSAO' },
   [PERM_EXCLUSAO]: { sModulo: MODULO_MOVIMENTO, sOperacao: 'EXCLUSAO' },
   [PERM_BLOQUEIO]: { sModulo: MODULO_PARAMETRO, sOperacao: 'ALTERACAO' },
};

/**
 * Nome do usuário corrente.
 * @returns {string}
 */
export function nomUsuarioAtual() {
   return (process.env.USUARIO_ATUAL || '').trim() || USUARIO_PADRAO;
} // nomUsuarioAtual

/**
 * Sistema do ERP usado na conferência de permissão.
 * @returns {string}
 */
function sistemaAtual() {
   return (process.env.ERP_SISTEMA_ID || '').trim() || SISTEMA_PADRAO;
} // sistemaAtual

/**
 * Carrega o usuário corrente com as permissões que possui.
 *
 * Um usuário ausente de TBSENH006 não recebe permissão alguma: é preferível
 * travar a ação a liberar por omissão. Suspensão e bloqueio no ERP têm o mesmo
 * efeito — quem está barrado no Satis está barrado aqui.
 *
 * @returns {Promise<{ nomUsuario: string, desNome: string, desEmpresa: string,
 *                     aPermissoes: string[], bCadastrado: boolean }>}
 */
export async function carregaUsuarioAtual() {
   const sNomUsuario = nomUsuarioAtual();

   const oUsuario = await prisma.TBSENH006.findFirst({
      where: { USER_ID: sNomUsuario },
      select: {
         USER_ID: true,
         NOMUSUARIO: true,
         DEPARTAMENTO: true,
         SUSPENSAO: true,
         BLOQUEIO: true,
         TIPUSUARIO: true,
      },
   });

   if (!oUsuario) {
      return {
         nomUsuario: sNomUsuario,
         desNome: sNomUsuario,
         desEmpresa: `Empresa ${codEmp()}`,
         aPermissoes: [],
         bCadastrado: false,
      };
   }

   const bBarrado = limpa(oUsuario.SUSPENSAO) === 'S' || limpa(oUsuario.BLOQUEIO) === 'S';

   const aLinhas = bBarrado
      ? []
      : await prisma.TBSENH005.findMany({
           where: {
              SISTEMA_ID: sistemaAtual(),
              CODEMP: codEmp(),
              USER_ID: sNomUsuario,
              MODULO_ID: { in: [MODULO_MOVIMENTO, MODULO_PARAMETRO] },
           },
           select: {
              MODULO_ID: true,
              INCLUSAO: true,
              ALTERACAO: true,
              CONSULTA: true,
              EXCLUSAO: true,
              IMPRESSAO: true,
           },
        });

   const aPermissoes = Object.entries(PERMISSOES)
      .filter(([, oRegra]) => {
         const oLinha = aLinhas.find((oItem) => limpa(oItem.MODULO_ID) === oRegra.sModulo);
         return Boolean(oLinha) && limpa(oLinha[oRegra.sOperacao]) === 'S';
      })
      .map(([sPermissao]) => sPermissao);

   return {
      nomUsuario: limpa(oUsuario.USER_ID),
      desNome: limpa(oUsuario.NOMUSUARIO) || limpa(oUsuario.USER_ID),
      desEmpresa: limpa(oUsuario.DEPARTAMENTO) || `Empresa ${codEmp()}`,
      aPermissoes,
      bCadastrado: true,
      bBloqueado: bBarrado,
   };
} // carregaUsuarioAtual

/**
 * Indica se o usuário corrente possui a permissão informada.
 * @param {string} sCodPermissao
 * @returns {Promise<boolean>}
 */
export async function temPermissao(sCodPermissao) {
   const oUsuario = await carregaUsuarioAtual();
   return oUsuario.aPermissoes.includes(sCodPermissao);
} // temPermissao

/**
 * Mensagem padrão de recusa, citando a permissão que falta e onde liberá-la.
 * @param {string} sCodPermissao
 * @returns {string}
 */
export function mensagemSemPermissao(sCodPermissao) {
   const oRegra = PERMISSOES[sCodPermissao];
   const sOnde = oRegra
      ? ` (${oRegra.sOperacao} no módulo ${oRegra.sModulo} do sistema ${sistemaAtual()})`
      : '';

   return (
      `O usuário ${nomUsuarioAtual()} não tem a permissão "${sCodPermissao}"${sOnde}. ` +
      'Solicite a liberação ao administrador do módulo.'
   );
} // mensagemSemPermissao
