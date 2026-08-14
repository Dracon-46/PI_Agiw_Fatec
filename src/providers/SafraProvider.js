// ============================================================================
// SafraProvider.js - Provider para o Banco Safra
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Baseado no "Kit Welcome API COB V3.0" entregue pela Agiw (docs/Safra):
//
//   Token .............. POST {SAFRA_API_URL}/gateway/v1/oauth2/token
//                        (grant_type=password + client_id + username + password)
//   Registro boleto .... GET  /gateway/cobrancas/v1/boletos
//   Consulta detalhada . GET  /gateway/cobrancas-consulta/v1/consultarBoleto
//   Baixa de boleto .... POST /gateway/cobrancas-baixa/v1/realizarBaixaBoleto
//   Instrução .......... PUT  /gateway/cobrancas-instrucao/v1/realizarInstrucaoBoleto
//
// Extrato de conta corrente: o Safra publica o extrato em um produto separado
// (Conta Corrente), fora do kit COB. O caminho fica em SAFRA_EXTRATO_PATH para
// que a URL contratada seja apenas configurada, sem alterar código; o parser da
// resposta já cobre os formatos usuais do gateway. Quando o produto ainda não
// está liberado para o client_id, a API responde 401/403/404 e o provider
// devolve uma mensagem acionável em vez de uma falha genérica.
// ============================================================================

import { BankProvider } from './BankProvider.js';
import { limpaSeparadores, normalizaDataExibicao } from '../lib/conciliacao/valorUtils.js';

/** Caminho de geração de token documentado no kit (exec_token.sh) */
const TOKEN_PATH = '/gateway/v1/oauth2/token';

// ATENÇÃO — os caminhos abaixo seguem o item 6 do manual "Cobrança API
// (Emissão Direta) V3.0", que é a lista oficial de serviços. Os arquivos
// swagger do welcome kit declaram todos sob "/gateway/cobrancas/v1", o que
// está desatualizado: baixa, instrução e consulta detalhada moram em gateways
// próprios (cobrancas-baixa, cobrancas-instrucao, cobrancas-consulta).

/** Consulta de registro de boletos — GET /gateway/cobrancas/v1/boletos */
const COBRANCAS_PATH = '/gateway/cobrancas/v1/boletos';

/** Baixa de boleto — POST (manual, item 11) */
const BAIXA_PATH = '/gateway/cobrancas-baixa/v1/realizarBaixaBoleto';

/** Instrução de boleto — PUT (manual, item 10) */
const INSTRUCAO_PATH = '/gateway/cobrancas-instrucao/v1/realizarInstrucaoBoleto';

/**
 * Consulta detalhada de boleto — GET (manual, item 12).
 *
 * É a rota mais útil para a conciliação: devolve "situacao" (Em aberto,
 * Baixado, Liquidado, Protestado…) e "dadosLiquidacaoBaixado.dataLiquidacaoBaixa",
 * permitindo confirmar se o título foi efetivamente pago e quando.
 */
const CONSULTA_DETALHE_PATH = '/gateway/cobrancas-consulta/v1/consultarBoleto';

/** Extrato de conta corrente (produto contratado à parte) */
const EXTRATO_PATH_PADRAO = '/gateway/contacorrente/v1/extrato';

/** Folga, em milissegundos, para renovar o token antes de expirar */
const FOLGA_RENOVACAO_MS = 60_000;

/**
 * Indicador de baixa aceito pela API COB.
 *
 * O manual (item 11) define o campo como String "S"/"N"; o swagger do kit
 * declara um enum numérico [0,1]. Prevalece o manual, que é mais recente e
 * traz o exemplo de requisição completo.
 */
export const INDICADOR_BAIXA_SIM = 'S';

/**
 * Mantém apenas dígitos — agência e conta trafegam como inteiros na API Safra.
 * @param {string|number} sValor
 * @returns {string}
 */
function soDigitos(sValor) {
   return String(sValor ?? '').replace(/\D/g, '');
} // soDigitos

/**
 * Converte a data da tela para AAAA-MM-DD, formato aceito pelo gateway Safra.
 * @param {string} sData Aceita DD/MM/AAAA, AAAA-MM-DD, DDMMAAAA ou AAAAMMDD
 * @returns {string}
 */
