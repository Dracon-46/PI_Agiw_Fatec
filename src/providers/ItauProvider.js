// ItauProvider.js - Provider stub para o Itaú
// Ticket 37060 - Refatoração Strategy/Factory

import { BankProvider } from './BankProvider.js';

/**
 * Provider para integração com o Itaú.
 * Atualmente é um stub — a estrutura está pronta para implementação
 * quando as credenciais e documentação da API estiverem disponíveis.
 */
export class ItauProvider extends BankProvider {
  constructor() {
    super();
    this._tokenCache = null;
  }

  getName() {
    return 'Itaú';
  }

  getSlug() {
    return 'itau';
  }

  getColor() {
    return '#003399';
  }

  getConfig() {
    return {
      sApiUrl: process.env.ITAU_API_URL || '',
      sClientId: process.env.ITAU_CLIENT_ID || '',
      sClientSecret: process.env.ITAU_CLIENT_SECRET || '',
    };
  }

  isConfigured() {
    const cfg = this.getConfig();
    return Boolean(cfg.sApiUrl && cfg.sClientId && cfg.sClientSecret);
  }

  async authenticate() {
    if (!this.isConfigured()) {
      throw new Error(
        'Itaú não configurado. Defina ITAU_API_URL, ITAU_CLIENT_ID e ITAU_CLIENT_SECRET no .env'
      );
    }
    // TODO: Implementar autenticação OAuth2 do Itaú
    throw new Error('Autenticação Itaú ainda não implementada. Aguardando documentação da API.');
  }

  async fetchExtrato(dataInicio, dataFim) {
    if (!this.isConfigured()) {
      throw new Error(
        'Itaú não configurado. Defina ITAU_API_URL, ITAU_CLIENT_ID e ITAU_CLIENT_SECRET no .env'
      );
    }
    // TODO: Implementar busca de extrato do Itaú
    throw new Error('Busca de extrato Itaú ainda não implementada. Aguardando documentação da API.');
  }

  clearCache() {
    this._tokenCache = null;
  }
}
