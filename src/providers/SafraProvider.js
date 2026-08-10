// ============================================================================
// SafraProvider.js - Provider para o Banco Safra
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Autenticação conforme o "Kit Welcome API COB V3.0" (docs/Safra):
//   POST {SAFRA_API_URL}/gateway/v1/oauth2/token
//   grant_type=password + client_id + username + password
//
// ATENÇÃO — escopo do material disponível:
// O kit entregue cobre a API COB (Cobrança/boletos): consulta, baixa e
// instrução de boleto. Ele NÃO contém o serviço de extrato de conta corrente,
// que é o necessário para a conciliação bancária. Enquanto a Agiw não
// disponibilizar o kit de Conta Corrente/Extrato, fetchExtrato() informa a
// pendência em vez de adivinhar um endpoint.
// ============================================================================

import { BankProvider } from './BankProvider.js';

/** Caminho de geração de token documentado no kit */
const TOKEN_PATH = '/gateway/v1/oauth2/token';

/** Caminho de consulta de boletos (API COB) */
const COBRANCAS_PATH = '/gateway/cobrancas/v1/boletos';

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

      return {
         sApiUrl,
         sClientId: leEnv('SAFRA_CLIENT_ID'),
         sUsuario: leEnv('SAFRA_USERNAME'),
         sSenha: leEnv('SAFRA_PASSWORD'),
         sTokenUrl: `${sApiUrl}${TOKEN_PATH}`,
         sCobrancasUrl: `${sApiUrl}${COBRANCAS_PATH}`,
      };
   }

   isConfigured() {
      return this.verificaConfiguracao().length === 0;
   }

   /**
    * Relaciona as pendências de configuração.
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

   /**
    * Obtém o token OAuth2 do Safra (grant_type=password).
    * @returns {Promise<string>} Access token
    */
   async authenticate() {
      const aPendencias = this.verificaConfiguracao();
      if (aPendencias.length > 0) {
         throw new Error(`Safra não configurado: ${aPendencias.join(' ')}`);
      }

      const cfg = this.getConfig();
      const nAgora = Date.now();

      // Reaproveita o token enquanto houver folga de um minuto na validade
      if (this._tokenCache && this._tokenCache.nExpiraEm > nAgora + 60000) {
         return this._tokenCache.sAccessToken;
      }

      const sBody = new URLSearchParams({
         grant_type: 'password',
         client_id: cfg.sClientId,
         username: cfg.sUsuario,
         password: cfg.sSenha,
         refresh_token: '',
      }).toString();

      const oResposta = await fetch(cfg.sTokenUrl, {
         method: 'POST',
         headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
         },
         body: sBody,
      });

      const sTexto = await oResposta.text();
      let oCorpo = {};
      try {
         oCorpo = sTexto ? JSON.parse(sTexto) : {};
      } catch {
         oCorpo = {};
      }

      if (!oResposta.ok || !oCorpo.access_token) {
         throw new Error(
            `Token Safra não obtido (Status ${oResposta.status}): ` +
               `${oCorpo.error_description || oCorpo.error || oCorpo.message || sTexto || 'resposta vazia'}`
         );
      }

      this._tokenCache = {
         sAccessToken: oCorpo.access_token,
         nExpiraEm: nAgora + Number(oCorpo.expires_in ?? 3600) * 1000,
      };

      return oCorpo.access_token;
   }

   /**
    * Busca o extrato da conta corrente.
    * @param {string} dataInicio
    * @param {string} dataFim
    * @returns {Promise<Array<object>>}
    */
   async fetchExtrato(dataInicio, dataFim) {
      throw new Error(
         'O material disponível do Safra (Kit Welcome API COB V3.0) cobre apenas a API de ' +
            'Cobrança/boletos, que não fornece extrato de conta corrente. ' +
            'Solicite à Agiw o kit da API de Conta Corrente/Extrato do Safra para concluir esta integração.'
      );
   }

   /**
    * Consulta um boleto na API COB — base para a ação "Baixar Título".
    * @param {{ codAgencia: string, numConta: string, numBoleto?: string, numCliente?: string }} oFiltro
    * @returns {Promise<object>} Corpo devolvido pela API
    */
   async consultaBoleto(oFiltro) {
      const cfg = this.getConfig();
      const sToken = await this.authenticate();

      const oParams = new URLSearchParams({
         agencia: oFiltro.codAgencia,
         conta: oFiltro.numConta,
      });
      if (oFiltro.numBoleto) {
         oParams.set('numero', oFiltro.numBoleto);
      }
      if (oFiltro.numCliente) {
         oParams.set('numeroCliente', oFiltro.numCliente);
      }

      const oResposta = await fetch(`${cfg.sCobrancasUrl}?${oParams}`, {
         method: 'GET',
         headers: {
            Authorization: `Bearer ${sToken}`,
            'Content-Type': 'application/json',
            // Identificador de rastreio exigido pela API do Safra
            'Safra-Correlation-ID': crypto.randomUUID(),
         },
      });

      const oCorpo = await oResposta.json().catch(() => ({}));

      if (!oResposta.ok) {
         throw new Error(
            `Consulta de boleto Safra falhou (Status ${oResposta.status}): ` +
               `${oCorpo.mensagem || oCorpo.message || 'erro não detalhado'}`
         );
      }

      return oCorpo;
   }

   clearCache() {
      this._tokenCache = null;
   }
}