export function formataDataSafra(sData) {
   const sNormalizada = normalizaDataExibicao(sData);
   if (!sNormalizada) {
      throw new Error(`Data inválida: "${sData}". Use DD/MM/AAAA.`);
   }
   const [sDia, sMes, sAno] = sNormalizada.split('/');
   return `${sAno}-${sMes}-${sDia}`;
} // formataDataSafra

/**
 * Provider do Banco Safra.
 */
export class SafraProvider extends BankProvider {
   constructor() {
      super();
      this._tokenCache = null;
   }

   getName() {
      return 'Banco Safra';
   }

   getSlug() {
      return 'safra';
   }

   getColor() {
      return '#0a3b7c';
   }

   getConfig() {
      const leEnv = (sChave) => (process.env[sChave] ?? '').trim();

      const sApiUrl = leEnv('SAFRA_API_URL') || 'https://api-hml.safranegocios.com.br';
      const sExtratoPath = leEnv('SAFRA_EXTRATO_PATH') || EXTRATO_PATH_PADRAO;

      return {
         sApiUrl,
         sClientId: leEnv('SAFRA_CLIENT_ID'),
         sUsuario: leEnv('SAFRA_USERNAME'),
         sSenha: leEnv('SAFRA_PASSWORD'),
         sAgencia: leEnv('SAFRA_AGENCIA'),
         sConta: leEnv('SAFRA_CONTA'),
         sTokenUrl: `${sApiUrl}${TOKEN_PATH}`,
         sCobrancasUrl: `${sApiUrl}${COBRANCAS_PATH}`,
         sBaixaUrl: `${sApiUrl}${BAIXA_PATH}`,
         sInstrucaoUrl: `${sApiUrl}${INSTRUCAO_PATH}`,
         sConsultaDetalheUrl: `${sApiUrl}${CONSULTA_DETALHE_PATH}`,
         sExtratoUrl: `${sApiUrl}${sExtratoPath}`,
      };
   }

   isConfigured() {
      return this.verificaConfiguracao().length === 0;
   }

   /**
    * Relaciona as pendências de configuração antes de qualquer chamada externa.
    * @returns {string[]}
    */
   verificaConfiguracao() {
      const cfg = this.getConfig();
      const aPendencias = [];

      if (!cfg.sClientId) {
         aPendencias.push('SAFRA_CLIENT_ID não informado no .env.');
      }
      if (!cfg.sUsuario) {
         aPendencias.push('SAFRA_USERNAME não informado no .env.');
      }
      if (!cfg.sSenha) {
         aPendencias.push('SAFRA_PASSWORD não informado no .env.');
      }

      return aPendencias;
   }

   // ───────── Autenticação ─────────

   /**
    * Obtém o token OAuth2 do Safra (grant_type=password).
    *
    * O gateway devolve refresh_token junto do access_token; quando há um
    * refresh válido em cache ele é usado na renovação, evitando reenviar a
    * senha do usuário de integração a cada expiração.
    *
    * @returns {Promise<string>} Access token
    */
   async authenticate() {
      const aPendencias = this.verificaConfiguracao();
      if (aPendencias.length > 0) {
         throw new Error(`Safra não configurado: ${aPendencias.join(' ')}`);
      }

      const cfg = this.getConfig();
      const nAgora = Date.now();

      // Reaproveita o token enquanto houver folga na validade
      if (this._tokenCache && this._tokenCache.nExpiraEm > nAgora + FOLGA_RENOVACAO_MS) {
         return this._tokenCache.sAccessToken;
      }

      const sBody = new URLSearchParams({
         grant_type: 'password',
         client_id: cfg.sClientId,
         username: cfg.sUsuario,
         password: cfg.sSenha,
         refresh_token: this._tokenCache?.sRefreshToken ?? '',
      }).toString();

      let oResposta;
      try {
         oResposta = await fetch(cfg.sTokenUrl, {
            method: 'POST',
            headers: {
               'Content-Type': 'application/x-www-form-urlencoded',
               Accept: 'application/json',
            },
            body: sBody,
         });
      } catch (oErro) {
         throw new Error(
            `Não foi possível alcançar o gateway do Safra (${cfg.sTokenUrl}): ${oErro.message}`
         );
      }

      const sTexto = await oResposta.text();
      let oCorpo = {};
      try {
         oCorpo = sTexto ? JSON.parse(sTexto) : {};
      } catch {
         oCorpo = {};
      }

      if (!oResposta.ok || !oCorpo.access_token) {
         // Um refresh recusado não deve travar a integração: limpa o cache
         // para que a próxima tentativa volte a autenticar com usuário e senha
         this._tokenCache = null;
         throw new Error(
            `Token Safra não obtido (Status ${oResposta.status}): ` +
               `${oCorpo.error_description || oCorpo.error || oCorpo.message || sTexto || 'resposta vazia'}`
         );
      }

      this._tokenCache = {
         sAccessToken: oCorpo.access_token,
         sRefreshToken: oCorpo.refresh_token ?? '',
         nExpiraEm: nAgora + Number(oCorpo.expires_in ?? 3600) * 1000,
      };

      return oCorpo.access_token;
   }

