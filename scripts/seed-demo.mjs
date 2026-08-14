// ============================================================================
// seed-demo.mjs - Massa de dados para testes e homologação
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Popula o MySQL com um cenário completo, capaz de exercitar todas as regras
// do documento de visão sem depender das APIs bancárias:
//
//   contas ......... NENHUMA é criada. O script popula apenas as contas
//                    reais já cadastradas na tela inicial — nada de conta
//                    fictícia entrando na base;
//   extrato banco .. movimentos distribuídos no período, incluindo créditos,
//                    débitos, tarifas e um par já conciliado;
//   extrato Satis .. lançamentos que exercitam cada caminho da conciliação:
//                    correspondência exata 1-para-1, agrupamento por somatória,
//                    pendências só no ERP e movimentos só no banco;
//   títulos ........ contas a pagar e a receber em aberto, parte delas com
//                    valor idêntico a movimentos pendentes, para exercitar a
//                    ação "Baixar Título" seguida da conciliação;
//   auditoria ...... registro da carga, visível na tela de auditoria.
//
// As datas são relativas ao dia da execução, então a massa nunca "envelhece".
// A geração é determinística: rodar duas vezes produz exatamente o mesmo
// resultado, e a carga é idempotente (limpa o que criou antes de recriar).
//
// Uso:
//   node scripts/seed-demo.mjs            popula todas as contas
//   node scripts/seed-demo.mjs --limpar   remove apenas a massa de exemplo
// ============================================================================

import 'dotenv/config';
import { query } from '../src/lib/db.js';
import { listaContasCorrentes } from '../src/lib/repositories/contaRepository.js';
import { insereLancamento } from '../src/lib/repositories/lancamentoRepository.js';
import { gravaMovimentosImportados } from '../src/lib/repositories/movimentoRepository.js';
import { gravaTitulo } from '../src/lib/repositories/tituloRepository.js';
import {
   ACAO_IMPORTACAO_ARQUIVO,
   registraAuditoria,
} from '../src/lib/repositories/auditoriaRepository.js';
import { comparaDatas, formataDataBr, somaDiasData } from '../src/utils/formatters.js';

/** Prefixos dos registros criados por este script, usados na limpeza */
const PREFIXO_MOVIMENTO = 'DEMO';
const PREFIXO_LANCAMENTO = 'ERP';
const PREFIXO_TITULO = 'TIT';

/** Origens dos lançamentos gerados */
const ORIGEM_RECEBER = 'Contas a Receber';
const ORIGEM_PAGAR = 'Contas a Pagar';
const ORIGEM_CONCILIACAO = 'Conciliação';

/**
 * Descrições usadas nos movimentos bancários, alternadas por índice para que
 * o extrato pareça um extrato de verdade e não uma repetição.
 */
const HISTORICOS_CREDITO = [
   'TED RECEBIDA - COMERCIAL PRIMAVERA LTDA',
   'CREDITO COBRANCA - TITULO 4471',
   'PIX RECEBIDO - REVESTIMENTOS S.A.',
   'DEPOSITO EM DINHEIRO - AGENCIA',
   'LIQUIDACAO DE BOLETO - CLIENTE 8823',
   'RESGATE APLICACAO AUTOMATICA',
];

const HISTORICOS_DEBITO = [
   'PAGAMENTO FORNECEDOR - METALURGICA ANDRADE',
   'TED ENVIADA - FOLHA DE PAGAMENTO',
   'DEBITO CONVENIO - ENERGIA ELETRICA',
   'PIX ENVIADO - TRANSPORTADORA VELOZ',
   'PAGAMENTO DE TRIBUTOS - DARF',
   'APLICACAO AUTOMATICA',
];

/**
 * Gerador pseudoaleatório determinístico (LCG).
 *
 * Math.random deixaria a massa diferente a cada execução, impedindo comparar
 * resultados entre rodadas de teste.
 *
 * @param {number} iSemente
 * @returns {() => number} Função que devolve um número em [0, 1)
 */
