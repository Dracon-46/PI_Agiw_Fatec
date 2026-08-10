// ============================================================================
// mockData.js - Massa de dados para desenvolvimento e homologação
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Reproduz o cenário do protótipo "Conciliacao_Bancaria_Figma.pdf".
// Substituir pelas chamadas reais aos endpoints do Satis quando disponíveis:
//   /gfn/lancamento_conb          (movimentos da conciliação)
//   /gfn/lancfinanc/saldobancario (saldo da conta no sistema)
//   /pesqgen?nompesquisa=LOGO_BANCO (bancos/agências cadastrados)
// ============================================================================

/** Origens possíveis de um lançamento do sistema (tabela TBCONB001) */
export const ORIGEM_CONTAS_RECEBER = 'Contas a Receber';
export const ORIGEM_CONTAS_PAGAR = 'Contas a Pagar';
export const ORIGEM_CONCILIACAO = 'Conciliação';
export const ORIGEM_TRANSFERENCIA = 'Transferência';

/**
 * Catálogo de bancos disponíveis para cadastro de conta corrente
 * (item 6.1.1 / TBGENE015). Cores institucionais usadas no selo MarcaBanco.
 */
export const bancosDisponiveis = [
   {
      slugProvider: 'bb',
      codBanco: '001',
      nomBanco: 'Banco do Brasil',
      corBanco: '#f7d117',
      corTexto: '#0033a0',
   },
   {
      slugProvider: 'itau',
      codBanco: '341',
      nomBanco: 'Banco Itaú',
      corBanco: '#ec7000',
      corTexto: '#ffffff',
   },
   {
      slugProvider: 'bradesco',
      codBanco: '237',
      nomBanco: 'Banco Bradesco',
      corBanco: '#cc092f',
      corTexto: '#ffffff',
   },
];

/**
 * Contas correntes cadastradas — tela inicial de escolha da conta a conciliar
 * (item 6.1.1 do documento de visão). Cada conta aponta para o slug do
 * provider responsável pela integração via API.
 */
export const contasCorrentes = [
   {
      codConta: 'bb-3149-206170',
      slugProvider: 'bb',
      codBanco: '001',
      nomBanco: 'Banco do Brasil',
      codAgencia: '3149-6',
      numContaCorrente: '206170-9',
      desAgencia: 'Agência Campinas Taquaral',
      corBanco: '#f7d117',
      corTexto: '#0033a0',
      valSaldoSistema: 138115.3,
      datUltimoBloqueio: '31/05/2025',
   },
   {
      codConta: 'itau-4871-15386',
      slugProvider: 'itau',
      codBanco: '341',
      nomBanco: 'Banco Itaú',
      codAgencia: '4871',
      numContaCorrente: '15386-4',
      desAgencia: 'Agência Campinas Cambuí',
      corBanco: '#ec7000',
      corTexto: '#ffffff',
      valSaldoSistema: 150890.05,
      datUltimoBloqueio: '19/06/2025',
   },
   {
      codConta: 'bradesco-0187-9542',
      slugProvider: 'bradesco',
      codBanco: '237',
      nomBanco: 'Banco Bradesco',
      codAgencia: '0187-2',
      numContaCorrente: '9542-7',
      desAgencia: 'Agência Campinas Cambuí',
      corBanco: '#cc092f',
      corTexto: '#ffffff',
      valSaldoSistema: 2552545.3,
      datUltimoBloqueio: '30/04/2025',
   },
];

/**
 * Movimentos registrados no Satis (grade "Movimentos no Sistema").
 * Campos conforme item 6.1.2 do documento de visão.
 */