   // ───────── Chamada autenticada ─────────

   /**
    * Executa uma chamada autenticada ao gateway do Safra.
    *
    * @param {string} sUrl Endereço completo
    * @param {object} [oOpcoes]
    * @param {string} [oOpcoes.sMetodo] Verbo HTTP (padrão GET)
    * @param {object} [oOpcoes.oCorpo] Corpo JSON, quando houver
    * @returns {Promise<{ nStatus: number, oCorpo: object, sTexto: string }>}
    */
   async _requisita(sUrl, oOpcoes = {}) {
      const sToken = await this.authenticate();
      const sMetodo = oOpcoes.sMetodo ?? 'GET';

      let oResposta;
      try {
         oResposta = await fetch(sUrl, {
            method: sMetodo,
            headers: {
               Authorization: `Bearer ${sToken}`,
               Accept: 'application/json',
               'Content-Type': 'application/json',
               // Identificador de rastreio exigido em todas as rotas do Safra
               'Safra-Correlation-ID': crypto.randomUUID(),
            },
            body: oOpcoes.oCorpo ? JSON.stringify(oOpcoes.oCorpo) : undefined,
         });
      } catch (oErro) {
         throw new Error(`Falha de comunicação com o Safra (${sUrl}): ${oErro.message}`);
      }

      const sTexto = await oResposta.text();
      let oCorpo = {};
      try {
         oCorpo = sTexto ? JSON.parse(sTexto) : {};
      } catch {
         oCorpo = {};
      }

      return { nStatus: oResposta.status, oCorpo, sTexto };
   }

   /**
    * Extrai a mensagem de erro devolvida pelo gateway.
    * O contrato COB agrupa as mensagens em "messages"; as demais rotas usam
    * "mensagem"/"message".
    * @param {object} oCorpo
    * @param {string} sTexto
    * @returns {string}
    */
   _extraiMensagemErro(oCorpo, sTexto) {
      if (Array.isArray(oCorpo?.messages) && oCorpo.messages.length > 0) {
         return oCorpo.messages
            .map((oItem) => [oItem.code, oItem.message].filter(Boolean).join(' - '))
            .join(' | ');
      }
      return (
         oCorpo?.mensagem ||
         oCorpo?.message ||
         oCorpo?.error_description ||
         oCorpo?.error ||
         sTexto ||
         'erro não detalhado'
      );
   }

   // ───────── Extrato de conta corrente ─────────

   /**
    * Busca o extrato da conta corrente no período.
    *
    * @param {string} dataInicio Data inicial (DD/MM/AAAA)
    * @param {string} dataFim Data final (DD/MM/AAAA)
    * @param {{ codAgencia?: string, numContaCorrente?: string, tipConta?: string }|null} oConta
    * @returns {Promise<Array<object>>} Movimentos normalizados
    */
   async fetchExtrato(dataInicio, dataFim, oConta = null) {
      const cfg = this.getConfig();

      const sAgencia = soDigitos(oConta?.codAgencia || cfg.sAgencia);
      const sConta = soDigitos(oConta?.numContaCorrente || cfg.sConta);

      // Validações antes de gastar uma chamada externa
      if (!sAgencia || !sConta) {
         throw new Error(
            'Agência e conta são obrigatórias para consultar o extrato Safra. ' +
               'Cadastre a conta na tela inicial ou defina SAFRA_AGENCIA/SAFRA_CONTA no .env.'
         );
      }

      let sDataInicioApi;
      let sDataFimApi;
      try {
         sDataInicioApi = formataDataSafra(dataInicio);
         sDataFimApi = formataDataSafra(dataFim);
      } catch (oErro) {
         throw new Error(`Período inválido para a API Safra: ${oErro.message}`);
      }

      const oParams = new URLSearchParams({
         agencia: sAgencia,
         conta: sConta,
         dataInicio: sDataInicioApi,
         dataFim: sDataFimApi,
      });

      const { nStatus, oCorpo, sTexto } = await this._requisita(`${cfg.sExtratoUrl}?${oParams}`);

      // 401/403/404 no extrato indicam produto não liberado para o client_id:
      // o kit entregue cobre apenas Cobrança. A mensagem precisa dizer o que
      // fazer, e não apenas repetir o código HTTP.
      if (nStatus === 401 || nStatus === 403 || nStatus === 404) {
         throw new Error(
            `O Safra recusou a consulta de extrato (${nStatus}): ${this._extraiMensagemErro(oCorpo, sTexto)}. ` +
               'O material recebido (Kit Welcome API COB V3.0) cobre apenas Cobrança/boletos. ' +
               'Solicite à Agiw a liberação da API de Conta Corrente/Extrato para o client_id ' +
               `"${cfg.sClientId}" e confirme o caminho em SAFRA_EXTRATO_PATH (atual: ${cfg.sExtratoUrl}). ` +
               'Enquanto isso, use "Importar arquivo" com o OFX do internet banking.'
         );
      }

      if (nStatus >= 400) {
         throw new Error(
            `Erro da API Safra (Status ${nStatus}): ${this._extraiMensagemErro(oCorpo, sTexto)}`
         );
      }

      return this._normalizaMovimentos(this._extraiLancamentos(oCorpo));
   }

