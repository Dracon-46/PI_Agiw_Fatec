// BankProviderFactory.js - Factory para instanciar providers de banco
// Ticket 37060 - Refatoração Strategy/Factory

import { BradescoProvider } from './BradescoProvider.js';
import { ItauProvider } from './ItauProvider.js';
import { BancoBrasilProvider } from './BancoBrasilProvider.js';
import { SafraProvider } from './SafraProvider.js';

/**
 * Registry de providers disponíveis.
 * Para adicionar um novo banco, basta:
 * 1. Criar uma nova classe que estende BankProvider
 * 2. Adicioná-la aqui no registry
 */
const PROVIDER_REGISTRY = {
  bradesco: BradescoProvider,
  itau: ItauProvider,
  bb: BancoBrasilProvider,
  safra: SafraProvider,
};

/** Cache de instâncias (singleton por slug) */
const instanceCache = {};

/**
 * Factory para criação de providers de banco.
 */
export class BankProviderFactory {
  /**
   * Cria (ou retorna do cache) a instância do provider para o banco informado.
   * @param {string} slug - Identificador do banco (ex: "bradesco", "itau", "bb")
   * @returns {import('./BankProvider.js').BankProvider}
   */
  static createProvider(slug) {
    const normalizedSlug = (slug || '').toLowerCase().trim();

    if (instanceCache[normalizedSlug]) {
      return instanceCache[normalizedSlug];
    }

    const ProviderClass = PROVIDER_REGISTRY[normalizedSlug];

    if (!ProviderClass) {
      const disponiveis = Object.keys(PROVIDER_REGISTRY).join(', ');
      throw new Error(
        `Provider "${slug}" não encontrado. Bancos disponíveis: ${disponiveis}`
      );
    }

    const instance = new ProviderClass();
    instanceCache[normalizedSlug] = instance;
    return instance;
  }

  /**
   * Retorna a lista de todos os providers disponíveis com suas infos.
   * @returns {Array<{ slug: string, name: string, color: string, configured: boolean }>}
   */
  static getAvailableProviders() {
    return Object.keys(PROVIDER_REGISTRY).map((slug) => {
      const instance = BankProviderFactory.createProvider(slug);
      return instance.getInfo();
    });
  }

  /**
   * Retorna o slug do provider padrão (lido de BANK_PROVIDER no .env).
   * @returns {string}
   */
  static getDefaultProvider() {
    return (process.env.BANK_PROVIDER || 'bradesco').toLowerCase().trim();
  }

  /**
   * Retorna os slugs de todos os bancos registrados.
   * @returns {string[]}
   */
  static getRegisteredSlugs() {
    return Object.keys(PROVIDER_REGISTRY);
  }

  /**
   * Limpa o cache de instâncias (útil para testes).
   */
  static clearCache() {
    for (const key of Object.keys(instanceCache)) {
      if (instanceCache[key].clearCache) {
        instanceCache[key].clearCache();
      }
      delete instanceCache[key];
    }
  }
}
