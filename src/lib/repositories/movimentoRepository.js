// ============================================================================
// movimentoRepository.js - Extrato bancário persistido
// Projeto Banco - Ticket 37060 | Agiw Sistemas
// ============================================================================

import { dataBrParaMysql, dataMysqlParaBr, query } from '../db.js';

/** Colunas do extrato bancário devolvidas para a tela */
const COLUNAS_MOVIMENTO = `
   m.cod_movimento AS codMovimento,
   c.cod_conta AS codConta,
   m.dat_movimento AS datMovimento,
   m.des_historico AS desHistorico,
   m.num_documento AS numDocumento,
   m.val_movimento AS valMovimento,
   m.b_entrada AS bEntrada,
   m.sta_conciliado AS staConciliado`;

/**
 * Converte a linha do banco para o formato usado pela grade.
 * @param {object} oLinha
 * @returns {object}
 */
function mapeiaMovimento(oLinha) {
   return {
      ...oLinha,
      valMovimento: Number(oLinha.valMovimento),
      bEntrada: Boolean(oLinha.bEntrada),
      staConciliado: Boolean(oLinha.staConciliado),
      datMovimento: dataMysqlParaBr(oLinha.datMovimento),
   };
} // mapeiaMovimento

/**
 * Lista movimentos do banco no período informado.
 * @param {number} iIdConta
 * @param {string} sDataInicioBr
 * @param {string} sDataFimBr
 * @returns {Promise<Array<object>>}
 */
export async function listaMovimentosPeriodo(iIdConta, sDataInicioBr, sDataFimBr) {
   const aLinhas = await query(
      `SELECT ${COLUNAS_MOVIMENTO}
         FROM movimento_banco m
         INNER JOIN conta_corrente c ON c.id_conta = m.id_conta
        WHERE m.id_conta = :idConta
          AND m.dat_movimento BETWEEN :dataInicio AND :dataFim
     ORDER BY m.dat_movimento, m.id_movimento`,
      {
         idConta: iIdConta,
         dataInicio: dataBrParaMysql(sDataInicioBr),
         dataFim: dataBrParaMysql(sDataFimBr),
      }
   );

   return aLinhas.map(mapeiaMovimento);
} // listaMovimentosPeriodo

/**
 * Lista TODOS os movimentos importados da conta, sem recortar por período.
 *
 * É a consulta usada pela grade do banco: as instituições devolvem o extrato
 * conforme o próprio critério — o sandbox do Bradesco, por exemplo, ignora as
 * datas enviadas e responde sempre o mesmo conjunto. Recortar aqui esconderia
 * movimentos que já foram efetivamente importados.
 *
 * @param {number} iIdConta
 * @returns {Promise<Array<object>>}
 */
export async function listaMovimentosConta(iIdConta) {
   const aLinhas = await query(
      `SELECT ${COLUNAS_MOVIMENTO}
         FROM movimento_banco m
         INNER JOIN conta_corrente c ON c.id_conta = m.id_conta
        WHERE m.id_conta = :idConta
     ORDER BY m.dat_movimento, m.id_movimento`,
      { idConta: iIdConta }
   );

   return aLinhas.map(mapeiaMovimento);
} // listaMovimentosConta

/**
 * Grava (upsert) movimentos importados da API do banco.
 * @param {number} iIdConta
 * @param {Array<object>} aMovimentos
 * @returns {Promise<number>} Quantidade gravada
 */
export async function gravaMovimentosImportados(iIdConta, aMovimentos) {
   let iGravados = 0;

   for (const oMov of aMovimentos) {
      const sDat = dataBrParaMysql(oMov.datMovimento);
      if (!sDat) {
         continue;
      }

      await query(
         `INSERT INTO movimento_banco
            (id_conta, cod_movimento, dat_movimento, des_historico, num_documento,
             val_movimento, b_entrada, sta_conciliado, cod_lancamento_banco)
          VALUES
            (:idConta, :codMovimento, :datMovimento, :desHistorico, :numDocumento,
             :valMovimento, :bEntrada, :staConciliado, :codLancBanco)
          ON DUPLICATE KEY UPDATE
            des_historico = VALUES(des_historico),
            num_documento = VALUES(num_documento),
            val_movimento = VALUES(val_movimento),
            b_entrada = VALUES(b_entrada),
            cod_lancamento_banco = VALUES(cod_lancamento_banco)`,
         {
            idConta: iIdConta,
            codMovimento: oMov.codMovimento,
            datMovimento: sDat,
            desHistorico: oMov.desHistorico || 'Movimento bancário',
            numDocumento: oMov.numDocumento || '',
            valMovimento: oMov.valMovimento,
            bEntrada: oMov.bEntrada ? 1 : 0,
            staConciliado: oMov.staConciliado ? 1 : 0,
            codLancBanco: oMov.codigoLancamento || null,
         }
      );
      iGravados += 1;
   }

   return iGravados;
} // gravaMovimentosImportados

/**
 * Grava o status de conciliação de um conjunto de movimentos do banco.
 * @param {number} iIdConta
 * @param {string[]} aCodMovimentos
 * @param {boolean} bConciliado
 * @returns {Promise<number>} Quantidade de registros atualizados
 */
export async function atualizaStatusMovimentos(iIdConta, aCodMovimentos, bConciliado) {
   if (!Array.isArray(aCodMovimentos) || aCodMovimentos.length === 0) {
      return 0;
   }

   let iAtualizados = 0;
   for (const sCodigo of aCodMovimentos) {
      const oResultado = await query(
         `UPDATE movimento_banco
             SET sta_conciliado = :staConciliado
           WHERE id_conta = :idConta AND cod_movimento = :codMovimento`,
         { idConta: iIdConta, codMovimento: sCodigo, staConciliado: bConciliado ? 1 : 0 }
      );
      iAtualizados += oResultado.affectedRows ?? 0;
   }

   return iAtualizados;
} // atualizaStatusMovimentos

/**
 * Exclui um movimento do extrato bancário.
 * Item 6.1.3.8 — ação 4: para a grade de movimentos a única restrição
 * é o status de conciliado.
 * @param {number} iIdConta
 * @param {string} sCodMovimento
 * @returns {Promise<{ bExcluido: boolean, sMotivo: string }>}
 */
export async function excluiMovimento(iIdConta, sCodMovimento) {
   const aLinhas = await query(
      `SELECT sta_conciliado AS staConciliado
         FROM movimento_banco
        WHERE id_conta = :idConta AND cod_movimento = :codMovimento`,
      { idConta: iIdConta, codMovimento: sCodMovimento }
   );

   const oMovimento = aLinhas[0];
   if (!oMovimento) {
      return { bExcluido: false, sMotivo: 'Movimento não localizado.' };
   }
   if (oMovimento.staConciliado) {
      return {
         bExcluido: false,
         sMotivo: 'Movimento conciliado não pode ser excluído. Estorne a conciliação antes.',
      };
   }

   await query(
      `DELETE FROM movimento_banco WHERE id_conta = :idConta AND cod_movimento = :codMovimento`,
      { idConta: iIdConta, codMovimento: sCodMovimento }
   );

   return { bExcluido: true, sMotivo: '' };
} // excluiMovimento
