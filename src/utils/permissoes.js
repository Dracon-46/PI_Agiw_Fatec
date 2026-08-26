// ============================================================================
// permissoes.js - Códigos de permissão do módulo
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Os mesmos códigos gravados em usuario_permissao. Ficam aqui para que a tela
// possa citá-los sem importar código de servidor.
//
// A tela usa estes códigos apenas para desabilitar botões e explicar o motivo.
// Quem autoriza de fato é a rota que grava, que confere a permissão no MySQL.
// ============================================================================

/** Fechar e reabrir período (item 6.1.3.1) */
export const PERM_BLOQUEIO = 'conciliacao.bloqueio';

/** Conciliar e estornar (itens 6.1.3.6 e 6.1.3.7) */
export const PERM_CONCILIAR = 'conciliacao.conciliar';

/** Lançar, transferir e baixar título (item 6.1.3.8) */
export const PERM_LANCAMENTO = 'conciliacao.lancamento';