export const lancamentosSistema = [
   {
      codLancamento: 'SIS-0001',
      codConta: 'itau-4871-15386',
      datMovimento: '20/06/2025',
      datCompensacao: '25/06/2025',
      numDocumento: '000121',
      desHistorico: 'Receita de Vendas',
      valMovimento: 5727.0,
      bEntrada: true,
      tipOrigem: ORIGEM_CONTAS_RECEBER,
      staConciliado: false,
   },
   {
      codLancamento: 'SIS-0002',
      codConta: 'itau-4871-15386',
      datMovimento: '25/06/2025',
      datCompensacao: '25/06/2025',
      numDocumento: '000122',
      desHistorico: 'Recebimento Fatura',
      valMovimento: 11854.54,
      bEntrada: true,
      tipOrigem: ORIGEM_CONTAS_RECEBER,
      staConciliado: false,
   },
   {
      codLancamento: 'SIS-0003',
      codConta: 'itau-4871-15386',
      datMovimento: '25/06/2025',
      datCompensacao: '25/06/2025',
      numDocumento: '000123',
      desHistorico: 'Transferência bancária',
      valMovimento: 67.0,
      bEntrada: false,
      tipOrigem: ORIGEM_TRANSFERENCIA,
      staConciliado: false,
   },
   {
      codLancamento: 'SIS-0004',
      codConta: 'itau-4871-15386',
      datMovimento: '25/06/2025',
      datCompensacao: '25/06/2025',
      numDocumento: '000124',
      desHistorico: 'Despesas - Compras',
      valMovimento: 1774.13,
      bEntrada: false,
      tipOrigem: ORIGEM_CONTAS_PAGAR,
      staConciliado: false,
   },
   {
      codLancamento: 'SIS-0005',
      codConta: 'itau-4871-15386',
      datMovimento: '25/06/2025',
      datCompensacao: '25/06/2025',
      numDocumento: '000125',
      desHistorico: 'Tarifa bancária',
      valMovimento: 10.0,
      bEntrada: false,
      tipOrigem: ORIGEM_CONCILIACAO,
      staConciliado: false,
   },
   {
      codLancamento: 'SIS-0006',
      codConta: 'itau-4871-15386',
      datMovimento: '25/06/2025',
      datCompensacao: '25/06/2025',
      numDocumento: '000126',
      desHistorico: 'Despesas - Marketing',
      valMovimento: 10063.43,
      bEntrada: false,
      tipOrigem: ORIGEM_CONTAS_PAGAR,
      staConciliado: false,
   },
   {
      codLancamento: 'SIS-0007',
      codConta: 'itau-4871-15386',
      datMovimento: '25/06/2025',
      datCompensacao: '25/06/2025',
      numDocumento: '059722',
      desHistorico: 'Ref. 059722 - REVESTIMENTOS S.A.',
      valMovimento: 295.0,
      bEntrada: true,
      tipOrigem: ORIGEM_CONTAS_RECEBER,
      staConciliado: false,
   },
];

/**
 * Movimentos do extrato bancário (grades "Movimentos no Banco").
 * Estrutura idêntica à retornada pelos providers em fetchExtrato().
 */
export const movimentosBanco = [
   {
      codMovimento: 'BCO-0001',
      codConta: 'itau-4871-15386',
      datMovimento: '20/06/2025',
      desHistorico: 'Depósito Cliente ABC',
      numDocumento: '0000000',
      valMovimento: 5727.0,
      bEntrada: true,
      staConciliado: false,
   },
   {
      codMovimento: 'BCO-0002',
      codConta: 'itau-4871-15386',
      datMovimento: '25/06/2025',
      desHistorico: 'Recebimento Fatura 0001',
      numDocumento: '0000001',
      valMovimento: 11854.54,
      bEntrada: true,
      staConciliado: false,
   },
   {
      codMovimento: 'BCO-0003',
      codConta: 'itau-4871-15386',
      datMovimento: '25/06/2025',
      desHistorico: 'Transferência Interna',
      numDocumento: '0000002',
      valMovimento: 67.0,
      bEntrada: false,
      staConciliado: false,
   },
   {
      codMovimento: 'BCO-0004',
      codConta: 'itau-4871-15386',
      datMovimento: '25/06/2025',
      desHistorico: 'Pagamento de Fornecedor',
      numDocumento: '0000003',
      valMovimento: 1774.13,
      bEntrada: false,
      staConciliado: false,
   },
];

/**
 * Títulos em aberto usados na ação "Buscar e associar lançamentos"
 * (item 6.1.3.8 — ação 3, Baixar Título).
 */
