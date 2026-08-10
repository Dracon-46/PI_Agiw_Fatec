// ============================================================================
// lancamentoRepository.js - Lançamentos do sistema (ERP/Satis)
// Projeto Banco - Ticket 37060 | Agiw Sistemas
// ============================================================================

import { dataBrParaMysql, dataMysqlParaBr, query } from '../db.js';

/** Origem atribuída aos lançamentos criados dentro da própria conciliação */
export const ORIGEM_CONCILIACAO = 'Conciliação';

/**
 * Gera o código de um novo lançamento originado na conciliação.
 * @param {number} iIdConta
 * @returns {Promise<string>} Código no formato "MC-000001"
 */
export async function geraProximoCodigoLancamento(iIdConta) {
   const aLinhas = await query(
      `SELECT COUNT(*) AS total FROM lancamento_sistema WHERE id_conta = :idConta`,
      { idConta: iIdConta }
   );
   const iSequencia = Number(aLinhas[0]?.total ?? 0) + 1;
   return `MC-${String(iSequencia).padStart(6, '0')}`;
} // geraProximoCodigoLancamento

/**
 * Lista lançamentos do sistema no período.
 * Sem integração Satis, a tabela permanece vazia (sem dados falsos).
 * @param {number} iIdConta
 * @param {string} sDataInicioBr
 * @param {string} sDataFimBr
 * @returns {Promise<Array<object>>}
 */
export async function listaLancamentosPeriodo(iIdConta, sDataInicioBr, sDataFimBr) {
   const aLinhas = await query(
      `SELECT l.cod_lancamento AS codLancamento,
              c.cod_conta AS codConta,
              l.dat_movimento AS datMovimento,
              l.dat_compensacao AS datCompensacao,
              l.num_documento AS numDocumento,
              l.des_historico AS desHistorico,
              l.val_movimento AS valMovimento,
              l.b_entrada AS bEntrada,
              l.tip_origem AS tipOrigem,
              l.sta_conciliado AS staConciliado
         FROM lancamento_sistema l
         INNER JOIN conta_corrente c ON c.id_conta = l.id_conta
        WHERE l.id_conta = :idConta
          AND l.dat_movimento BETWEEN :dataInicio AND :dataFim
     ORDER BY l.dat_movimento, l.id_lancamento`,
      {
         idConta: iIdConta,
         dataInicio: dataBrParaMysql(sDataInicioBr),
         dataFim: dataBrParaMysql(sDataFimBr),
      }
   );

   return aLinhas.map((oLinha) => ({
      ...oLinha,
      valMovimento: Number(oLinha.valMovimento),
      bEntrada: Boolean(oLinha.bEntrada),
      staConciliado: Boolean(oLinha.staConciliado),
      datMovimento: dataMysqlParaBr(oLinha.datMovimento),
      datCompensacao: dataMysqlParaBr(oLinha.datCompensacao),
   }));
} // listaLancamentosPeriodo

/**
 * Lista TODOS os lançamentos da conta, sem recortar por período.
 *
 * Mantém a grade do sistema simétrica à do banco: quando o extrato bancário é
 * exibido por inteiro, os lançamentos também devem ser, para que a conferência
 * entre os dois lados fique completa.
 *
 * @param {number} iIdConta
 * @returns {Promise<Array<object>>}
 */
