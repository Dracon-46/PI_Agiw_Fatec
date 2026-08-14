// ============================================================================
// tituloRepository.js - Títulos a pagar e a receber em aberto
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Sustenta a ação "Baixar Título" (item 6.1.3.8 — ação 3 do documento de
// visão): "busca todos os títulos (a pagar e a receber) abertos e
// adiantamentos a efetivar até a data do movimento. Permitir informar data e
// valores de baixa, multa, juros, desconto, tarifa para um ou mais documentos.
// Ao confirmar, realizar a baixa do documento atualizando sua origem e gerando
// o lançamento no extrato do sistema."
// ============================================================================

import { dataBrParaMysql, dataMysqlParaBr, query } from '../db.js';

/** Origem gravada nos lançamentos gerados por uma baixa de título */
export const ORIGEM_BAIXA_TITULO = 'Baixa de Título';

/** Sentidos possíveis de um título */
export const MOVIMENTO_ENTRADA = 'Entrada';
export const MOVIMENTO_SAIDA = 'Saída';

/** Colunas devolvidas para a tela de baixa */
const COLUNAS_TITULO = `
   t.cod_titulo AS codTitulo,
   t.dat_emissao AS datEmissao,
   t.dat_vencimento AS datVencimento,
   t.nom_emitente AS nomEmitente,
   t.des_historico AS desHistorico,
   t.val_titulo AS valTitulo,
   t.val_multa AS valMulta,
   t.val_juros AS valJuros,
   t.val_desconto AS valDesconto,
   t.val_tarifa AS valTarifa,
   t.tip_documento AS tipDocumento,
   t.num_documento AS numDocumento,
   t.num_parcela AS numParcela,
   t.tip_movimento AS tipMovimento,
   t.tip_origem AS tipOrigem,
   t.sta_baixado AS staBaixado,
   t.dat_baixa AS datBaixa,
   t.val_pago AS valPago,
   t.cod_lancamento_baixa AS codLancamentoBaixa`;

/**
 * Converte a linha do banco para o formato usado na tela.
 * @param {object} oLinha
 * @returns {object}
 */
function mapeiaTitulo(oLinha) {
   const nTitulo = Number(oLinha.valTitulo);
   const nMulta = Number(oLinha.valMulta);
   const nJuros = Number(oLinha.valJuros);
   const nDesconto = Number(oLinha.valDesconto);

   return {
      ...oLinha,
      datEmissao: dataMysqlParaBr(oLinha.datEmissao),
      datVencimento: dataMysqlParaBr(oLinha.datVencimento),
      datBaixa: dataMysqlParaBr(oLinha.datBaixa),
      valTitulo: nTitulo,
      valMulta: nMulta,
      valJuros: nJuros,
      valDesconto: nDesconto,
      valTarifa: Number(oLinha.valTarifa ?? 0),
      valPago: oLinha.valPago === null ? null : Number(oLinha.valPago),
      // Valor sugerido na baixa: parcela + encargos - desconto
      valPagoSugerido: Number((nTitulo + nMulta + nJuros - nDesconto).toFixed(2)),
      bEntrada: oLinha.tipMovimento === MOVIMENTO_ENTRADA,
      staBaixado: Boolean(oLinha.staBaixado),
   };
} // mapeiaTitulo

/**
 * Lista os títulos em aberto de uma conta até a data informada.
 *
 * @param {number} iIdConta
 * @param {object} [oFiltro]
 * @param {string} [oFiltro.sDataLimiteBr] Vencimento máximo (DD/MM/AAAA)
 * @param {'Entrada'|'Saída'} [oFiltro.sTipMovimento] Restringe o sentido
 * @returns {Promise<Array<object>>}
 */
export async function listaTitulosAbertos(iIdConta, oFiltro = {}) {
   const aCondicoes = ['t.sta_baixado = 0', '(t.id_conta = :idConta OR t.id_conta IS NULL)'];
   const oParams = { idConta: iIdConta };

   const sDataLimite = dataBrParaMysql(oFiltro.sDataLimiteBr);
   if (sDataLimite) {
      aCondicoes.push('t.dat_vencimento <= :datLimite');
      oParams.datLimite = sDataLimite;
   }

   if (oFiltro.sTipMovimento === MOVIMENTO_ENTRADA || oFiltro.sTipMovimento === MOVIMENTO_SAIDA) {
      aCondicoes.push('t.tip_movimento = :tipMovimento');
      oParams.tipMovimento = oFiltro.sTipMovimento;
   }

   const aLinhas = await query(
      `SELECT ${COLUNAS_TITULO}
         FROM titulo_aberto t
        WHERE ${aCondicoes.join(' AND ')}
     ORDER BY t.dat_vencimento, t.cod_titulo`,
      oParams
   );

   return aLinhas.map(mapeiaTitulo);
} // listaTitulosAbertos

/**
 * Busca um título pelo código.
 * @param {string} sCodTitulo
 * @returns {Promise<object|null>}
 */
export async function buscaTituloPorCodigo(sCodTitulo) {
   if (!sCodTitulo) {
      return null;
   }

   const aLinhas = await query(
      `SELECT ${COLUNAS_TITULO} FROM titulo_aberto t WHERE t.cod_titulo = :codTitulo LIMIT 1`,
      { codTitulo: sCodTitulo }
   );

   return aLinhas[0] ? mapeiaTitulo(aLinhas[0]) : null;
} // buscaTituloPorCodigo

/**
 * Marca um título como baixado, guardando os valores efetivamente pagos.
 *
 * @param {object} oBaixa
 * @param {string} oBaixa.sCodTitulo
 * @param {number} oBaixa.iIdConta Conta que recebeu/pagou
 * @param {string} oBaixa.sDatBaixaBr Data da baixa (DD/MM/AAAA)
 * @param {number} oBaixa.nValPago Valor efetivamente movimentado
 * @param {number} [oBaixa.nValMulta]
 * @param {number} [oBaixa.nValJuros]
 * @param {number} [oBaixa.nValDesconto]
 * @param {number} [oBaixa.nValTarifa]
 * @param {string} oBaixa.sCodLancamento Lançamento gerado no extrato do sistema
 * @returns {Promise<number>} Registros atualizados
 */
export async function marcaTituloBaixado(oBaixa) {
   const oResultado = await query(
      `UPDATE titulo_aberto
          SET sta_baixado = 1,
              id_conta = :idConta,
              dat_baixa = :datBaixa,
              val_pago = :valPago,
              val_multa = :valMulta,
              val_juros = :valJuros,
              val_desconto = :valDesconto,
              val_tarifa = :valTarifa,
              tip_origem = :tipOrigem,
              cod_lancamento_baixa = :codLancamento
        WHERE cod_titulo = :codTitulo
          AND sta_baixado = 0`,
      {
         codTitulo: oBaixa.sCodTitulo,
         idConta: oBaixa.iIdConta,
         datBaixa: dataBrParaMysql(oBaixa.sDatBaixaBr),
         valPago: Number(oBaixa.nValPago),
         valMulta: Number(oBaixa.nValMulta ?? 0),
         valJuros: Number(oBaixa.nValJuros ?? 0),
         valDesconto: Number(oBaixa.nValDesconto ?? 0),
         valTarifa: Number(oBaixa.nValTarifa ?? 0),
         // "atualizando sua origem", conforme a ação 3 do item 6.1.3.8
         tipOrigem: ORIGEM_BAIXA_TITULO,
         codLancamento: oBaixa.sCodLancamento,
      }
   );

   return oResultado.affectedRows ?? 0;
} // marcaTituloBaixado

/**
 * Desfaz a baixa de um título, devolvendo-o à relação de títulos em aberto.
 * Usado quando o lançamento gerado pela baixa é excluído.
 * @param {string} sCodLancamento
 * @returns {Promise<number>}
 */
export async function reabreTituloPorLancamento(sCodLancamento) {
   const oResultado = await query(
      `UPDATE titulo_aberto
          SET sta_baixado = 0,
              dat_baixa = NULL,
              val_pago = NULL,
              cod_lancamento_baixa = NULL
        WHERE cod_lancamento_baixa = :codLancamento`,
      { codLancamento: sCodLancamento }
   );

   return oResultado.affectedRows ?? 0;
} // reabreTituloPorLancamento

/**
 * Insere ou atualiza um título (usado pela carga de massa e por integrações).
 * @param {object} oTitulo
 * @returns {Promise<void>}
 */
export async function gravaTitulo(oTitulo) {
   await query(
      `INSERT INTO titulo_aberto
         (id_conta, cod_titulo, dat_emissao, dat_vencimento, nom_emitente, des_historico,
          val_titulo, val_multa, val_juros, val_desconto, tip_documento, num_documento,
          num_parcela, tip_movimento, tip_origem, sta_baixado)
       VALUES
         (:idConta, :codTitulo, :datEmissao, :datVencimento, :nomEmitente, :desHistorico,
          :valTitulo, :valMulta, :valJuros, :valDesconto, :tipDocumento, :numDocumento,
          :numParcela, :tipMovimento, :tipOrigem, 0)
       ON DUPLICATE KEY UPDATE
         id_conta = VALUES(id_conta),
         dat_emissao = VALUES(dat_emissao),
         dat_vencimento = VALUES(dat_vencimento),
         nom_emitente = VALUES(nom_emitente),
         des_historico = VALUES(des_historico),
         val_titulo = VALUES(val_titulo),
         val_multa = VALUES(val_multa),
         val_juros = VALUES(val_juros),
         val_desconto = VALUES(val_desconto),
         tip_documento = VALUES(tip_documento),
         num_documento = VALUES(num_documento),
         num_parcela = VALUES(num_parcela),
         tip_movimento = VALUES(tip_movimento),
         tip_origem = VALUES(tip_origem)`,
      {
         idConta: oTitulo.idConta ?? null,
         codTitulo: oTitulo.codTitulo,
         datEmissao: dataBrParaMysql(oTitulo.datEmissao),
         datVencimento: dataBrParaMysql(oTitulo.datVencimento),
         nomEmitente: oTitulo.nomEmitente,
         desHistorico: oTitulo.desHistorico ?? null,
         valTitulo: Number(oTitulo.valTitulo),
         valMulta: Number(oTitulo.valMulta ?? 0),
         valJuros: Number(oTitulo.valJuros ?? 0),
         valDesconto: Number(oTitulo.valDesconto ?? 0),
         tipDocumento: oTitulo.tipDocumento ?? null,
         numDocumento: oTitulo.numDocumento ?? null,
         numParcela: oTitulo.numParcela ?? null,
         tipMovimento: oTitulo.tipMovimento,
         tipOrigem: oTitulo.tipOrigem,
      }
   );
} // gravaTitulo