   /**
    * Localiza a lista de lançamentos na resposta do gateway.
    *
    * O Safra encapsula o retorno em "data" e, dependendo do produto, nomeia a
    * coleção como lancamentos / movimentos / transacoes / extrato. Procurar em
    * todos evita quebrar a integração por uma diferença de nomenclatura.
    *
    * @param {object} oCorpo
    * @returns {Array<object>}
    */
   _extraiLancamentos(oCorpo) {
      const aRaizes = [oCorpo, oCorpo?.data, oCorpo?.data?.extrato, oCorpo?.extrato].filter(
         (oItem) => oItem && typeof oItem === 'object'
      );
      const aChaves = ['lancamentos', 'movimentos', 'movimentacoes', 'transacoes', 'itens', 'extrato'];

      for (const oRaiz of aRaizes) {
         if (Array.isArray(oRaiz)) {
            return oRaiz;
         }
         for (const sChave of aChaves) {
            if (Array.isArray(oRaiz[sChave])) {
               return oRaiz[sChave];
            }
         }
      }

      return [];
   }

   /**
    * Converte o valor do lançamento em número absoluto.
    * O gateway alterna entre número e texto formatado em pt-BR ("1.250,00"),
    * por isso a conversão passa por limpaSeparadores.
    * @param {object} oLanc
    * @returns {number}
    */
   _leValor(oLanc) {
      const oValor = oLanc.valor ?? oLanc.valorLancamento ?? oLanc.valorMovimento ?? 0;

      if (typeof oValor === 'number') {
         return Math.abs(Number.isNaN(oValor) ? 0 : oValor);
      }
      try {
         return Math.abs(limpaSeparadores(oValor));
      } catch {
         return 0;
      }
   }

   /**
    * Determina se o lançamento é crédito (C) ou débito (D).
    * @param {object} oLanc
    * @returns {'C'|'D'}
    */
   _leSinal(oLanc) {
      const sSinal = String(
         oLanc.tipoLancamento ?? oLanc.indicadorDebitoCredito ?? oLanc.natureza ?? oLanc.sinal ?? ''
      )
         .trim()
         .toUpperCase();

      if (['C', 'CREDITO', 'CRÉDITO', '+'].includes(sSinal)) {
         return 'C';
      }
      if (['D', 'DEBITO', 'DÉBITO', '-'].includes(sSinal)) {
         return 'D';
      }

      // Sem indicador explícito, o sinal do próprio valor decide
      const oValorBruto = oLanc.valor ?? oLanc.valorLancamento ?? oLanc.valorMovimento ?? 0;
      const bNegativo =
         typeof oValorBruto === 'string'
            ? oValorBruto.trim().startsWith('-')
            : Number(oValorBruto) < 0;

      return bNegativo ? 'D' : 'C';
   }

