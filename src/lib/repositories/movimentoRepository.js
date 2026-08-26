// ============================================================================
// movimentoRepository.js - Movimentos do extrato bancário
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// A tabela atende as duas formas de obter extrato previstas no item 6.1.3.3,
// distinguidas por tip_origem:
//
//   'API'     O extrato NÃO é copiado. A grade mostra sempre o que a
//             instituição devolve na hora; aqui fica só o que a API não sabe
//             responder — se o movimento foi conciliado e se o usuário o
//             removeu da grade (item 6.1.3.8 — ação 4).
//
//   'ARQUIVO' Importação de OFX/CSV/TXT. Aqui o registro é guardado por
//             inteiro: o arquivo é a única fonte, não há a que voltar para
//             reler o histórico.
//
// A chave é o cod_movimento determinístico (data + documento + sentido +
// valor): a mesma linha do extrato gera sempre o mesmo código, então o estado
// reencontra o movimento a cada consulta.
// ============================================================================

import { dataBrParaMysql, dataMysqlParaBr, query } from '../db.js';

/** Movimento lido da API do banco a cada consulta */
export const ORIGEM_API = 'API';

/** Movimento importado de arquivo OFX/CSV/TXT */
export const ORIGEM_ARQUIVO = 'ARQUIVO';

/**
 * Carrega o estado local dos movimentos de uma conta.
 * @param {number} iIdConta
 * @returns {Promise<Map<string, { bConciliado: boolean, bExcluido: boolean }>>}
 */
export async function carregaEstadoMovimentos(iIdConta) {
   const aLinhas = await query(
      `SELECT cod_movimento AS codMovimento,
              sta_conciliado AS staConciliado,
              b_excluido AS bExcluido
         FROM movimento_banco
        WHERE id_conta = :idConta`,
      { idConta: iIdConta }
   );

   const oEstado = new Map();
   for (const oLinha of aLinhas) {
      oEstado.set(oLinha.codMovimento, {
         bConciliado: Boolean(oLinha.staConciliado),
         bExcluido: Boolean(oLinha.bExcluido),
      });
   }
   return oEstado;
} // carregaEstadoMovimentos

/**
 * Aplica o estado local sobre os movimentos recém-lidos da API.
 *
 * Movimentos marcados como excluídos saem da lista; os demais recebem o
 * status de conciliação que já tinham.
 *
 * @param {Array<object>} aMovimentosApi Movimentos normalizados da API
 * @param {Map<string, object>} oEstado Retorno de carregaEstadoMovimentos
 * @returns {Array<object>}
 */
export function aplicaEstadoNosMovimentos(aMovimentosApi, oEstado) {
   const aVisiveis = [];

   for (const oMovimento of aMovimentosApi) {
      const oLocal = oEstado.get(oMovimento.codMovimento);
      if (oLocal?.bExcluido) {
         continue;
      }
      aVisiveis.push({ ...oMovimento, staConciliado: Boolean(oLocal?.bConciliado) });
   }

   return aVisiveis;
} // aplicaEstadoNosMovimentos

/**
 * Garante que exista a linha de estado de um movimento.
 *
 * Guarda também data e valor, usados apenas para calcular o saldo anterior do
 * lado do banco quando a janela consultada não alcança o histórico completo.
 *
 * @param {number} iIdConta
 * @param {object} oMovimento
 * @returns {Promise<void>}
 */
async function garanteEstado(iIdConta, oMovimento) {
   const sDat = dataBrParaMysql(oMovimento.datMovimento);
   if (!sDat) {
      return;
   }

   await query(
      `INSERT INTO movimento_banco
         (id_conta, cod_movimento, tip_origem, dat_movimento, val_movimento,
          b_entrada, sta_conciliado)
       VALUES
         (:idConta, :codMovimento, :tipOrigem, :datMovimento, :valMovimento,
          :bEntrada, :staConciliado)
       ON DUPLICATE KEY UPDATE
         dat_movimento = VALUES(dat_movimento),
         val_movimento = VALUES(val_movimento),
         b_entrada = VALUES(b_entrada)`,
      {
         idConta: iIdConta,
         codMovimento: oMovimento.codMovimento,
         tipOrigem: ORIGEM_API,
         datMovimento: sDat,
         valMovimento: oMovimento.valMovimento,
         bEntrada: oMovimento.bEntrada ? 1 : 0,
         staConciliado: oMovimento.staConciliado ? 1 : 0,
      }
   );
} // garanteEstado

