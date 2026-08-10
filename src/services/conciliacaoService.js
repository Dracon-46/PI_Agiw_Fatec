// ============================================================================
// conciliacaoService.js - Camada de acesso às API Routes do módulo
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Executado no cliente. Concentra todas as chamadas HTTP da tela — nenhum
// componente acessa "fetch" diretamente, conforme a orientação de centralizar
// e exportar globalmente as funções reutilizáveis.
// ============================================================================

/**
 * Executa uma requisição e trata o retorno de erro de forma padronizada.
 * @param {string} sUrl Endereço do endpoint
 * @param {object} [oOpcoes] Opções nativas do fetch
 * @returns {Promise<object>} Corpo da resposta já convertido
 */
async function requisitaJson(sUrl, oOpcoes) {
   const oResposta = await fetch(sUrl, oOpcoes);

   let oCorpo = {};
   try {
      oCorpo = await oResposta.json();
   } catch {
      oCorpo = {};
   }

   if (!oResposta.ok) {
      throw new Error(oCorpo.erro || `Falha na comunicação com o servidor (${oResposta.status}).`);
   }

   return oCorpo;
} // requisitaJson

/**
 * Carrega as contas correntes disponíveis para conciliação.
 * @returns {Promise<{ providers: Array, contas: Array, slugPadrao: string }>}
 */
export async function buscaContasCorrentes() {
   return requisitaJson('/api/bank/providers');
} // buscaContasCorrentes

/**
 * Cadastra conta corrente no MySQL.
 * @param {object} oDados
 * @returns {Promise<{ conta: object }>}
 */
export async function cadastraContaCorrenteApi(oDados) {
   return requisitaJson('/api/bank/contas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(oDados),
   });
} // cadastraContaCorrenteApi

/**
 * Inativa conta corrente no MySQL.
 * @param {string} sCodConta
 * @returns {Promise<{ ok: boolean }>}
 */
export async function removeContaCorrenteApi(sCodConta) {
   return requisitaJson(`/api/bank/contas?conta=${encodeURIComponent(sCodConta)}`, {
      method: 'DELETE',
   });
} // removeContaCorrenteApi

/**
 * Carrega os movimentos registrados no Satis para a conta e o período.
 * @param {string} sCodConta Código da conta corrente
 * @param {string} sDataInicio Data inicial (DD/MM/AAAA)
 * @param {string} sDataFim Data final (DD/MM/AAAA)
 * @returns {Promise<{ lancamentos: Array, titulos: Array, conta: object, saldos: object }>}
 */
export async function buscaLancamentosSistema(sCodConta, sDataInicio, sDataFim) {
   const oParams = new URLSearchParams({
      conta: sCodConta,
      dataInicio: sDataInicio,
      dataFim: sDataFim,
   });
   return requisitaJson(`/api/conciliacao/lancamentos?${oParams}`);
} // buscaLancamentosSistema

/**
 * Importa o extrato bancário do período via API do banco.
 * @param {string} sSlugBanco Slug do provider (ex.: "bradesco")
 * @param {string} sCodConta Código da conta corrente
 * @param {string} sDataInicio Data inicial (DD/MM/AAAA)
 * @param {string} sDataFim Data final (DD/MM/AAAA)
 * @returns {Promise<{ movimentos: Array, resumo: object, origem: string, aviso?: string }>}
 */
export async function importaExtratoBanco(sSlugBanco, sCodConta, sDataInicio, sDataFim) {
   const oParams = new URLSearchParams({
      banco: sSlugBanco,
      conta: sCodConta,
      dataInicio: sDataInicio,
      dataFim: sDataFim,
   });
   return requisitaJson(`/api/bank/extrato?${oParams}`);
} // importaExtratoBanco

/**
 * Solicita ao servidor a conciliação automática do período.
 * @param {Array<object>} aLancamentos Lançamentos do sistema
 * @param {Array<object>} aMovimentos Movimentos do banco
 * @param {number} [iJanelaDias] Tolerância de dias entre as datas
 * @returns {Promise<{ aGrupos: Array, iGrupos: number, mensagem: string }>}
 */
export async function executaConciliacaoAutomatica(aLancamentos, aMovimentos, iJanelaDias) {
   return requisitaJson('/api/conciliacao/auto-match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
         lancamentos: aLancamentos,
         movimentos: aMovimentos,
         janelaDias: iJanelaDias,
      }),
   });
} // executaConciliacaoAutomatica

