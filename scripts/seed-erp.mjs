// ============================================================================
// seed-erp.mjs - Preenche o extrato do ERP a partir da API do banco
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Enquanto a integração com o Satis não existe, a grade "Movimentos no
// Sistema" fica vazia e não há o que conciliar. Este script preenche o lado do
// ERP com lançamentos que correspondem ao extrato REAL da instituição: lê a
// API do banco de cada conta cadastrada e grava, para cada movimento, o
// lançamento equivalente em lancamento_sistema.
//
// Nada é inventado — data, valor e sentido vêm do banco. O que o script
// acrescenta é a leitura contábil que o Satis daria ao movimento: histórico
// descritivo e origem (Contas a Pagar / a Receber).
//
// O lado do banco NÃO é populado por aqui: a grade de movimentos é sempre o
// retorno vivo da API.
//
// Por padrão um movimento fica SEM contrapartida no ERP. Extrato e sistema
// idênticos deixariam a tela conciliando tudo de primeira e nunca exercitariam
// a pendência — que é o caso real e o motivo de existirem o "Novo Lançamento"
// e a conciliação manual. Use --espelhar-tudo para não deixar sobra.
//
// Uso:
//   node scripts/seed-erp.mjs                    todas as contas configuradas
//   node scripts/seed-erp.mjs --conta=<codConta> apenas uma conta
//   node scripts/seed-erp.mjs --espelhar-tudo    sem deixar movimento pendente
//   node scripts/seed-erp.mjs --limpar           remove os lançamentos gerados
// ============================================================================

import mysql from 'mysql2/promise';
import 'dotenv/config';
import { BankProviderFactory } from '../src/providers/BankProviderFactory.js';

/** Prefixo dos lançamentos gerados por este script */
const PREFIXO_LANCAMENTO = 'ERP';

const ORIGEM_RECEBER = 'Contas a Receber';
const ORIGEM_PAGAR = 'Contas a Pagar';

/**
 * Janela com dados de cada banco nos ambientes de teste.
 *
 * Os sandboxes só respondem para intervalos específicos: o Bradesco tem uma
 * combinação de agência/conta/período previamente cadastrada, e a carteira de
 * cobrança do Itaú só tem posição em setembro de 2021. Uma janela única não
 * atende os dois, então cada conta usa a do seu banco.
 */
const PERIODO_POR_BANCO = {
   bradesco: { sDataInicio: '06/11/2024', sDataFim: '20/11/2024' },
   itau: { sDataInicio: '01/09/2021', sDataFim: '30/09/2021' },
};

/**
 * Resolve o período de uma conta: o do banco quando houver, senão o geral.
 * @param {object} oConta
 * @param {{ sDataInicio: string, sDataFim: string }} oPeriodoGeral
 * @param {boolean} bPeriodoExplicito Datas vieram da linha de comando
 * @returns {{ sDataInicio: string, sDataFim: string }}
 */
function periodoDaConta(oConta, oPeriodoGeral, bPeriodoExplicito) {
   if (bPeriodoExplicito) {
      return oPeriodoGeral;
   }
   return PERIODO_POR_BANCO[oConta.slug_provider] ?? oPeriodoGeral;
}

/**
 * Período consultado na API. Usa a janela fixa do .env quando houver — os
 * ambientes de homologação só respondem para intervalos específicos.
 * @returns {{ sDataInicio: string, sDataFim: string }}
 */
