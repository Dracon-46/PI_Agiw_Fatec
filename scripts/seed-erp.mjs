// ============================================================================
// seed-erp.mjs - Popula lançamentos de exemplo no lado ERP
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Cria lançamentos no extrato do sistema espelhando o extrato bancário já
// importado, para exercitar a conciliação sem depender da integração Satis:
//
//   - parte dos lançamentos tem data e valor IDÊNTICOS a movimentos do banco,
//     permitindo validar a conciliação automática 1-para-1;
//   - um movimento do banco é coberto por DOIS lançamentos que somam o valor,
//     exercitando o agrupamento por somatória;
//   - alguns lançamentos existem só no ERP e alguns movimentos só no banco,
//     representando as pendências reais de uma conciliação.
//
// Uso:  node scripts/seed-erp.mjs [codConta]
//       node scripts/seed-erp.mjs --limpar     (remove os lançamentos de exemplo)
// ============================================================================

import 'dotenv/config';
import { listaContasCorrentes } from '../src/lib/repositories/contaRepository.js';
import { insereLancamento } from '../src/lib/repositories/lancamentoRepository.js';
import { listaMovimentosConta } from '../src/lib/repositories/movimentoRepository.js';
import { ACAO_LANCAMENTO_INCLUIDO, registraAuditoria } from '../src/lib/repositories/auditoriaRepository.js';
import { query } from '../src/lib/db.js';

/** Prefixo usado nos códigos gerados, para permitir limpeza seletiva */
const PREFIXO_SEED = 'ERP';

/** Origens usadas nos lançamentos de exemplo */
const ORIGEM_RECEBER = 'Contas a Receber';
const ORIGEM_PAGAR = 'Contas a Pagar';
const ORIGEM_CONCILIACAO = 'Conciliação';

/**
 * Descobre a conta a ser populada.
 * @param {string} sCodContaDesejada
 * @returns {Promise<object>}
 */
async function resolveConta(sCodContaDesejada) {
   const aContas = await listaContasCorrentes();
   if (aContas.length === 0) {
      throw new Error('Nenhuma conta corrente cadastrada. Cadastre uma conta na tela inicial.');
   }

   if (sCodContaDesejada) {
      const oConta = aContas.find((oItem) => oItem.codConta === sCodContaDesejada);
      if (!oConta) {
         throw new Error(`Conta "${sCodContaDesejada}" não encontrada.`);
      }
      return oConta;
   }

   return aContas[0];
} // resolveConta

/**
 * Remove os lançamentos criados por este script.
 * @param {number} iIdConta
 * @returns {Promise<number>}
 */
async function limpaLancamentosExemplo(iIdConta) {
   const oResultado = await query(
      `DELETE FROM lancamento_sistema
        WHERE id_conta = :idConta AND cod_lancamento LIKE :prefixo`,
      { idConta: iIdConta, prefixo: `${PREFIXO_SEED}-%` }
   );
   return oResultado.affectedRows ?? 0;
} // limpaLancamentosExemplo

/**
 * Monta os lançamentos de exemplo a partir do extrato bancário importado.
 * @param {Array<object>} aMovimentos Extrato do banco já persistido
 * @returns {Array<object>} Lançamentos prontos para inserção
 */
