// Serviço de conciliação - Ticket 37060
// Camada de serviço que se comunica APENAS com as API Routes locais.
// NUNCA importa módulos server-only (fs, https, etc).

/**
 * Busca extrato bancário via API Route genérica.
 * @param {string} banco - Slug do banco (ex: "bradesco", "itau", "bb")
 * @param {string} sDataInicio - Data início (DD/MM/AAAA)
 * @param {string} sDataFim - Data fim (DD/MM/AAAA)
 * @returns {Promise<{ movimentos: Array, resumo: object, periodo: object, origem: string }>}
 */
export async function buscaExtratoBanco(banco, sDataInicio, sDataFim) {
  const oParams = new URLSearchParams({
    banco,
    dataInicio: sDataInicio,
    dataFim: sDataFim,
  });

  const oRes = await fetch(`/api/bank/extrato?${oParams}`);
  const oJson = await oRes.json();

  if (!oRes.ok) {
    throw new Error(oJson.erro || `Falha ao buscar extrato (${banco})`);
  }

  return oJson;
}

/**
 * Executa auto-conciliação via API Route.
 * @param {Array} lancamentos - Lançamentos do ERP
 * @param {Array} movimentos - Movimentos do banco
 * @returns {Promise<{ grupos: Array, numGrupos: number, numConciliados: number }>}
 */
export async function executaAutoMatch(lancamentos, movimentos) {
  const oRes = await fetch('/api/conciliacao/auto-match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lancamentos, movimentos }),
  });

  const oJson = await oRes.json();

  if (!oRes.ok) {
    throw new Error(oJson.erro || 'Falha na auto conciliação');
  }

  return oJson;
}
