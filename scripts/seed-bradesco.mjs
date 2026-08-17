// ============================================================================
// seed-bradesco.mjs - Gera lançamentos do sistema que batem com o Bradesco
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Lê os movimentos do Bradesco (prefixo API-) já importados e cria
// lançamentos no sistema que batem exatamente para testar a auto-conciliação.
//
// Uso:
//   node scripts/seed-bradesco.mjs
// ============================================================================

import mysql from 'mysql2/promise';
import 'dotenv/config';

/** Prefixo dos lançamentos gerados por este script */
const PREFIXO_LANCAMENTO = 'BRAD';

/** Origens dos lançamentos gerados */
const ORIGEM_RECEBER = 'Contas a Receber';
const ORIGEM_PAGAR = 'Contas a Pagar';
const ORIGEM_CONCILIACAO = 'Conciliação';

/**
 * Cria pool de conexão MySQL.
 */
function getPool() {
   return mysql.createPool({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'conciliacao_agiw',
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
      dateStrings: true,
      timezone: 'Z',
   });
} // getPool

/**
 * Converte DATE MySQL (AAAA-MM-DD) para DD/MM/AAAA.
 */
function dataMysqlParaBr(sData) {
   if (!sData) return '';
   const s = String(sData).slice(0, 10);
   const [sAno, sMes, sDia] = s.split('-');
   if (!sAno || !sMes || !sDia) return '';
   return `${sDia}/${sMes}/${sAno}`;
} // dataMysqlParaBr

/**
 * Lê os movimentos do Bradesco de uma conta.
 */
async function leMovimentosBradesco(pool, iIdConta) {
   const [aLinhas] = await pool.execute(
      `SELECT cod_movimento, dat_movimento, des_historico, num_documento,
              val_movimento, b_entrada
         FROM movimento_banco
        WHERE id_conta = :idConta
          AND cod_movimento LIKE 'API-%'
          AND sta_conciliado = 0
        ORDER BY dat_movimento, cod_movimento`,
      { idConta: iIdConta }
   );

   return aLinhas.map((oLinha) => ({
      codMovimento: oLinha.cod_movimento,
      datMovimento: dataMysqlParaBr(oLinha.dat_movimento),
      desHistorico: oLinha.des_historico,
      numDocumento: oLinha.num_documento,
      valMovimento: Number(oLinha.val_movimento),
      bEntrada: Boolean(oLinha.b_entrada),
   }));
} // leMovimentosBradesco

/**
 * Gera lançamentos que batem com os movimentos do Bradesco.
 */
async function geraLancamentosEspelho(pool, iIdConta, aMovimentos) {
   let iCriados = 0;
   let iSequencia = 1;

   for (const oMovimento of aMovimentos) {
      const sCodLancamento = `${PREFIXO_LANCAMENTO}-${String(iSequencia).padStart(4, '0')}`;
      const sDatMovimento = oMovimento.datMovimento;

      // Converte DD/MM/AAAA para AAAA-MM-DD
      const [sDia, sMes, sAno] = sDatMovimento.split('/');
      const sDatMysql = `${sAno}-${sMes}-${sDia}`;

      const oLancamento = {
         codLancamento: sCodLancamento,
         datMovimento: sDatMysql,
         datCompensacao: sDatMysql,
         desHistorico: oMovimento.bEntrada
            ? `Recebimento ref. ${oMovimento.desHistorico}`
            : `Pagamento ref. ${oMovimento.desHistorico}`,
         numDocumento: oMovimento.numDocumento || String(100000 + iSequencia),
         valMovimento: oMovimento.valMovimento,
         bEntrada: oMovimento.bEntrada ? 1 : 0,
         tipOrigem: oMovimento.bEntrada ? ORIGEM_RECEBER : ORIGEM_PAGAR,
         staConciliado: 0,
      };

      await pool.execute(
         `INSERT INTO lancamento_sistema
            (id_conta, cod_lancamento, dat_movimento, dat_compensacao, num_documento,
             des_historico, val_movimento, b_entrada, tip_origem, sta_conciliado)
          VALUES
            (:idConta, :codLancamento, :datMovimento, :datCompensacao, :numDocumento,
             :desHistorico, :valMovimento, :bEntrada, :tipOrigem, :staConciliado)
          ON DUPLICATE KEY UPDATE
            des_historico = VALUES(des_historico),
            val_movimento = VALUES(val_movimento)`,
         { idConta: iIdConta, ...oLancamento }
      );

      iCriados += 1;
      iSequencia += 1;
   }

   return iCriados;
} // geraLancamentosEspelho

/**
 * Remove os lançamentos gerados por este script.
 */
async function limpaLancamentos(pool, iIdConta) {
   const [oResultado] = await pool.execute(
      `DELETE FROM lancamento_sistema
        WHERE id_conta = :idConta
          AND cod_lancamento LIKE :prefixo`,
      { idConta: iIdConta, prefixo: `${PREFIXO_LANCAMENTO}-%` }
   );

   return oResultado.affectedRows ?? 0;
} // limpaLancamentos

/**
 * Rotina principal.
 */
async function main() {
   const bLimpar = process.argv.includes('--limpar');
   const pool = getPool();

   try {
      const [aContas] = await pool.execute(
         `SELECT id_conta, cod_conta FROM conta_corrente WHERE b_ativo = 1`
      );

      if (aContas.length === 0) {
         console.log('Nenhuma conta corrente cadastrada.');
         return;
      }

      for (const oConta of aContas) {
         if (bLimpar) {
            const iRemovidos = await limpaLancamentos(pool, oConta.id_conta);
            if (iRemovidos > 0) {
               console.log(`${oConta.cod_conta}: ${iRemovidos} lançamento(s) removido(s).`);
            }
            continue;
         }

         const aMovimentos = await leMovimentosBradesco(pool, oConta.id_conta);

         if (aMovimentos.length === 0) {
            console.log(`${oConta.cod_conta}: nenhum movimento pendente do Bradesco.`);
            continue;
         }

         // Limpa lançamentos anteriores para evitar duplicação
         await limpaLancamentos(pool, oConta.id_conta);

         const iCriados = await geraLancamentosEspelho(pool, oConta.id_conta, aMovimentos);

         console.log(
            `${oConta.cod_conta}: ${iCriados} lançamento(s) criado(s) para bater com ${aMovimentos.length} movimento(s) do Bradesco.`
         );
      }

      if (!bLimpar) {
         console.log('\nPronto! Agora você pode:');
         console.log('  1. Abrir a tela de conciliação');
         console.log('  2. Selecionar a conta do Bradesco');
         console.log('  3. Clicar em "Auto conciliar" para fazer o match automático');
         console.log('\nPara limpar os lançamentos de teste, rode:');
         console.log('  node scripts/seed-bradesco.mjs --limpar');
      }
   } finally {
      await pool.end();
   }
} // main

main()
   .then(() => process.exit(0))
   .catch((oErro) => {
      console.error('Falha:', oErro.message);
      process.exit(1);
   });