export const titulosEmAberto = [
   {
      codTitulo: 'TIT-0001',
      datVencimento: '20/06/2025',
      nomEmitente: 'Claro Net',
      valTitulo: 750.0,
      valMulta: 0,
      valJuros: 0,
      valDesconto: 0,
      tipDocumento: 'NF',
      numDocumento: '124528/001',
      numParcela: '001',
      tipMovimento: 'Saída',
      tipOrigem: ORIGEM_CONTAS_PAGAR,
   },
   {
      codTitulo: 'TIT-0002',
      datVencimento: '25/06/2025',
      nomEmitente: 'REVESTIMENTOS S.A.',
      valTitulo: 295.0,
      valMulta: 0,
      valJuros: 0,
      valDesconto: 0,
      tipDocumento: 'NF',
      numDocumento: '059722/001',
      numParcela: '001',
      tipMovimento: 'Entrada',
      tipOrigem: ORIGEM_CONTAS_RECEBER,
   },
   {
      codTitulo: 'TIT-0003',
      datVencimento: '25/06/2025',
      nomEmitente: 'AGIW SISTEMAS LTDA',
      valTitulo: 10063.43,
      valMulta: 0,
      valJuros: 0,
      valDesconto: 0,
      tipDocumento: 'NF',
      numDocumento: '124531/001',
      numParcela: '001',
      tipMovimento: 'Saída',
      tipOrigem: ORIGEM_CONTAS_PAGAR,
   },
];

/**
 * Subgrupos de fluxo de caixa (TBFLCX002) usados nos cadastros de lançamento.
 */
export const subgruposFluxoCaixa = [
   { codSubgrupo: '18007', desSubgrupo: 'Conta Aplicação' },
   { codSubgrupo: '100000', desSubgrupo: 'Despesas Operacionais' },
   { codSubgrupo: '200000', desSubgrupo: 'Receitas Operacionais' },
   { codSubgrupo: '300000', desSubgrupo: 'Tarifas Bancárias' },
];

/** Contas contábeis (TBGENE023) */
export const contasContabeis = [
   { codContaContabil: '1110308', desContaContabil: 'Conta Aplicação Bradesco' },
   { codContaContabil: '1110301', desContaContabil: 'Bancos Conta Movimento' },
   { codContaContabil: '4110201', desContaContabil: 'Despesas Financeiras' },
];

/** Centros de custo (TBCOMP008) */
export const centrosCusto = [
   { codCentroCusto: '1100', desCentroCusto: 'ADMINISTRATIVO' },
   { codCentroCusto: '1200', desCentroCusto: 'COMERCIAL' },
   { codCentroCusto: '1300', desCentroCusto: 'OPERAÇÕES' },
];

/** Tipos de documento aceitos no lançamento bancário */
export const tiposDocumento = [
   { codTipo: 'MC', desTipo: 'Movimentos na Conciliação' },
   { codTipo: 'NF', desTipo: 'Nota Fiscal' },
   { codTipo: 'TR', desTipo: 'Transferência entre Contas' },
   { codTipo: 'TB', desTipo: 'Tarifa Bancária' },
];

/**
 * Saldos anteriores por conta, na data inicial do período.
 * Origem real: endpoint "gfn/lancfinanc/saldobancario".
 */
export const saldosAnteriores = {
   'itau-4871-15386': 150890.05,
   'bradesco-0187-9542': 2552545.3,
   'bb-3149-206170': 138115.3,
};

/**
 * Localiza uma conta corrente pelo seu código.
 * @param {string} sCodConta
 * @returns {object|null}
 */
export function buscaContaPorCodigo(sCodConta) {
   return contasCorrentes.find((oConta) => oConta.codConta === sCodConta) ?? null;
} // buscaContaPorCodigo

/**
 * Retorna a primeira conta corrente vinculada a um provider de banco.
 * @param {string} sSlugProvider
 * @returns {object|null}
 */
export function buscaContaPorProvider(sSlugProvider) {
   return contasCorrentes.find((oConta) => oConta.slugProvider === sSlugProvider) ?? null;
} // buscaContaPorProvider