export async function listaLancamentosConta(iIdConta) {
   const aLinhas = await query(
      `SELECT l.cod_lancamento AS codLancamento,
              c.cod_conta AS codConta,
              l.dat_movimento AS datMovimento,
              l.dat_compensacao AS datCompensacao,
              l.num_documento AS numDocumento,
              l.des_historico AS desHistorico,
              l.val_movimento AS valMovimento,
              l.b_entrada AS bEntrada,
              l.tip_origem AS tipOrigem,
              l.sta_conciliado AS staConciliado
         FROM lancamento_sistema l
         INNER JOIN conta_corrente c ON c.id_conta = l.id_conta
        WHERE l.id_conta = :idConta
     ORDER BY l.dat_movimento, l.id_lancamento`,
      { idConta: iIdConta }
   );

   return aLinhas.map((oLinha) => ({
      ...oLinha,
      valMovimento: Number(oLinha.valMovimento),
      bEntrada: Boolean(oLinha.bEntrada),
      staConciliado: Boolean(oLinha.staConciliado),
      datMovimento: dataMysqlParaBr(oLinha.datMovimento),
      datCompensacao: dataMysqlParaBr(oLinha.datCompensacao),
   }));
} // listaLancamentosConta

/**
 * Calcula saldo anterior (soma de movimentos do sistema antes da data inicial).
 * @param {number} iIdConta
 * @param {string} sDataInicioBr
 * @returns {Promise<number>}
 */
export async function calculaSaldoAnterior(iIdConta, sDataInicioBr) {
   const aLinhas = await query(
      `SELECT COALESCE(SUM(CASE WHEN b_entrada = 1 THEN val_movimento ELSE -val_movimento END), 0) AS saldo
         FROM lancamento_sistema
        WHERE id_conta = :idConta
          AND dat_movimento < :dataInicio`,
      {
         idConta: iIdConta,
         dataInicio: dataBrParaMysql(sDataInicioBr),
      }
   );
   return Number(aLinhas[0]?.saldo ?? 0);
} // calculaSaldoAnterior

/**
 * Insere um lançamento no extrato do sistema.
 * Corresponde à ação "Novo Lançamento" (item 6.1.3.8 — ação 1).
 *
 * @param {number} iIdConta
 * @param {object} oLancamento
 * @param {string} [oLancamento.codLancamento] Código; gerado quando ausente
 * @param {string} oLancamento.datMovimento Data do movimento (DD/MM/AAAA)
 * @param {string} [oLancamento.datCompensacao] Data de compensação (DD/MM/AAAA)
 * @param {string} [oLancamento.numDocumento] Número do documento
 * @param {string} oLancamento.desHistorico Histórico do lançamento
 * @param {number} oLancamento.valMovimento Valor absoluto
 * @param {boolean} oLancamento.bEntrada Indica entrada (crédito)
 * @param {string} [oLancamento.tipOrigem] Origem do lançamento
 * @returns {Promise<object>} Lançamento gravado, no formato da grade
 */
export async function insereLancamento(iIdConta, oLancamento) {
   const sCodigo = oLancamento.codLancamento || (await geraProximoCodigoLancamento(iIdConta));
   const sDatMovimento = dataBrParaMysql(oLancamento.datMovimento);

   if (!sDatMovimento) {
      throw new Error(`Data do movimento inválida: "${oLancamento.datMovimento}". Use DD/MM/AAAA.`);
   }

   const nValor = Number(oLancamento.valMovimento);
   if (!Number.isFinite(nValor) || nValor <= 0) {
      throw new Error('O valor do lançamento deve ser maior que zero.');
   }

   await query(
      `INSERT INTO lancamento_sistema
         (id_conta, cod_lancamento, dat_movimento, dat_compensacao, num_documento,
          des_historico, val_movimento, b_entrada, tip_origem, sta_conciliado)
       VALUES
         (:idConta, :codLancamento, :datMovimento, :datCompensacao, :numDocumento,
          :desHistorico, :valMovimento, :bEntrada, :tipOrigem, :staConciliado)
       ON DUPLICATE KEY UPDATE
         dat_movimento = VALUES(dat_movimento),
         dat_compensacao = VALUES(dat_compensacao),
         num_documento = VALUES(num_documento),
         des_historico = VALUES(des_historico),
         val_movimento = VALUES(val_movimento),
         b_entrada = VALUES(b_entrada),
         tip_origem = VALUES(tip_origem)`,
      {
         idConta: iIdConta,
         codLancamento: sCodigo,
         datMovimento: sDatMovimento,
         datCompensacao: dataBrParaMysql(oLancamento.datCompensacao) ?? sDatMovimento,
         numDocumento: oLancamento.numDocumento || '',
         desHistorico: oLancamento.desHistorico || 'Lançamento da conciliação',
         valMovimento: Math.abs(nValor),
         bEntrada: oLancamento.bEntrada ? 1 : 0,
         tipOrigem: oLancamento.tipOrigem || ORIGEM_CONCILIACAO,
         staConciliado: oLancamento.staConciliado ? 1 : 0,
      }
   );

   return {
      codLancamento: sCodigo,
      datMovimento: oLancamento.datMovimento,
      datCompensacao: oLancamento.datCompensacao || oLancamento.datMovimento,
      numDocumento: oLancamento.numDocumento || '',
      desHistorico: oLancamento.desHistorico || 'Lançamento da conciliação',
      valMovimento: Math.abs(nValor),
      bEntrada: Boolean(oLancamento.bEntrada),
      tipOrigem: oLancamento.tipOrigem || ORIGEM_CONCILIACAO,
      staConciliado: Boolean(oLancamento.staConciliado),
   };
} // insereLancamento

