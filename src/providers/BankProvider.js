// BankProvider.js - Classe abstrata base para providers de banco
// Ticket 37060 - Refatoração Strategy/Factory

/**
 * Classe abstrata que define o contrato para todos os providers de banco.
 * Cada banco deve estender esta classe e implementar todos os métodos.
 *
 * Princípios:
 * - Single Responsibility: cada provider cuida apenas de seu banco
 * - Open/Closed: novos bancos = nova classe, sem alterar as existentes
 * - Liskov Substitution: qualquer provider pode substituir outro
 * - Dependency Inversion: a aplicação depende desta abstração, não das implementações
 */
export class BankProvider {
  constructor() {
    if (new.target === BankProvider) {
      throw new Error('BankProvider é uma classe abstrata e não pode ser instanciada diretamente.');
    }
  }

  /** @returns {string} Nome de exibição do banco (ex: "Bradesco") */
  getName() {
    throw new Error('Método getName() não implementado.');
  }

  /** @returns {string} Identificador slug do banco (ex: "bradesco") */
  getSlug() {
    throw new Error('Método getSlug() não implementado.');
  }

  /** @returns {string} Cor principal do banco para UI (ex: "#cc092f") */
  getColor() {
    return '#1a6fdb';
  }

  /**
   * Retorna as configurações do banco lidas das variáveis de ambiente.
   * @returns {object} Objeto com as configurações do banco
   */
  getConfig() {
    throw new Error('Método getConfig() não implementado.');
  }

  /**
   * Verifica se o banco está configurado (credenciais presentes).
   * @returns {boolean}
   */
  isConfigured() {
    throw new Error('Método isConfigured() não implementado.');
  }

  /**
   * Autentica com a API do banco e retorna o token de acesso.
   * @returns {Promise<string>} Access token
   */
  async authenticate() {
    throw new Error('Método authenticate() não implementado.');
  }

  /**
   * Busca o extrato bancário e retorna movimentos normalizados.
   * @param {string} dataInicio - Data início no formato DD/MM/AAAA
   * @param {string} dataFim - Data fim no formato DD/MM/AAAA
   * @returns {Promise<Array<{datMovimento: string, desHistorico: string, numDocumento: string, valEntrada: number|null, valSaida: number|null, staConciliado: boolean}>>}
   */
  async fetchExtrato(dataInicio, dataFim) {
    throw new Error('Método fetchExtrato() não implementado.');
  }

  /**
   * Verifica se uma conta corrente específica pode ser consultada.
   *
   * Separado de isConfigured(): as credenciais são globais (do .env), mas o
   * que identifica a conta na API — agência, conta, DAC — vem do cadastro.
   * Um provider com credencial válida e conta incompleta está "configurado"
   * e mesmo assim não consegue buscar o extrato daquela conta.
   *
   * @param {object|null} oConta Conta corrente cadastrada
   * @returns {string[]} Pendências; lista vazia quando a conta está pronta
   */
  verificaConta(oConta) {
    return [];
  }

  /**
   * Limpa caches internos (tokens, agents, etc).
   */
  clearCache() {
    // Default: nada para limpar
  }

  /**
   * Retorna informações públicas do provider para a UI.
   * @returns {{ slug: string, name: string, color: string, configured: boolean }}
   */
  getInfo() {
    return {
      slug: this.getSlug(),
      name: this.getName(),
      color: this.getColor(),
      configured: this.isConfigured(),
    };
  }
}