function resolvePeriodo() {
   // Datas na linha de comando vencem tudo: cada banco tem a sua janela com
   // dados nos ambientes de teste (o Bradesco responde nov/2024, a carteira de
   // cobrança do Itaú só tem posição em set/2021), e uma janela única não
   // atende as duas.
   const aDatas = process.argv.slice(2).filter((s) => !s.startsWith('--'));
   if (aDatas.length === 2) {
      return { sDataInicio: aDatas[0], sDataFim: aDatas[1] };
   }

   const sInicio = (process.env.NEXT_PUBLIC_PERIODO_INICIO ?? '').trim();
   const sFim = (process.env.NEXT_PUBLIC_PERIODO_FIM ?? '').trim();

   if (sInicio && sFim) {
      return { sDataInicio: sInicio, sDataFim: sFim };
   }

   const dHoje = new Date();
   const dInicio = new Date(dHoje);
   dInicio.setDate(dInicio.getDate() - 30);

   const formata = (d) =>
      `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

   return { sDataInicio: formata(dInicio), sDataFim: formata(dHoje) };
} // resolvePeriodo

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
 * Converte DD/MM/AAAA para AAAA-MM-DD.
 * @param {string} sData
 * @returns {string}
 */
function dataBrParaMysql(sData) {
   const [sDia, sMes, sAno] = String(sData ?? '').split('/');
   if (!sDia || !sMes || !sAno) {
      return '';
   }
   return `${sAno}-${sMes}-${sDia}`;
} // dataBrParaMysql

/**
 * Compara duas datas DD/MM/AAAA.
 * @param {string} sA
 * @param {string} sB
 * @returns {number}
 */
function comparaDatas(sA, sB) {
   const sMysqlA = dataBrParaMysql(sA);
   const sMysqlB = dataBrParaMysql(sB);
   if (!sMysqlA || !sMysqlB) {
      return 0;
   }
   return sMysqlA < sMysqlB ? -1 : sMysqlA > sMysqlB ? 1 : 0;
} // comparaDatas

/**
 * Lê o extrato da conta na API do banco.
 * @param {object} oConta Linha de conta_corrente com o slug do provider
 * @param {{ sDataInicio: string, sDataFim: string }} oPeriodo
 * @returns {Promise<Array<object>>} Movimentos no período
 */
async function leExtratoDaApi(oConta, oPeriodo) {
   const oProvider = BankProviderFactory.createProvider(oConta.slug_provider);

   if (!oProvider.isConfigured()) {
      throw new Error(`integração com ${oProvider.getName()} não configurada no .env`);
   }

   const aBrutos = await oProvider.fetchExtrato(oPeriodo.sDataInicio, oPeriodo.sDataFim, {
      codAgencia: oConta.cod_agencia,
      numContaCorrente: oConta.num_conta_corrente,
      tipConta: oConta.tip_conta,
   });

   const bRecorta = (process.env.BANK_FILTRA_PERIODO ?? '').trim().toLowerCase() !== 'false';

   // O mesmo recorte da tela: a instituição pode ignorar as datas enviadas

   return aBrutos
      .map((oMovimento) => {
         const nEntrada = oMovimento.valEntrada ?? 0;
         const nSaida = oMovimento.valSaida ?? 0;
         const bEntrada = nEntrada > 0;
         return {
            datMovimento: oMovimento.datMovimento ?? '',
            desHistorico: oMovimento.desHistorico ?? 'Movimento bancário',
            numDocumento: oMovimento.numDocumento ?? '',
            valMovimento: bEntrada ? nEntrada : nSaida,
            bEntrada,
         };
      })
      .filter(
         (oMovimento) =>
            !bRecorta ||
            (comparaDatas(oMovimento.datMovimento, oPeriodo.sDataInicio) >= 0 &&
               comparaDatas(oMovimento.datMovimento, oPeriodo.sDataFim) <= 0)
      );
} // leExtratoDaApi

/**
 * Grava, para cada movimento do banco, o lançamento equivalente no ERP.
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} iIdConta
 * @param {Array<object>} aMovimentos
 * @returns {Promise<number>} Quantidade criada
 */
async function geraLancamentosEspelho(pool, iIdConta, aMovimentos) {
   let iSequencia = 1;

   for (const oMovimento of aMovimentos) {
      await pool.execute(
         `INSERT INTO lancamento_sistema
            (id_conta, cod_lancamento, dat_movimento, dat_compensacao, num_documento,
             des_historico, val_movimento, b_entrada, tip_origem, tip_documento, sta_conciliado)
          VALUES
            (:idConta, :codLancamento, :datMovimento, :datMovimento, :numDocumento,
             :desHistorico, :valMovimento, :bEntrada, :tipOrigem, :tipDocumento, 0)
          ON DUPLICATE KEY UPDATE
            dat_movimento = VALUES(dat_movimento),
            des_historico = VALUES(des_historico),
            val_movimento = VALUES(val_movimento),
            b_entrada = VALUES(b_entrada)`,
         {
            idConta: iIdConta,
            codLancamento: `${PREFIXO_LANCAMENTO}-${String(iSequencia).padStart(4, '0')}`,
            datMovimento: dataBrParaMysql(oMovimento.datMovimento),
            numDocumento: oMovimento.numDocumento || String(100000 + iSequencia),
            desHistorico: oMovimento.bEntrada
               ? `Recebimento ref. ${oMovimento.desHistorico}`
               : `Pagamento ref. ${oMovimento.desHistorico}`,
            valMovimento: oMovimento.valMovimento,
            bEntrada: oMovimento.bEntrada ? 1 : 0,
            tipOrigem: oMovimento.bEntrada ? ORIGEM_RECEBER : ORIGEM_PAGAR,
            tipDocumento: 'MC',
         }
      );
      iSequencia += 1;
   }

   return iSequencia - 1;
} // geraLancamentosEspelho

/**
 * Remove os lançamentos gerados por este script.
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} iIdConta
 * @returns {Promise<number>}
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

async function main() {
   const bLimpar = process.argv.includes('--limpar');
   const bEspelharTudo = process.argv.includes('--espelhar-tudo');
   const sFiltroConta = (process.argv.find((s) => s.startsWith('--conta=')) ?? '').split('=')[1] ?? '';
   const oPeriodo = resolvePeriodo();
   const pool = getPool();

   try {
      const [aContas] = await pool.execute(
         `SELECT c.id_conta, c.cod_conta, c.cod_agencia, c.num_conta_corrente,
                 c.tip_conta, b.slug_provider, b.nom_banco
            FROM conta_corrente c
            INNER JOIN banco b ON b.cod_banco = c.cod_banco
           WHERE c.b_ativo = 1`
      );

      const aAlvo = sFiltroConta
         ? aContas.filter((oConta) => oConta.cod_conta === sFiltroConta)
         : aContas;

      if (aAlvo.length === 0) {
         console.log('Nenhuma conta corrente cadastrada para processar.');
         return;
      }

      if (bLimpar) {
         for (const oConta of aAlvo) {
            const iRemovidos = await limpaLancamentos(pool, oConta.id_conta);
            console.log(`${oConta.cod_conta}: ${iRemovidos} lançamento(s) removido(s).`);
         }
         return;
      }

      // Datas na linha de comando valem para todas as contas; sem elas, cada
      // uma usa a janela com dados do seu banco (PERIODO_POR_BANCO)
      const bPeriodoExplicito =
         process.argv.slice(2).filter((sArg) => !sArg.startsWith('--')).length === 2;

      for (const oConta of aAlvo) {
         const oPeriodoConta = periodoDaConta(oConta, oPeriodo, bPeriodoExplicito);
         let aMovimentos = [];

         console.log(
            `${oConta.cod_conta} — ${oPeriodoConta.sDataInicio} a ${oPeriodoConta.sDataFim}`
         );

         try {
            aMovimentos = await leExtratoDaApi(oConta, oPeriodoConta);
         } catch (oErro) {
            console.log(`${oConta.cod_conta}: ignorada — ${oErro.message}`);
            continue;
         }

         if (aMovimentos.length === 0) {
            console.log(`${oConta.cod_conta}: a API não devolveu movimentos no período.`);
            continue;
         }

         // O último movimento fica sem contrapartida: é a pendência que o
         // usuário resolve na tela, com "Novo Lançamento" ou conciliação
         // manual. Com mais de um movimento sempre sobra exatamente um.
         const bDeixaPendente = !bEspelharTudo && aMovimentos.length > 1;
         const aEspelhar = bDeixaPendente ? aMovimentos.slice(0, -1) : aMovimentos;
         const oPendente = bDeixaPendente ? aMovimentos[aMovimentos.length - 1] : null;

         // Regera do zero para não duplicar quando o extrato mudar
         await limpaLancamentos(pool, oConta.id_conta);
         const iCriados = await geraLancamentosEspelho(pool, oConta.id_conta, aEspelhar);

         console.log(
            `${oConta.cod_conta} (${oConta.nom_banco}): ${iCriados} lançamento(s) no ERP ` +
               `espelhando ${aMovimentos.length} movimento(s) da API.`
         );

         if (oPendente) {
            const sValor = oPendente.valMovimento.toFixed(2).replace('.', ',');
            console.log(
               `  pendente de propósito: ${oPendente.datMovimento} · ` +
                  `${oPendente.desHistorico} · R$ ${sValor} ` +
                  `(${oPendente.bEntrada ? 'entrada' : 'saída'}) — sem lançamento no ERP.`
            );
         }
      }

      console.log('\nAbra a tela, escolha a conta e clique em "Auto conciliar".');
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
