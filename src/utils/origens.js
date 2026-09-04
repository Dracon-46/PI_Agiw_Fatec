// ============================================================================
// origens.js - Origens possíveis de um lançamento do sistema
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Corresponde ao campo "Origem" do item 6.1.2 do documento de visão e à
// coluna tip_origem de lancamento_sistema (TBCONB001 no Satis).
//
// Só as origens nascidas dentro da conciliação podem ser excluídas pela tela
// (item 6.1.3.8 — ação 4); as demais pertencem ao Contas a Pagar/Receber.
// ============================================================================

export const ORIGEM_CONTAS_RECEBER = 'Contas a Receber';
export const ORIGEM_CONTAS_PAGAR = 'Contas a Pagar';
export const ORIGEM_CONCILIACAO = 'Conciliação';
export const ORIGEM_TRANSFERENCIA = 'Transferência';

/** Origens oferecidas na caixa "Novo Lançamento" */
export const ORIGENS_LANCAMENTO = [
   ORIGEM_CONCILIACAO,
   ORIGEM_CONTAS_PAGAR,
   ORIGEM_CONTAS_RECEBER,
   ORIGEM_TRANSFERENCIA,
];
