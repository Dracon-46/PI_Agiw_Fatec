// ============================================================================
// configPeriodo.js - Período padrão dos campos de data da conciliação
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// O item 6.1.3.2 do documento de visão define o período inicial como
// "data de bloqueio + 1" até "data do dia - 1". Essa regra vale para uma
// integração de produção, onde o extrato acompanha o calendário.
//
// Nos ambientes de homologação isso não se sustenta: o sandbox do Bradesco é
// um mock e só devolve extrato para uma janela fixa de datas — em qualquer
// outro período responde 404. Abrir a tela na data de hoje deixaria a grade
// vazia sem que houvesse erro algum na integração.
//
// Por isso o período de abertura é configurável. Definindo as duas variáveis
// abaixo, a tela abre sempre nessa janela; deixando-as vazias, volta a valer
// a regra do documento de visão.
//
//   NEXT_PUBLIC_PERIODO_INICIO=01/05/2024
//   NEXT_PUBLIC_PERIODO_FIM=31/05/2024
//
// O prefixo NEXT_PUBLIC_ é exigido pelo Next.js para que o valor chegue ao
// navegador — não use essas variáveis para nada sigiloso.
// ============================================================================

/** Data inicial fixa da tela, quando configurada */
export const PERIODO_PADRAO_INICIO = (process.env.NEXT_PUBLIC_PERIODO_INICIO ?? '').trim();

/** Data final fixa da tela, quando configurada */
export const PERIODO_PADRAO_FIM = (process.env.NEXT_PUBLIC_PERIODO_FIM ?? '').trim();

/**
 * Indica se há um período fixo configurado.
 * Exige as duas pontas: meia configuração produziria um intervalo ambíguo.
 * @returns {boolean}
 */
export function temPeriodoPadraoFixo() {
   return Boolean(PERIODO_PADRAO_INICIO && PERIODO_PADRAO_FIM);
} // temPeriodoPadraoFixo
