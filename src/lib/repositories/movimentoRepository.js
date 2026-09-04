// ============================================================================
// movimentoRepository.js - Extrato bancário gravado no MySQL
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// O extrato da instituição é COPIADO para cá. A grade "Movimentos no Banco" lê
// desta tabela, não da API: a consulta externa acontece uma única vez por dia
// de extrato, e a partir daí o dado é nosso.
//
// Isso resolve dois problemas do desenho anterior, em que a grade era sempre o
// retorno vivo da API:
//   - as APIs têm janela limitada (o BB devolve no máximo 5 anos, o Itaú
//     consulta um dia por vez). Movimento de 2022 simplesmente deixaria de ser
//     consultável, e a conciliação de períodos antigos ficaria impossível;
//   - cada abertura de tela repetia as mesmas chamadas ao banco, sem
//     necessidade e contando contra os limites de uso do gateway.
//
// Quem sabe o que já foi consultado é a tabela extrato_dia: ela guarda um
// registro por DIA coberto. Sem ela não haveria como distinguir "dia sem
// movimento" de "dia nunca consultado" — os dois chegariam como lista vazia.
//
// A chave do movimento é o cod_movimento determinístico montado em
// extratoBanco.js: a mesma linha do extrato produz sempre o mesmo código, então
// reconsultar um período já gravado atualiza em vez de duplicar.
// ============================================================================

import { dataBrParaMysql, dataMysqlParaBr, query } from '../db.js';

/**
 * Lista os movimentos do extrato bancário no período.
 * @param {number} iIdConta
 * @param {string} sDataInicioBr
 * @param {string} sDataFimBr
 * @returns {Promise<Array<object>>}
 */