function criaSorteador(iSemente) {
   let iEstado = iSemente >>> 0;
   return function sorteia() {
      iEstado = (iEstado * 1664525 + 1013904223) >>> 0;
      return iEstado / 4294967296;
   };
} // criaSorteador

/**
 * Arredonda para duas casas.
 * @param {number} nValor
 * @returns {number}
 */
function arredonda(nValor) {
   return Math.round(nValor * 100) / 100;
} // arredonda

/**
 * Janela de datas em que a massa é distribuída.
 *
 * Precisa coincidir com o período que a tela abre por padrão
 * (NEXT_PUBLIC_PERIODO_INICIO/FIM), senão a grade do sistema — que é filtrada
 * por período — abriria vazia mesmo com a base populada. Sem configuração,
 * usa os últimos 45 dias, acompanhando a regra do item 6.1.3.2.
 *
 * @returns {{ sInicio: string, sFim: string, iDias: number }}
 */
function obtemJanela() {
   const sInicioEnv = (process.env.NEXT_PUBLIC_PERIODO_INICIO ?? '').trim();
   const sFimEnv = (process.env.NEXT_PUBLIC_PERIODO_FIM ?? '').trim();

   const sFim = sFimEnv || somaDiasData(formataDataBr(new Date()), -1);
   const sInicio = sInicioEnv || somaDiasData(sFim, -45);

   return { sInicio, sFim, iDias: Math.max(diferencaEmDias(sInicio, sFim), 1) };
} // obtemJanela

/**
 * Diferença em dias entre duas datas DD/MM/AAAA.
 * @param {string} sDe
 * @param {string} sAte
 * @returns {number}
 */
function diferencaEmDias(sDe, sAte) {
   return Math.round(comparaDatas(sAte, sDe) / 86400000);
} // diferencaEmDias

/** Janela usada por toda a carga */
const JANELA = obtemJanela();

/**
 * Data em uma posição proporcional dentro da janela.
 * @param {number} nFracao 0 = início da janela, 1 = fim
 * @returns {string} Data em DD/MM/AAAA
 */
function dataNaJanela(nFracao) {
   const iDeslocamento = Math.round(JANELA.iDias * Math.min(Math.max(nFracao, 0), 1));
   return somaDiasData(JANELA.sInicio, iDeslocamento);
} // dataNaJanela

/**
 * Data anterior ao início da janela — usada nos lançamentos que compõem o
 * saldo anterior e nos títulos já vencidos.
 * @param {number} iDias Quantidade de dias antes do início
 * @returns {string}
 */
function dataAntesDaJanela(iDias) {
   return somaDiasData(JANELA.sInicio, -Math.abs(iDias));
} // dataAntesDaJanela

/**
 * Data posterior ao fim da janela — títulos a vencer, que não devem aparecer
 * na baixa enquanto a data limite for a do período.
 * @param {number} iDias Quantidade de dias após o fim
 * @returns {string}
 */
function dataDepoisDaJanela(iDias) {
   return somaDiasData(JANELA.sFim, Math.abs(iDias));
} // dataDepoisDaJanela

/**
 * Devolve as contas correntes já cadastradas.
 *
 * O script deliberadamente NÃO cria contas: a conta corrente representa uma
 * agência real do cliente e cadastrá-la é decisão de quem opera o sistema.
 * Inventar contas aqui poluiria a tela inicial com bancos que não existem.
 *
 * @returns {Promise<Array<object>>}
 */
async function obtemContas() {
   const aContas = await listaContasCorrentes();

   if (aContas.length === 0) {
      throw new Error(
         'Nenhuma conta corrente cadastrada. Cadastre a conta na tela inicial ' +
            '("Cadastrar conta") e rode este script novamente.'
      );
   }

   return aContas;
} // obtemContas

/**
 * Monta o extrato bancário de uma conta.
 *
 * @param {object} oConta
 * @param {number} iSemente Semente do sorteador, para variar entre contas
 * @returns {Array<object>} Movimentos prontos para gravação
 */