   /**
    * Normaliza os lançamentos para o formato comum a todos os providers.
    * @param {Array<object>} aLancamentos
    * @returns {Array<object>}
    */
   _normalizaMovimentos(aLancamentos) {
      return aLancamentos
         .map((oLanc) => {
            const nValor = this._leValor(oLanc);
            const sSinal = this._leSinal(oLanc);
            const sData = normalizaDataExibicao(
               String(oLanc.dataLancamento ?? oLanc.dataMovimento ?? oLanc.data ?? '')
            );

            return {
               datMovimento: sData,
               desHistorico: String(
                  oLanc.historico ?? oLanc.descricao ?? oLanc.descricaoLancamento ?? 'Movimento Safra'
               ),
               numDocumento: String(oLanc.numeroDocumento ?? oLanc.documento ?? ''),
               codigoLancamento: String(oLanc.codigoLancamento ?? oLanc.codigoHistorico ?? ''),
               valEntrada: sSinal === 'C' ? nValor : null,
               valSaida: sSinal === 'D' ? nValor : null,
               staConciliado: false,
            };
         })
         // Linhas de saldo e registros sem data não são movimentação
         .filter((oMov) => Boolean(oMov.datMovimento) && (oMov.valEntrada || oMov.valSaida));
   }

   // ───────── API COB (Cobrança) ─────────

   /**
    * Consulta um boleto na API COB — apoia a ação "Baixar Título" (item 6.1.3.8).
    *
    * @param {object} oFiltro
    * @param {string} oFiltro.codAgencia
    * @param {string} oFiltro.numConta
    * @param {string} [oFiltro.numBoleto] Nosso número
    * @param {string} [oFiltro.numCliente] Seu número
    * @returns {Promise<object>} Corpo devolvido pela API
    */
   async consultaBoleto(oFiltro) {
      const cfg = this.getConfig();

      const sAgencia = soDigitos(oFiltro?.codAgencia || cfg.sAgencia);
      const sConta = soDigitos(oFiltro?.numConta || cfg.sConta);

      if (!sAgencia || !sConta) {
         throw new Error('Informe a agência e a conta para consultar o boleto no Safra.');
      }

      const oParams = new URLSearchParams({ agencia: sAgencia, conta: sConta });
      if (oFiltro.numBoleto) {
         oParams.set('numero', soDigitos(oFiltro.numBoleto));
      }
      if (oFiltro.numCliente) {
         oParams.set('numeroCliente', String(oFiltro.numCliente));
      }

      const { nStatus, oCorpo, sTexto } = await this._requisita(`${cfg.sCobrancasUrl}?${oParams}`);

      if (nStatus >= 400) {
         throw new Error(
            `Consulta de boleto Safra falhou (Status ${nStatus}): ${this._extraiMensagemErro(oCorpo, sTexto)}`
         );
      }

      return oCorpo;
   }

   /**
    * Consulta detalhada de um boleto (manual, item 12).
    *
    * Diferente de consultaBoleto(), que só confirma o registro, esta rota
    * devolve a situação do título e a data de liquidação — exatamente o que a
    * conciliação precisa para saber se o boleto foi pago e em que dia.
    *
    * @param {object} oFiltro
    * @param {string} oFiltro.codAgencia
    * @param {string} oFiltro.numConta
    * @param {string|number} oFiltro.numBoleto Nosso número (obrigatório)
    * @param {string} oFiltro.numCliente Seu número (obrigatório)
    * @returns {Promise<object>} Situação normalizada do boleto
    */
   async consultaBoletoDetalhado(oFiltro) {
      const cfg = this.getConfig();

      const sAgencia = soDigitos(oFiltro?.codAgencia || cfg.sAgencia);
      const sConta = soDigitos(oFiltro?.numConta || cfg.sConta);
      const sBoleto = soDigitos(oFiltro?.numBoleto);
      const sSeuNumero = String(oFiltro?.numCliente ?? '').trim();

      // Os quatro campos são obrigatórios segundo o manual
      if (!sAgencia || !sConta) {
         throw new Error('Informe a agência e a conta para consultar o boleto no Safra.');
      }
      if (!sBoleto) {
         throw new Error('Informe o nosso número do boleto a ser consultado.');
      }
      if (!sSeuNumero) {
         throw new Error('Informe o "seu número" do boleto — campo obrigatório na consulta.');
      }

      const oParams = new URLSearchParams({
         agencia: sAgencia,
         conta: sConta,
         numeroDoBoleto: sBoleto,
         seuNumero: sSeuNumero,
      });

      const { nStatus, oCorpo, sTexto } = await this._requisita(
         `${cfg.sConsultaDetalheUrl}?${oParams}`
      );

      if (nStatus >= 400) {
         throw new Error(
            `Consulta detalhada de boleto Safra falhou (Status ${nStatus}): ` +
               `${this._extraiMensagemErro(oCorpo, sTexto)}`
         );
      }

      const oConsulta = oCorpo?.data?.dadosConsulta ?? {};
      const oBoleto = oConsulta.dadosBoleto ?? {};
      const oLiquidacao = oConsulta.dadosLiquidacaoBaixado ?? {};
      const sSituacao = String(oBoleto.situacao ?? '');

      return {
         numBoleto: oBoleto.nossoNumero ?? sBoleto,
         numDocumento: oBoleto.numeroDocumento ?? '',
         nomPagador: oConsulta.dadosPagador?.nomeCompleto ?? '',
         valBoleto: this._leValor({ valor: oBoleto.valorBoleto }),
         datVencimento: normalizaDataExibicao(oBoleto.dataVencimento),
         datEmissao: normalizaDataExibicao(oBoleto.dataEmissao),
         // A situação vem descritiva ("BAIXADO EM 25/08/2025"), então a
         // checagem é por conteúdo e não por igualdade
         sSituacao,
         bLiquidado: /LIQUIDAD|BAIXAD/i.test(sSituacao),
         datLiquidacao: normalizaDataExibicao(oLiquidacao.dataLiquidacaoBaixa),
         oOriginal: oCorpo,
      };
   }

