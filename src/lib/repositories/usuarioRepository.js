// ============================================================================
// usuarioRepository.js - Usuário corrente e permissões de acesso
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// O item 6.1.3.1 pede "verificar permissão de acesso" para os botões de
// bloquear e desbloquear o período. Enquanto o módulo não recebe a sessão do
// Satis, o usuário corrente vem de USUARIO_ATUAL no .env — mas a conferência
// da permissão acontece sempre no servidor, contra a tabela usuario_permissao.
// A tela apenas reflete o que o servidor autoriza; desabilitar o botão no
// navegador não é controle de acesso.
// ============================================================================

import { query } from '../db.js';

/** Permissão exigida para fechar e reabrir período (item 6.1.3.1) */
export const PERM_BLOQUEIO = 'conciliacao.bloqueio';

/** Permissão exigida para conciliar e estornar (itens 6.1.3.6 e 6.1.3.7) */
export const PERM_CONCILIAR = 'conciliacao.conciliar';

/** Permissão exigida para lançar, transferir e baixar título (item 6.1.3.8) */
export const PERM_LANCAMENTO = 'conciliacao.lancamento';

/** Usuário assumido quando o .env não define outro */
const USUARIO_PADRAO = 'INFTEC';

/**
 * Nome do usuário corrente.
 * @returns {string}
 */
export function nomUsuarioAtual() {
   return (process.env.USUARIO_ATUAL || '').trim() || USUARIO_PADRAO;
} // nomUsuarioAtual

/**
 * Carrega o usuário corrente com as permissões que possui.
 *
 * Um usuário ausente da tabela não recebe permissão alguma: é preferível
 * travar a ação a liberar por omissão.
 *
 * @returns {Promise<{ nomUsuario: string, desNome: string, desEmpresa: string,
 *                     aPermissoes: string[], bCadastrado: boolean }>}
 */
export async function carregaUsuarioAtual() {
   const sNomUsuario = nomUsuarioAtual();

   const aLinhas = await query(
      `SELECT u.nom_usuario AS nomUsuario,
              u.des_nome AS desNome,
              u.des_empresa AS desEmpresa,
              p.cod_permissao AS codPermissao
         FROM usuario u
         LEFT JOIN usuario_permissao p ON p.nom_usuario = u.nom_usuario
        WHERE u.nom_usuario = :nomUsuario
          AND u.b_ativo = 1`,
      { nomUsuario: sNomUsuario }
   );

   if (aLinhas.length === 0) {
      return {
         nomUsuario: sNomUsuario,
         desNome: sNomUsuario,
         desEmpresa: 'AGIW SISTEMAS LTDA — Matriz',
         aPermissoes: [],
         bCadastrado: false,
      };
   }

   return {
      nomUsuario: aLinhas[0].nomUsuario,
      desNome: aLinhas[0].desNome,
      desEmpresa: aLinhas[0].desEmpresa,
      aPermissoes: aLinhas.map((oLinha) => oLinha.codPermissao).filter(Boolean),
      bCadastrado: true,
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
 * Mensagem padrão de recusa, citando a permissão que falta.
 * @param {string} sCodPermissao
 * @returns {string}
 */
export function mensagemSemPermissao(sCodPermissao) {
   return (
      `O usuário ${nomUsuarioAtual()} não tem a permissão "${sCodPermissao}". ` +
      'Solicite a liberação ao administrador do módulo.'
   );
} // mensagemSemPermissao