/**
 * Lista os movimentos importados de arquivo (OFX/CSV/TXT).
 *
 * Só a origem ARQUIVO é devolvida: os movimentos de API não são copiados para
 * o nosso banco e chegam à tela pela consulta ao provider.
 *
 * @param {number} iIdConta
 * @param {{ sDataInicioBr?: string, sDataFimBr?: string }} [oFiltro]
 * @returns {Promise<Array<object>>}
 */
export async function listaMovimentosArquivo(iIdConta, oFiltro = {}) {
   const sInicio = dataBrParaMysql(oFiltro.sDataInicioBr);
   const sFim = dataBrParaMysql(oFiltro.sDataFimBr);
   const bRecorta = Boolean(sInicio && sFim);

   const aLinhas = await query(
      `SELECT m.cod_movimento AS codMovimento,
              c.cod_conta AS codConta,
              m.dat_movimento AS datMovimento,
              m.des_historico AS desHistorico,
              m.num_documento AS numDocumento,
              m.val_movimento AS valMovimento,
              m.b_entrada AS bEntrada,
              m.sta_conciliado AS staConciliado
         FROM movimento_banco m
         INNER JOIN conta_corrente c ON c.id_conta = m.id_conta
        WHERE m.id_conta = :idConta
          AND m.tip_origem = :tipOrigem
          AND m.b_excluido = 0
          ${bRecorta ? 'AND m.dat_movimento BETWEEN :dataInicio AND :dataFim' : ''}
     ORDER BY m.dat_movimento, m.id_movimento`,
      bRecorta
         ? { idConta: iIdConta, tipOrigem: ORIGEM_ARQUIVO, dataInicio: sInicio, dataFim: sFim }
         : { idConta: iIdConta, tipOrigem: ORIGEM_ARQUIVO }
   );

   return aLinhas.map((oLinha) => ({
      ...oLinha,
      valMovimento: Number(oLinha.valMovimento),
      bEntrada: Boolean(oLinha.bEntrada),
      staConciliado: Boolean(oLinha.staConciliado),
      datMovimento: dataMysqlParaBr(oLinha.datMovimento),
   }));
} // listaMovimentosArquivo

/**
 * Grava (upsert) movimentos vindos de um arquivo OFX/CSV/TXT.
 *
 * Diferente da origem API, aqui o registro é guardado por inteiro — histórico
 * e documento inclusive —, porque o arquivo não pode ser reconsultado.
 *
 * @param {number} iIdConta
 * @param {Array<object>} aMovimentos
 * @returns {Promise<number>} Quantidade gravada
 */
export async function gravaMovimentosArquivo(iIdConta, aMovimentos) {
   let iGravados = 0;

   for (const oMov of aMovimentos) {
      const sDat = dataBrParaMysql(oMov.datMovimento);
      if (!sDat) {
         continue;
      }

      await query(
         `INSERT INTO movimento_banco
            (id_conta, cod_movimento, tip_origem, dat_movimento, val_movimento,
             b_entrada, des_historico, num_documento, sta_conciliado)
          VALUES
            (:idConta, :codMovimento, :tipOrigem, :datMovimento, :valMovimento,
             :bEntrada, :desHistorico, :numDocumento, :staConciliado)
          ON DUPLICATE KEY UPDATE
            dat_movimento = VALUES(dat_movimento),
            val_movimento = VALUES(val_movimento),
            b_entrada = VALUES(b_entrada),
            des_historico = VALUES(des_historico),
            num_documento = VALUES(num_documento)`,
         {
            idConta: iIdConta,
            codMovimento: oMov.codMovimento,
            tipOrigem: ORIGEM_ARQUIVO,
            datMovimento: sDat,
            valMovimento: oMov.valMovimento,
            bEntrada: oMov.bEntrada ? 1 : 0,
            desHistorico: oMov.desHistorico || 'Movimento bancário',
            numDocumento: oMov.numDocumento || '',
            staConciliado: oMov.staConciliado ? 1 : 0,
         }
      );
      iGravados += 1;
   }

   return iGravados;
} // gravaMovimentosArquivo

