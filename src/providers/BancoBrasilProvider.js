// BancoBrasilProvider.js - Provider stub para o Banco do Brasil
// Ticket 37060 - Refatoração Strategy/Factory

import { BankProvider } from './BankProvider.js';

/**
 * Provider para integração com o Banco do Brasil.
 * Atualmente é um stub — a estrutura está pronta para implementação
 * quando as credenciais e documentação da API estiverem disponíveis.
 */
export class BancoBrasilProvider extends BankProvider {
  constructor() {
    super();
    this._tokenCache = null;
  }

  getName() {
    return 'Banco do Brasil';
  }

  getSlug() {
    return 'bb';
  }

  getColor() {
    return '#ffef00';
  }

  getConfig() {
    return {
      sApiUrl: process.env.BB_API_URL || '',
      sClientId: process.env.BB_CLIENT_ID || '',
      sClientSecret: process.env.BB_CLIENT_SECRET || '',
      sAppKey: process.env.BB_APP_KEY || '',
    };
  }

  isConfigured() {
    const cfg = this.getConfig();
    return Boolean(cfg.sApiUrl && cfg.sClientId && cfg.sClientSecret);
  }

  async authenticate() {
    if (!this.isConfigured()) {
      throw new Error(
        'Banco do Brasil não configurado. Defina BB_API_URL, BB_CLIENT_ID e BB_CLIENT_SECRET no .env'
      );
    }
    // TODO: Implementar autenticação OAuth2 do BB
    throw new Error('Autenticação Banco do Brasil ainda não implementada. Aguardando documentação da API.');
  }

  async fetchExtrato(dataInicio, dataFim) {
    if (!this.isConfigured()) {
      throw new Error(
        'Banco do Brasil não configurado. Defina BB_API_URL, BB_CLIENT_ID e BB_CLIENT_SECRET no .env'
      );
    }
    // TODO: Implementar busca de extrato do BB
    throw new Error('Busca de extrato Banco do Brasil ainda não implementada. Aguardando documentação da API.');
  }

  clearCache() {
    this._tokenCache = null;
  }
}