function montaMovimentos(oConta, iSemente) {
   const sorteia = criaSorteador(iSemente);
   const aMovimentos = [];

   /**
    * Acrescenta um movimento ao extrato.
    * @param {object} oDados
    */
   function adiciona(oDados) {
      const iSequencia = aMovimentos.length + 1;
      aMovimentos.push({
         codMovimento: `${PREFIXO_MOVIMENTO}-${oConta.codConta}-${String(iSequencia).padStart(3, '0')}`,
         codConta: oConta.codConta,
         numDocumento: String(700000 + iSemente * 100 + iSequencia),
         staConciliado: false,
         ...oDados,
      });
   } // adiciona

   // ---- Movimentos distribuídos nos últimos 40 dias ----
   // Alterna crédito e débito para que a grade tenha os dois sentidos
   for (let iIndice = 0; iIndice < 12; iIndice += 1) {
      const bEntrada = iIndice % 2 === 0;
      // Espalha os 12 movimentos entre 5% e 90% da janela
      const nFracao = 0.05 + (iIndice / 11) * 0.85;
      const nValor = arredonda(500 + sorteia() * 9500);

      adiciona({
         datMovimento: dataNaJanela(nFracao),
         desHistorico: bEntrada
            ? HISTORICOS_CREDITO[iIndice % HISTORICOS_CREDITO.length]
            : HISTORICOS_DEBITO[iIndice % HISTORICOS_DEBITO.length],
         valMovimento: nValor,
         bEntrada,
      });
   }

   // ---- Tarifas: valores pequenos que ficam pendentes no banco ----
   adiciona({
      datMovimento: dataNaJanela(0.25),
      desHistorico: 'TARIFA PACOTE DE SERVICOS',
      valMovimento: 89.9,
      bEntrada: false,
   });
   adiciona({
      datMovimento: dataNaJanela(0.65),
      desHistorico: 'TARIFA COBRANCA - LIQUIDACAO DE BOLETOS',
      valMovimento: 42.5,
      bEntrada: false,
   });

   // ---- Par já conciliado, para exercitar os filtros e o estorno ----
   adiciona({
      datMovimento: dataNaJanela(0.15),
      desHistorico: 'PIX RECEBIDO - ADIANTAMENTO CONTRATO 2210',
      valMovimento: 12500.0,
      bEntrada: true,
      staConciliado: true,
   });

   return aMovimentos;
} // montaMovimentos

/**
 * Monta os lançamentos do ERP a partir do extrato bancário.
 *
 * @param {object} oConta
 * @param {Array<object>} aMovimentos Extrato já montado
 * @returns {Array<object>} Lançamentos prontos para gravação
 */
