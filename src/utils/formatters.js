// Funções utilitárias - Projeto Banco - Ticket 37060

/**
 * Formata valor monetário em Real Brasileiro
 * @param {number|null} valNumero
 * @returns {string}
 */
export function formataMoeda(valNumero) {
  if (valNumero === null || valNumero === undefined) return '–';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valNumero);
}

/**
 * Formata valor sem símbolo de moeda
 * @param {number|null} valNumero
 * @returns {string}
 */
export function formataValor(valNumero) {
  if (valNumero === null || valNumero === undefined) return '–';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valNumero);
}

/**
 * Retorna classe CSS baseada no status da situação
 * @param {string} tipSituacao
 * @returns {string}
 */
export function retornaClasseSituacao(tipSituacao) {
  const mapClasses = {
    'A Receber': 'tag-receber',
    'A Pagar': 'tag-pagar',
    Tarifa: 'tag-tarifa',
    Conciliado: 'tag-conciliado',
    Pendente: 'tag-pendente',
    Recebimento: 'tag-receber',
    Pagamento: 'tag-pagar',
    Transferência: 'tag-transferencia',
  };
  return mapClasses[tipSituacao] ?? 'tag-default';
}

/**
 * Calcula diferença entre somatórios de seleção
 */
export function calculaDiferenca(valEntradaERP, valSaidaERP, valEntradaBanco, valSaidaBanco) {
  const valLiquidoERP = valEntradaERP - valSaidaERP;
  const valLiquidoBanco = valEntradaBanco - valSaidaBanco;
  return valLiquidoERP - valLiquidoBanco;
}