/**
 * Inclui um lançamento no extrato do sistema (ação "Novo Lançamento").
 * @param {string} sCodConta Código da conta corrente
 * @param {object} oLancamento Dados informados na caixa de lançamento
 * @returns {Promise<{ lancamento: object, mensagem: string }>}
 */
export async function incluiLancamentoApi(sCodConta, oLancamento) {
   return requisitaJson('/api/conciliacao/lancamentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conta: sCodConta, ...oLancamento }),
   });
} // incluiLancamentoApi

/**
 * Exclui um lançamento originado na conciliação.
 * @param {string} sCodConta
 * @param {string} sCodLancamento
 * @returns {Promise<{ ok: boolean, mensagem: string }>}
 */
export async function excluiLancamentoApi(sCodConta, sCodLancamento) {
   const oParams = new URLSearchParams({ conta: sCodConta, lancamento: sCodLancamento });
   return requisitaJson(`/api/conciliacao/lancamentos?${oParams}`, { method: 'DELETE' });
} // excluiLancamentoApi

/**
 * Grava o status de conciliação (ou o estorno) dos registros selecionados.
 * @param {string} sCodConta
 * @param {Array<object>} aLancamentos Lançamentos selecionados
 * @param {Array<object>} aMovimentos Movimentos selecionados
 * @param {boolean} bConciliado true grava SIM, false grava NÃO
 * @param {boolean} [bAutomatica] Indica conciliação automática
 * @returns {Promise<{ ok: boolean, mensagem: string }>}
 */
export async function gravaConciliacaoApi(sCodConta, aLancamentos, aMovimentos, bConciliado, bAutomatica = false) {
   return requisitaJson('/api/conciliacao/conciliar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
         conta: sCodConta,
         bConciliado,
         automatica: bAutomatica,
         lancamentos: aLancamentos.map((oItem) => ({
            codLancamento: oItem.codLancamento,
            valMovimento: oItem.valMovimento,
            bEntrada: oItem.bEntrada,
         })),
         movimentos: aMovimentos.map((oItem) => ({
            codMovimento: oItem.codMovimento,
            valMovimento: oItem.valMovimento,
            bEntrada: oItem.bEntrada,
         })),
      }),
   });
} // gravaConciliacaoApi

/**
 * Envia um arquivo de extrato (OFX, CSV ou TXT) para importação.
 * @param {string} sCodConta
 * @param {File} oArquivo Arquivo escolhido pelo usuário
 * @returns {Promise<{ movimentos: Array, resumo: object, mensagem: string }>}
 */
export async function enviaArquivoExtrato(sCodConta, oArquivo) {
   const oFormulario = new FormData();
   oFormulario.append('conta', sCodConta);
   oFormulario.append('arquivo', oArquivo);

   // Sem Content-Type manual: o navegador precisa definir o boundary
   return requisitaJson('/api/bank/extrato/arquivo', {
      method: 'POST',
      body: oFormulario,
   });
} // enviaArquivoExtrato

/**
 * Monta a URL de download de um relatório.
 * @param {string} sCodConta
 * @param {string} sDataInicio
 * @param {string} sDataFim
 * @param {'xlsx'|'csv'|'pdf'} sFormato
 * @returns {string}
 */
export function montaUrlRelatorio(sCodConta, sDataInicio, sDataFim, sFormato) {
   const oParams = new URLSearchParams({
      conta: sCodConta,
      dataInicio: sDataInicio,
      dataFim: sDataFim,
      formato: sFormato,
   });
   return `/api/relatorios/conciliacao?${oParams}`;
} // montaUrlRelatorio

/**
 * Consulta a trilha de auditoria.
 * @param {object} [oFiltro]
 * @param {string} [oFiltro.sCodConta]
 * @param {string} [oFiltro.sAcao]
 * @param {string} [oFiltro.sDataInicio]
 * @param {string} [oFiltro.sDataFim]
 * @returns {Promise<{ eventos: Array, resumo: Array, arquivos: Array, acoesDisponiveis: Array }>}
 */
export async function buscaAuditoria(oFiltro = {}) {
   const oParams = new URLSearchParams();
   if (oFiltro.sCodConta) oParams.set('conta', oFiltro.sCodConta);
   if (oFiltro.sAcao) oParams.set('acao', oFiltro.sAcao);
   if (oFiltro.sDataInicio) oParams.set('dataInicio', oFiltro.sDataInicio);
   if (oFiltro.sDataFim) oParams.set('dataFim', oFiltro.sDataFim);

   return requisitaJson(`/api/auditoria?${oParams}`);
} // buscaAuditoria