function montaLancamentos(oConta, aMovimentos) {
   const aLancamentos = [];

   /**
    * Acrescenta um lançamento à lista.
    * @param {object} oDados
    */
   function adiciona(oDados) {
      const iSequencia = aLancamentos.length + 1;
      aLancamentos.push({
         codLancamento: `${PREFIXO_LANCAMENTO}-${String(iSequencia).padStart(4, '0')}`,
         numDocumento: String(100000 + iSequencia),
         ...oDados,
      });
   } // adiciona

   // ---- 1) Saldo anterior: lançamentos antes do período exibido ----
   // Sem eles o campo "Saldo anterior" da tela ficaria sempre zerado
   adiciona({
      datMovimento: dataAntesDaJanela(90),
      desHistorico: 'Saldo transportado do exercício anterior',
      valMovimento: 45000.0,
      bEntrada: true,
      tipOrigem: ORIGEM_RECEBER,
      staConciliado: true,
   });
   adiciona({
      datMovimento: dataAntesDaJanela(80),
      desHistorico: 'Pagamento de fornecedores — competência anterior',
      valMovimento: 18250.4,
      bEntrada: false,
      tipOrigem: ORIGEM_PAGAR,
      staConciliado: true,
   });

   // ---- 2) Espelho exato dos 6 primeiros movimentos: auto conciliação 1-para-1 ----
   for (const oMovimento of aMovimentos.slice(0, 6)) {
      adiciona({
         datMovimento: oMovimento.datMovimento,
         datCompensacao: oMovimento.datMovimento,
         desHistorico: oMovimento.bEntrada
            ? `Recebimento ref. ${oMovimento.desHistorico}`
            : `Pagamento ref. ${oMovimento.desHistorico}`,
         valMovimento: oMovimento.valMovimento,
         bEntrada: oMovimento.bEntrada,
         tipOrigem: oMovimento.bEntrada ? ORIGEM_RECEBER : ORIGEM_PAGAR,
      });
   }

   // ---- 3) Um movimento coberto por dois lançamentos: agrupamento por somatória ----
   const oParaDividir = aMovimentos[6];
   if (oParaDividir) {
      const nMetade = arredonda(oParaDividir.valMovimento / 2);
      const nResto = arredonda(oParaDividir.valMovimento - nMetade);

      for (const [iParcela, nValor] of [
         [1, nMetade],
         [2, nResto],
      ]) {
         adiciona({
            datMovimento: oParaDividir.datMovimento,
            datCompensacao: oParaDividir.datMovimento,
            desHistorico: `${oParaDividir.desHistorico} — parcela ${iParcela}/2`,
            valMovimento: nValor,
            bEntrada: oParaDividir.bEntrada,
            tipOrigem: oParaDividir.bEntrada ? ORIGEM_RECEBER : ORIGEM_PAGAR,
         });
      }
   }

   // ---- 4) Par já conciliado dos dois lados ----
   const oConciliado = aMovimentos.find((oItem) => oItem.staConciliado);
   if (oConciliado) {
      adiciona({
         datMovimento: oConciliado.datMovimento,
         datCompensacao: oConciliado.datMovimento,
         desHistorico: 'Adiantamento contrato 2210 — cliente Primavera',
         valMovimento: oConciliado.valMovimento,
         bEntrada: true,
         tipOrigem: ORIGEM_RECEBER,
         staConciliado: true,
      });
   }

   // ---- 5) Pendências que existem apenas no ERP ----
   adiciona({
      datMovimento: dataNaJanela(0.45),
      desHistorico: 'Nota fiscal 059722 — REVESTIMENTOS S.A.',
      valMovimento: 2950.0,
      bEntrada: true,
      tipOrigem: ORIGEM_RECEBER,
   });
   adiciona({
      datMovimento: dataNaJanela(0.6),
      desHistorico: 'Aluguel do galpão — matriz',
      valMovimento: 7300.0,
      bEntrada: false,
      tipOrigem: ORIGEM_PAGAR,
   });
   adiciona({
      datMovimento: dataNaJanela(0.8),
      desHistorico: 'Reembolso de despesas de viagem',
      valMovimento: 1284.37,
      bEntrada: false,
      tipOrigem: ORIGEM_CONCILIACAO,
   });

   return aLancamentos;
} // montaLancamentos

/**
 * Monta os títulos em aberto de uma conta.
 *
 * Dois deles têm valor idêntico a movimentos ainda pendentes do banco: ao
 * baixar o título, o lançamento gerado fecha a conciliação com diferença zero.
 *
 * @param {object} oConta
 * @param {Array<object>} aMovimentos Extrato já montado
 * @returns {Array<object>} Títulos prontos para gravação
 */