   /**
    * Realiza a baixa de um boleto na API COB.
    * Corpo conforme Swagger_Baixa_De_Boleto.json (BaixaBoletoEntrada): agência
    * e conta são inteiros e "seuNumero" é obrigatório.
    *
    * @param {object} oBaixa
    * @param {string} oBaixa.codAgencia
    * @param {string} oBaixa.numConta
    * @param {string|number} oBaixa.numBoleto Nosso número
    * @param {string} oBaixa.numCliente Seu número
    * @returns {Promise<object>} Dados da baixa confirmada
    */
   async baixaBoleto(oBaixa) {
      const cfg = this.getConfig();

      const sAgencia = soDigitos(oBaixa?.codAgencia || cfg.sAgencia);
      const sConta = soDigitos(oBaixa?.numConta || cfg.sConta);
      const sBoleto = soDigitos(oBaixa?.numBoleto);
      const sSeuNumero = String(oBaixa?.numCliente ?? '').trim();

      // Todas as validações antes de acionar o gateway
      if (!sAgencia || !sConta) {
         throw new Error('Informe a agência e a conta para baixar o boleto no Safra.');
      }
      if (!sBoleto) {
         throw new Error('Informe o nosso número do boleto a ser baixado.');
      }
      if (!sSeuNumero) {
         throw new Error('Informe o "seu número" do boleto — campo obrigatório na baixa do Safra.');
      }

      const { nStatus, oCorpo, sTexto } = await this._requisita(cfg.sBaixaUrl, {
         sMetodo: 'POST',
         oCorpo: {
            agencia: Number(sAgencia),
            conta: Number(sConta),
            numeroDoBoleto: Number(sBoleto),
            seuNumero: sSeuNumero,
            dadosBaixa: { indicadorBaixaBoleto: INDICADOR_BAIXA_SIM },
         },
      });

      if (nStatus >= 400) {
         throw new Error(
            `Baixa de boleto Safra recusada (Status ${nStatus}): ${this._extraiMensagemErro(oCorpo, sTexto)}`
         );
      }

      return oCorpo?.data?.dadosBaixa ?? oCorpo;
   }

   /**
    * Envia uma instrução de boleto (alteração de vencimento, protesto, etc.).
    * @param {object} oInstrucao Corpo já montado conforme o swagger de instrução
    * @returns {Promise<object>}
    */
   async instrucaoBoleto(oInstrucao) {
      const cfg = this.getConfig();

      const { nStatus, oCorpo, sTexto } = await this._requisita(cfg.sInstrucaoUrl, {
         sMetodo: 'PUT',
         oCorpo: oInstrucao,
      });

      if (nStatus >= 400) {
         throw new Error(
            `Instrução de boleto Safra recusada (Status ${nStatus}): ${this._extraiMensagemErro(oCorpo, sTexto)}`
         );
      }

      return oCorpo?.data ?? oCorpo;
   }

   clearCache() {
      this._tokenCache = null;
   }
}