export async function listaMovimentosPeriodo(iIdConta, sDataInicioBr, sDataFimBr) {
   const aLinhas = await query(
      `SELECT m.cod_movimento AS codMovimento,
              c.cod_conta AS codConta,
              m.dat_movimento AS datMovimento,
              m.des_historico AS desHistorico,
              m.num_documento AS numDocumento,
              m.val_movimento AS valMovimento,
              m.b_entrada AS bEntrada,
              m.sta_conciliado AS staConciliado,
              m.cod_lancamento_banco AS codigoLancamento
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

   return aLinhas.map((oLinha) => ({
      ...oLinha,
      valMovimento: Number(oLinha.valMovimento),
      bEntrada: Boolean(oLinha.bEntrada),
      staConciliado: Boolean(oLinha.staConciliado),
      datMovimento: dataMysqlParaBr(oLinha.datMovimento),
      desHistorico: oLinha.desHistorico ?? '',
      numDocumento: oLinha.numDocumento ?? '',
   }));
} // listaMovimentosPeriodo

/**
 * Lista TODOS os movimentos da conta, sem recortar por período.
 *
 * Mantém a grade do banco simétrica à do sistema quando o recorte está
 * desligado (BANK_FILTRA_PERIODO=false): ambientes de homologação ignoram as
 * datas enviadas, e recortar deixaria quase nada na tela.
 *
 * @param {number} iIdConta
 * @returns {Promise<Array<object>>}
 */
export async function listaMovimentosConta(iIdConta) {
   const aLinhas = await query(
      `SELECT m.cod_movimento AS codMovimento,
              c.cod_conta AS codConta,
              m.dat_movimento AS datMovimento,
              m.des_historico AS desHistorico,
              m.num_documento AS numDocumento,
              m.val_movimento AS valMovimento,
              m.b_entrada AS bEntrada,
              m.sta_conciliado AS staConciliado,
              m.cod_lancamento_banco AS codigoLancamento
         FROM movimento_banco m
         INNER JOIN conta_corrente c ON c.id_conta = m.id_conta
        WHERE m.id_conta = :idConta
     ORDER BY m.dat_movimento, m.id_movimento`,
      { idConta: iIdConta }
   );

   return aLinhas.map((oLinha) => ({
      ...oLinha,
      valMovimento: Number(oLinha.valMovimento),
      bEntrada: Boolean(oLinha.bEntrada),
      staConciliado: Boolean(oLinha.staConciliado),
      datMovimento: dataMysqlParaBr(oLinha.datMovimento),
      desHistorico: oLinha.desHistorico ?? '',
      numDocumento: oLinha.numDocumento ?? '',
   }));
} // listaMovimentosConta

/**
 * Grava os movimentos lidos da instituição.
 *
 * O status de conciliação NÃO é tocado no update: ele é nosso, não do banco.
 * Reconsultar um período já conciliado não pode desfazer a conciliação.
 *
 * @param {number} iIdConta
 * @param {Array<object>} aMovimentos Movimentos já normalizados
 * @returns {Promise<number>} Quantidade gravada
 */
export async function gravaMovimentos(iIdConta, aMovimentos) {
   if (!Array.isArray(aMovimentos) || aMovimentos.length === 0) {
      return 0;
   }

   let iGravados = 0;

   for (const oMovimento of aMovimentos) {
      const sDatMovimento = dataBrParaMysql(oMovimento.datMovimento);
      if (!sDatMovimento) {
         continue;
      }

      await query(
         `INSERT INTO movimento_banco
            (id_conta, cod_movimento, dat_movimento, des_historico, num_documento,
             val_movimento, b_entrada, cod_lancamento_banco)
          VALUES
            (:idConta, :codMovimento, :datMovimento, :desHistorico, :numDocumento,
             :valMovimento, :bEntrada, :codigoLancamento)
          ON DUPLICATE KEY UPDATE
            dat_movimento = VALUES(dat_movimento),
            des_historico = VALUES(des_historico),
            num_documento = VALUES(num_documento),
            val_movimento = VALUES(val_movimento),
            b_entrada = VALUES(b_entrada),
            cod_lancamento_banco = VALUES(cod_lancamento_banco)`,
         {
            idConta: iIdConta,
            codMovimento: oMovimento.codMovimento,
            datMovimento: sDatMovimento,
            desHistorico: (oMovimento.desHistorico ?? '').slice(0, 500),
            numDocumento: (oMovimento.numDocumento ?? '').slice(0, 40),
            valMovimento: Math.abs(Number(oMovimento.valMovimento) || 0),
            bEntrada: oMovimento.bEntrada ? 1 : 0,
            codigoLancamento: (oMovimento.codigoLancamento ?? '').slice(0, 40) || null,
         }
      );

      iGravados += 1;
   }

   return iGravados;
} // gravaMovimentos

/**
 * Relaciona os dias do período que JÁ foram consultados na instituição.
 * @param {number} iIdConta
 * @param {string} sDataInicioBr
 * @param {string} sDataFimBr
 * @returns {Promise<Set<string>>} Dias em AAAA-MM-DD
 */
export async function listaDiasConsultados(iIdConta, sDataInicioBr, sDataFimBr) {
   const aLinhas = await query(
      `SELECT dat_dia AS datDia
         FROM extrato_dia
        WHERE id_conta = :idConta
          AND dat_dia BETWEEN :dataInicio AND :dataFim`,
      {
         idConta: iIdConta,
         dataInicio: dataBrParaMysql(sDataInicioBr),
         dataFim: dataBrParaMysql(sDataFimBr),
      }
   );

   return new Set(aLinhas.map((oLinha) => String(oLinha.datDia).slice(0, 10)));
} // listaDiasConsultados

/**
 * Marca dias como já consultados na instituição.
 *
 * Gravado DEPOIS dos movimentos: se a gravação falhar no meio, o dia continua
 * pendente e a próxima busca refaz a consulta, em vez de dar o dia por
 * coberto com o extrato incompleto.
 *
 * @param {number} iIdConta
 * @param {string[]} aDiasIso Dias em AAAA-MM-DD
 * @returns {Promise<number>}
 */
export async function marcaDiasConsultados(iIdConta, aDiasIso) {
   if (!Array.isArray(aDiasIso) || aDiasIso.length === 0) {
      return 0;
   }

   let iMarcados = 0;

   for (const sDia of aDiasIso) {
      await query(
         `INSERT INTO extrato_dia (id_conta, dat_dia)
          VALUES (:idConta, :datDia)
          ON DUPLICATE KEY UPDATE dat_consulta = CURRENT_TIMESTAMP`,
         { idConta: iIdConta, datDia: sDia }
      );
      iMarcados += 1;
   }

   return iMarcados;
} // marcaDiasConsultados

/**
 * Calcula o saldo do banco acumulado antes da data inicial.
 * @param {number} iIdConta
 * @param {string} sDataInicioBr
 * @returns {Promise<number>}
 */
export async function calculaSaldoAnteriorBanco(iIdConta, sDataInicioBr) {
   const aLinhas = await query(
      `SELECT COALESCE(SUM(CASE WHEN b_entrada = 1 THEN val_movimento ELSE -val_movimento END), 0) AS saldo
         FROM movimento_banco
        WHERE id_conta = :idConta
          AND dat_movimento < :dataInicio`,
      { idConta: iIdConta, dataInicio: dataBrParaMysql(sDataInicioBr) }
   );
   return Number(aLinhas[0]?.saldo ?? 0);
} // calculaSaldoAnteriorBanco

/**
 * Devolve a data de cada movimento informado, lida da base.
 *
 * Usada na conferência de período bloqueado: quem grava não pode aceitar a
 * data que o navegador informou.
 *
 * @param {number} iIdConta
 * @param {string[]} aCodMovimentos
 * @returns {Promise<Array<{ codMovimento: string, datMovimento: string }>>}
 */
export async function listaDatasMovimentos(iIdConta, aCodMovimentos) {
   if (!Array.isArray(aCodMovimentos) || aCodMovimentos.length === 0) {
      return [];
   }

   const aLinhas = [];

   for (const sCodigo of aCodMovimentos) {
      const aResultado = await query(
         `SELECT cod_movimento AS codMovimento, dat_movimento AS datMovimento
            FROM movimento_banco
           WHERE id_conta = :idConta AND cod_movimento = :codMovimento`,
         { idConta: iIdConta, codMovimento: sCodigo }
      );
      if (aResultado[0]) {
         aLinhas.push({
            codMovimento: aResultado[0].codMovimento,
            datMovimento: dataMysqlParaBr(aResultado[0].datMovimento),
         });
      }
   }

   return aLinhas;
} // listaDatasMovimentos

/**
 * Grava o status de conciliação de um conjunto de movimentos.
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
