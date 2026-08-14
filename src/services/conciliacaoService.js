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
 * Grava (ou remove) o bloqueio de período da conta — item 6.1.3.1.
 * @param {string} sCodConta
 * @param {string} sDatBloqueio Data em DD/MM/AAAA; vazio remove o bloqueio
 * @returns {Promise<{ ok: boolean, datUltimoBloqueio: string, mensagem: string }>}
 */
export async function gravaBloqueioApi(sCodConta, sDatBloqueio) {
   return requisitaJson('/api/conciliacao/bloqueio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conta: sCodConta, datBloqueio: sDatBloqueio }),
   });
} // gravaBloqueioApi

/**
 * Exclui um movimento do extrato bancário — item 6.1.3.8, ação 4.
 * @param {string} sCodConta
 * @param {string} sCodMovimento
 * @returns {Promise<{ ok: boolean, mensagem: string }>}
 */
export async function excluiMovimentoApi(sCodConta, sCodMovimento) {
   const oParams = new URLSearchParams({ conta: sCodConta, movimento: sCodMovimento });
   return requisitaJson(`/api/conciliacao/movimentos?${oParams}`, { method: 'DELETE' });
} // excluiMovimentoApi

/**
 * Gera uma transferência entre contas — item 6.1.3.8, ação 2.
 * @param {object} oTransferencia
 * @returns {Promise<{ codTransferencia: string, lancamentoSaida: object, lancamentoEntrada: object, mensagem: string }>}
 */
export async function criaTransferenciaApi(oTransferencia) {
   return requisitaJson('/api/conciliacao/transferencia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(oTransferencia),
   });
} // criaTransferenciaApi

/**
 * Lista os títulos em aberto até a data informada — item 6.1.3.8, ação 3.
 * @param {string} sCodConta
 * @param {string} sDataLimite Vencimento máximo (DD/MM/AAAA)
 * @param {'Entrada'|'Saída'|''} [sTipo] Restringe o sentido
 * @returns {Promise<{ titulos: Array, resumo: object }>}
 */
export async function buscaTitulosAbertos(sCodConta, sDataLimite, sTipo = '') {
   const oParams = new URLSearchParams({ conta: sCodConta, dataLimite: sDataLimite });
   if (sTipo) {
      oParams.set('tipo', sTipo);
   }
   return requisitaJson(`/api/conciliacao/titulos?${oParams}`);
} // buscaTitulosAbertos

/**
 * Realiza a baixa de um ou mais títulos — item 6.1.3.8, ação 3.
 * @param {string} sCodConta
 * @param {Array<object>} aBaixas Documentos com data e valores informados
 * @returns {Promise<{ lancamentos: Array, resumo: object, mensagem: string }>}
 */
export async function baixaTitulosApi(sCodConta, aBaixas) {
   return requisitaJson('/api/conciliacao/titulos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conta: sCodConta, baixas: aBaixas }),
   });
} // baixaTitulosApi

/**
 * Consulta a situação de um boleto na instituição (cobrança).
 * @param {string} sCodConta
 * @param {string} sNumBoleto Nosso número
 * @param {string} [sSeuNumero] Seu número
 * @returns {Promise<{ boleto: object, banco: string }>}
 */
export async function consultaBoletoBanco(sCodConta, sNumBoleto, sSeuNumero = '') {
   const oParams = new URLSearchParams({
      conta: sCodConta,
      numBoleto: sNumBoleto,
      seuNumero: sSeuNumero,
   });
   return requisitaJson(`/api/bank/boletos?${oParams}`);
} // consultaBoletoBanco

/**
 * Comanda a baixa de um boleto na instituição.
 * @param {string} sCodConta
 * @param {string} sNumBoleto Nosso número
 * @param {string} sSeuNumero Seu número
 * @returns {Promise<{ baixa: object, mensagem: string }>}
 */
export async function baixaBoletoBanco(sCodConta, sNumBoleto, sSeuNumero) {
   return requisitaJson('/api/bank/boletos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conta: sCodConta, numBoleto: sNumBoleto, seuNumero: sSeuNumero }),
   });
} // baixaBoletoBanco

/**
 * Monta a URL de download de um relatório.
 *
 * Além do período, leva o escopo (extrato do sistema, do banco ou ambos) e os
 * chips de situação das grades, para que o arquivo reproduza exatamente o que
 * está sendo exibido na tela (item 6.2).
 *
 * @param {object} oOpcoes
 * @param {string} oOpcoes.sCodConta
 * @param {string} oOpcoes.sDataInicio
 * @param {string} oOpcoes.sDataFim
 * @param {'xlsx'|'csv'|'pdf'} oOpcoes.sFormato
 * @param {'ambos'|'sistema'|'banco'} [oOpcoes.sEscopo]
 * @param {object} [oOpcoes.oFiltrosGrade] Chips ligados/desligados das grades
 * @returns {string}
 */
export function montaUrlRelatorio({
   sCodConta,
   sDataInicio,
   sDataFim,
   sFormato,
   sEscopo = 'ambos',
   oFiltrosGrade,
}) {
   const oParams = new URLSearchParams({
      conta: sCodConta,
      dataInicio: sDataInicio,
      dataFim: sDataFim,
      formato: sFormato,
      escopo: sEscopo,
   });

   if (oFiltrosGrade) {
      oParams.set('lancConciliados', oFiltrosGrade.bLancConciliados ? '1' : '0');
      oParams.set('lancNaoConciliados', oFiltrosGrade.bLancNaoConciliados ? '1' : '0');
      oParams.set('movConciliados', oFiltrosGrade.bMovConciliados ? '1' : '0');
      oParams.set('movNaoConciliados', oFiltrosGrade.bMovNaoConciliados ? '1' : '0');
   }

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