/**
 * Exclui um lançamento do sistema.
 *
 * Regras do item 6.1.3.8 — ação 4: não exclui registro conciliado e, na grade
 * de lançamentos, somente os originados na própria conciliação.
 *
 * @param {number} iIdConta
 * @param {string} sCodLancamento
 * @returns {Promise<{ bExcluido: boolean, sMotivo: string }>}
 */
export async function excluiLancamento(iIdConta, sCodLancamento) {
   const aLinhas = await query(
      `SELECT sta_conciliado AS staConciliado, tip_origem AS tipOrigem
         FROM lancamento_sistema
        WHERE id_conta = :idConta AND cod_lancamento = :codLancamento`,
      { idConta: iIdConta, codLancamento: sCodLancamento }
   );

   const oLancamento = aLinhas[0];
   if (!oLancamento) {
      return { bExcluido: false, sMotivo: 'Lançamento não localizado.' };
   }
   if (oLancamento.staConciliado) {
      return {
         bExcluido: false,
         sMotivo: 'Lançamento conciliado não pode ser excluído. Estorne a conciliação antes.',
      };
   }
   if (oLancamento.tipOrigem !== ORIGEM_CONCILIACAO) {
      return {
         bExcluido: false,
         sMotivo: `Somente lançamentos originados na conciliação podem ser excluídos (origem atual: ${oLancamento.tipOrigem}).`,
      };
   }

   await query(
      `DELETE FROM lancamento_sistema WHERE id_conta = :idConta AND cod_lancamento = :codLancamento`,
      { idConta: iIdConta, codLancamento: sCodLancamento }
   );

   return { bExcluido: true, sMotivo: '' };
} // excluiLancamento

/**
 * Grava o status de conciliação de um conjunto de lançamentos.
 * @param {number} iIdConta
 * @param {string[]} aCodLancamentos
 * @param {boolean} bConciliado
 * @returns {Promise<number>} Quantidade de registros atualizados
 */
export async function atualizaStatusLancamentos(iIdConta, aCodLancamentos, bConciliado) {
   if (!Array.isArray(aCodLancamentos) || aCodLancamentos.length === 0) {
      return 0;
   }

   let iAtualizados = 0;
   for (const sCodigo of aCodLancamentos) {
      const oResultado = await query(
         `UPDATE lancamento_sistema
             SET sta_conciliado = :staConciliado
           WHERE id_conta = :idConta AND cod_lancamento = :codLancamento`,
         { idConta: iIdConta, codLancamento: sCodigo, staConciliado: bConciliado ? 1 : 0 }
      );
      iAtualizados += oResultado.affectedRows ?? 0;
   }

   return iAtualizados;
} // atualizaStatusLancamentos