/**
 * Saldo do extrato bancário antes da data inicial do período.
 *
 * O item 6.1.2 exige que "ambos os extratos" tenham saldo anterior, entradas,
 * saídas e saldo final. Como só conhecemos os movimentos que já passaram pela
 * tela, o valor é o acumulado do que temos registrado — e não um saldo
 * contábil da instituição, que só a API de saldo poderia informar.
 *
 * @param {number} iIdConta
 * @param {string} sDataInicioBr
 * @returns {Promise<number>}
 */
export async function calculaSaldoAnteriorBanco(iIdConta, sDataInicioBr) {
   const sDataInicio = dataBrParaMysql(sDataInicioBr);
   if (!sDataInicio) {
      return 0;
   }

   const aLinhas = await query(
      `SELECT COALESCE(SUM(CASE WHEN b_entrada = 1 THEN val_movimento ELSE -val_movimento END), 0) AS saldo
         FROM movimento_banco
        WHERE id_conta = :idConta
          AND b_excluido = 0
          AND dat_movimento < :dataInicio`,
      { idConta: iIdConta, dataInicio: sDataInicio }
   );
   return Number(aLinhas[0]?.saldo ?? 0);
} // calculaSaldoAnteriorBanco

/**
 * Registra o estado dos movimentos devolvidos pela API.
 * @param {number} iIdConta
 * @param {Array<object>} aMovimentos
 * @returns {Promise<number>} Quantidade de linhas de estado garantidas
 */
export async function registraEstadoMovimentos(iIdConta, aMovimentos) {
   let iGravados = 0;

   for (const oMovimento of aMovimentos) {
      await garanteEstado(iIdConta, oMovimento);
      iGravados += 1;
   }

   return iGravados;
} // registraEstadoMovimentos

/**
 * Datas dos movimentos informados, lidas do estado local.
 *
 * A conferência do bloqueio (item 6.1.3.1) não pode confiar na data que a tela
 * envia. Aqui a data está disponível mesmo para movimentos de API: a linha de
 * estado guarda data, valor e sentido justamente para conferências como esta.
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
 * Grava o status de conciliação de um conjunto de movimentos do banco.
 *
 * A linha de estado é criada quando ainda não existir: o movimento pode ter
 * acabado de chegar da API e ser conciliado antes de qualquer outra gravação.
 *
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
 * Marca um movimento como excluído da grade.
 *
 * Item 6.1.3.8 — ação 4: para a grade de movimentos a única restrição é o
 * status de conciliado. A exclusão é lógica: apagar a linha faria o movimento
 * reaparecer na próxima leitura da API, já que o extrato continua lá.
 *
 * @param {number} iIdConta
 * @param {string} sCodMovimento
 * @returns {Promise<{ bExcluido: boolean, sMotivo: string }>}
 */
export async function excluiMovimento(iIdConta, sCodMovimento) {
   const aLinhas = await query(
      `SELECT sta_conciliado AS staConciliado, b_excluido AS bExcluido
         FROM movimento_banco
        WHERE id_conta = :idConta AND cod_movimento = :codMovimento`,
      { idConta: iIdConta, codMovimento: sCodMovimento }
   );

   const oMovimento = aLinhas[0];
   if (!oMovimento) {
      return { bExcluido: false, sMotivo: 'Movimento não localizado.' };
   }
   if (oMovimento.bExcluido) {
      return { bExcluido: false, sMotivo: 'Movimento já foi excluído da grade.' };
   }
   if (oMovimento.staConciliado) {
      return {
         bExcluido: false,
         sMotivo: 'Movimento conciliado não pode ser excluído. Estorne a conciliação antes.',
      };
   }

   await query(
      `UPDATE movimento_banco
          SET b_excluido = 1
        WHERE id_conta = :idConta AND cod_movimento = :codMovimento`,
      { idConta: iIdConta, codMovimento: sCodMovimento }
   );

   return { bExcluido: true, sMotivo: '' };
} // excluiMovimento