function montaTitulos(oConta, aMovimentos) {
   const aTitulos = [];

   /**
    * Acrescenta um título à lista.
    * @param {object} oDados
    */
   function adiciona(oDados) {
      const iSequencia = aTitulos.length + 1;
      aTitulos.push({
         idConta: oConta.idConta,
         codTitulo: `${PREFIXO_TITULO}-${oConta.codConta}-${String(iSequencia).padStart(3, '0')}`,
         numParcela: '001',
         tipDocumento: 'NF',
         // Nosso número: habilita a consulta do boleto na instituição.
         // Só faz sentido nos títulos a receber, que são os emitidos por nós.
         numBoleto: String(960000000 + iSequencia),
         ...oDados,
      });
   } // adiciona

   // ---- Títulos casados com movimentos pendentes do banco ----
   // Movimentos 8 e 9 não têm lançamento espelho: são o alvo natural da baixa
   const aPendentes = aMovimentos.slice(7, 9);
   for (const oMovimento of aPendentes) {
      adiciona({
         datEmissao: somaDiasData(oMovimento.datMovimento, -30),
         datVencimento: oMovimento.datMovimento,
         nomEmitente: oMovimento.bEntrada ? 'COMERCIAL PRIMAVERA LTDA' : 'METALURGICA ANDRADE LTDA',
         desHistorico: `Documento correspondente a: ${oMovimento.desHistorico}`,
         numDocumento: oMovimento.numDocumento,
         valTitulo: oMovimento.valMovimento,
         tipMovimento: oMovimento.bEntrada ? 'Entrada' : 'Saída',
         tipOrigem: oMovimento.bEntrada ? ORIGEM_RECEBER : ORIGEM_PAGAR,
      });
   }

   // ---- Título vencido com multa e juros, para exercitar os encargos ----
   adiciona({
      datEmissao: dataAntesDaJanela(40),
      datVencimento: dataNaJanela(0.2),
      nomEmitente: 'TRANSPORTADORA VELOZ LTDA',
      desHistorico: 'Frete sobre vendas — competência anterior',
      numDocumento: '124528',
      valTitulo: 3480.0,
      valMulta: 69.6,
      valJuros: 46.4,
      tipMovimento: 'Saída',
      tipOrigem: ORIGEM_PAGAR,
   });

   // ---- Título a receber com desconto por antecipação ----
   adiciona({
      datEmissao: dataAntesDaJanela(10),
      datVencimento: dataNaJanela(0.7),
      nomEmitente: 'REVESTIMENTOS S.A.',
      desHistorico: 'Venda de mercadorias — pedido 8891',
      numDocumento: '059733',
      valTitulo: 8900.0,
      valDesconto: 178.0,
      tipMovimento: 'Entrada',
      tipOrigem: ORIGEM_RECEBER,
   });

   // ---- Títulos a vencer, fora do período: não devem aparecer na baixa ----
   adiciona({
      datEmissao: dataNaJanela(0.5),
      datVencimento: dataDepoisDaJanela(25),
      nomEmitente: 'ENERGIA ELETRICA S.A.',
      desHistorico: 'Fatura de energia — próximo vencimento',
      numDocumento: '778211',
      valTitulo: 2140.85,
      tipMovimento: 'Saída',
      tipOrigem: ORIGEM_PAGAR,
   });
   adiciona({
      datEmissao: dataNaJanela(0.9),
      datVencimento: dataDepoisDaJanela(40),
      nomEmitente: 'CLIENTE 8823 - DISTRIBUIDORA NORTE',
      desHistorico: 'Duplicata a receber — parcela 2/3',
      numDocumento: '059801',
      numParcela: '002',
      valTitulo: 5600.0,
      tipMovimento: 'Entrada',
      tipOrigem: ORIGEM_RECEBER,
   });

   return aTitulos;
} // montaTitulos

/**
 * Remove a massa de exemplo de uma conta.
 * @param {number} iIdConta
 * @returns {Promise<{ iMovimentos: number, iLancamentos: number, iTitulos: number }>}
 */
async function limpaConta(iIdConta) {
   const oMovimentos = await query(
      `DELETE FROM movimento_banco WHERE id_conta = :idConta AND cod_movimento LIKE :prefixo`,
      { idConta: iIdConta, prefixo: `${PREFIXO_MOVIMENTO}-%` }
   );
   const oLancamentos = await query(
      `DELETE FROM lancamento_sistema WHERE id_conta = :idConta AND cod_lancamento LIKE :prefixo`,
      { idConta: iIdConta, prefixo: `${PREFIXO_LANCAMENTO}-%` }
   );
   const oTitulos = await query(
      `DELETE FROM titulo_aberto WHERE id_conta = :idConta AND cod_titulo LIKE :prefixo`,
      { idConta: iIdConta, prefixo: `${PREFIXO_TITULO}-%` }
   );

   return {
      iMovimentos: oMovimentos.affectedRows ?? 0,
      iLancamentos: oLancamentos.affectedRows ?? 0,
      iTitulos: oTitulos.affectedRows ?? 0,
   };
} // limpaConta