function montaLancamentosExemplo(aMovimentos) {
   const aLancamentos = [];
   let iSequencia = 1;

   /**
    * Acrescenta um lançamento à lista.
    * @param {object} oDados
    */
   function adiciona(oDados) {
      aLancamentos.push({
         codLancamento: `${PREFIXO_SEED}-${String(iSequencia).padStart(4, '0')}`,
         numDocumento: String(100000 + iSequencia),
         ...oDados,
      });
      iSequencia += 1;
   } // adiciona

   // ---- 1) Espelha os 6 primeiros movimentos: conciliação 1-para-1 exata ----
   const aEspelhados = aMovimentos.slice(0, 6);
   for (const oMovimento of aEspelhados) {
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

   // ---- 2) Um movimento coberto por dois lançamentos (agrupamento) ----
   // Divide o 7º movimento em duas parcelas que somam o valor original.
   const oParaDividir = aMovimentos[6];
   if (oParaDividir && oParaDividir.valMovimento > 2) {
      const nMetade = Math.round((oParaDividir.valMovimento / 2) * 100) / 100;
      const nResto = Math.round((oParaDividir.valMovimento - nMetade) * 100) / 100;

      adiciona({
         datMovimento: oParaDividir.datMovimento,
         datCompensacao: oParaDividir.datMovimento,
         desHistorico: `${oParaDividir.desHistorico} — parcela 1/2`,
         valMovimento: nMetade,
         bEntrada: oParaDividir.bEntrada,
         tipOrigem: oParaDividir.bEntrada ? ORIGEM_RECEBER : ORIGEM_PAGAR,
      });
      adiciona({
         datMovimento: oParaDividir.datMovimento,
         datCompensacao: oParaDividir.datMovimento,
         desHistorico: `${oParaDividir.desHistorico} — parcela 2/2`,
         valMovimento: nResto,
         bEntrada: oParaDividir.bEntrada,
         tipOrigem: oParaDividir.bEntrada ? ORIGEM_RECEBER : ORIGEM_PAGAR,
      });
   }

   // ---- 3) Lançamentos que existem somente no ERP (ficam pendentes) ----
   const sDataBase = aMovimentos[0]?.datMovimento ?? '01/11/2024';

   adiciona({
      datMovimento: sDataBase,
      datCompensacao: sDataBase,
      desHistorico: 'Tarifa bancária — pacote de serviços',
      valMovimento: 89.9,
      bEntrada: false,
      tipOrigem: ORIGEM_CONCILIACAO,
   });
   adiciona({
      datMovimento: sDataBase,
      datCompensacao: sDataBase,
      desHistorico: 'Nota fiscal 059722 — REVESTIMENTOS S.A.',
      valMovimento: 2950.0,
      bEntrada: true,
      tipOrigem: ORIGEM_RECEBER,
   });
   adiciona({
      datMovimento: sDataBase,
      datCompensacao: sDataBase,
      desHistorico: 'Aluguel do galpão — matriz',
      valMovimento: 7300.0,
      bEntrada: false,
      tipOrigem: ORIGEM_PAGAR,
   });

   return aLancamentos;
} // montaLancamentosExemplo

/**
 * Rotina principal.
 */
async function main() {
   const bLimpar = process.argv.includes('--limpar');
   const sCodContaArg = process.argv.slice(2).find((sArg) => !sArg.startsWith('--')) ?? '';

   const oConta = await resolveConta(sCodContaArg);
   console.log(
      `Conta: ${oConta.codConta} (${oConta.codBanco} ${oConta.codAgencia}/${oConta.numContaCorrente})`
   );

   if (bLimpar) {
      const iRemovidos = await limpaLancamentosExemplo(oConta.idConta);
      console.log(`Lançamentos de exemplo removidos: ${iRemovidos}`);
      return;
   }

   const aMovimentos = await listaMovimentosConta(oConta.idConta);
   console.log(`Movimentos do banco disponíveis: ${aMovimentos.length}`);

   if (aMovimentos.length === 0) {
      console.log(
         'Nenhum movimento bancário importado ainda. Rode a importação do extrato antes,\n' +
            'para que os lançamentos de exemplo espelhem valores e datas reais.'
      );
      return;
   }

   // Recria a massa para manter o resultado previsível entre execuções
   await limpaLancamentosExemplo(oConta.idConta);

   const aLancamentos = montaLancamentosExemplo(aMovimentos);
   let iInseridos = 0;

   for (const oLancamento of aLancamentos) {
      await insereLancamento(oConta.idConta, oLancamento);
      iInseridos += 1;
   }

   await registraAuditoria({
      idConta: oConta.idConta,
      tipAcao: ACAO_LANCAMENTO_INCLUIDO,
      desEntidade: 'lancamento',
      codEntidade: `${PREFIXO_SEED}-*`,
      desDetalhe: `Massa de exemplo do ERP gerada: ${iInseridos} lançamento(s).`,
   });

   console.log(`\nLançamentos inseridos no ERP: ${iInseridos}`);
   console.log('  6 espelham movimentos do banco (conciliação 1-para-1 exata)');
   console.log('  2 somam o valor de um único movimento (agrupamento por somatória)');
   console.log('  3 existem apenas no ERP (permanecem pendentes)');
   console.log('\nAbra a tela, clique em Buscar e depois em "Auto conciliar" para validar.');
} // main

main()
   .then(() => process.exit(0))
   .catch((oErro) => {
      console.error('Falha ao popular o ERP:', oErro.message);
      process.exit(1);
   });