/**
 * Popula uma conta com o cenário completo.
 * @param {object} oConta
 * @param {number} iSemente
 * @returns {Promise<object>} Quantidades gravadas
 */
async function populaConta(oConta, iSemente) {
   // Recria a massa para manter o resultado previsível entre execuções
   await limpaConta(oConta.idConta);

   const aMovimentos = montaMovimentos(oConta, iSemente);
   const aLancamentos = montaLancamentos(oConta, aMovimentos);
   const aTitulos = montaTitulos(oConta, aMovimentos);

   await gravaMovimentosImportados(oConta.idConta, aMovimentos);

   for (const oLancamento of aLancamentos) {
      await insereLancamento(oConta.idConta, oLancamento);
   }
   for (const oTitulo of aTitulos) {
      await gravaTitulo(oTitulo);
   }

   await registraAuditoria({
      idConta: oConta.idConta,
      tipAcao: ACAO_IMPORTACAO_ARQUIVO,
      desEntidade: 'massa-de-teste',
      codEntidade: 'seed-demo',
      desDetalhe:
         `Massa de testes gerada: ${aMovimentos.length} movimento(s) do banco, ` +
         `${aLancamentos.length} lançamento(s) do sistema e ${aTitulos.length} título(s) em aberto.`,
   });

   return {
      iMovimentos: aMovimentos.length,
      iLancamentos: aLancamentos.length,
      iTitulos: aTitulos.length,
   };
} // populaConta

/**
 * Rotina principal.
 */
async function main() {
   const bLimpar = process.argv.includes('--limpar');

   if (bLimpar) {
      const aContas = await listaContasCorrentes();
      let iTotal = 0;

      for (const oConta of aContas) {
         const oRemovidos = await limpaConta(oConta.idConta);
         const iSoma = oRemovidos.iMovimentos + oRemovidos.iLancamentos + oRemovidos.iTitulos;
         if (iSoma > 0) {
            console.log(
               `${oConta.codConta}: ${oRemovidos.iMovimentos} movimento(s), ` +
                  `${oRemovidos.iLancamentos} lançamento(s), ${oRemovidos.iTitulos} título(s).`
            );
         }
         iTotal += iSoma;
      }

      console.log(`\nMassa de exemplo removida: ${iTotal} registro(s).`);
      return;
   }

   const aContas = await obtemContas();

   console.log('\nPopulando as contas:');
   let iSemente = 7;

   for (const oConta of aContas) {
      const oResultado = await populaConta(oConta, iSemente);
      console.log(
         `  ${oConta.codConta.padEnd(26)} ` +
            `${String(oResultado.iMovimentos).padStart(3)} movimentos | ` +
            `${String(oResultado.iLancamentos).padStart(3)} lançamentos | ` +
            `${String(oResultado.iTitulos).padStart(3)} títulos`
      );
      iSemente += 13;
   }

   console.log('\nCenários disponíveis em cada conta:');
   console.log('  • 6 pares idênticos          → botão "Auto conciliar" resolve 1-para-1');
   console.log('  • 1 movimento em 2 parcelas  → auto conciliação por somatória');
   console.log('  • 1 par já conciliado        → filtros de situação e botão "Desfazer"');
   console.log('  • tarifas e pendências       → conciliação manual e "Novo Lançamento"');
   console.log('  • 4 títulos vencidos         → ação "Baixar Título" (2 fecham com o banco)');
   console.log('  • 2 títulos a vencer         → não aparecem na baixa até a data limite');
   console.log('  • transferência entre contas → exige 2+ contas cadastradas');
   console.log('\nAbra a tela, escolha uma conta e clique em Buscar.');
} // main

main()
   .then(() => process.exit(0))
   .catch((oErro) => {
      console.error('Falha ao popular a base:', oErro.message);
      process.exit(1);
   });
