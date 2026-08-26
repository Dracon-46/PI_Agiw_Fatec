// ============================================================================
// contaRepository.js - Persistência de bancos e contas correntes
// Projeto Banco - Ticket 37060 | Agiw Sistemas
// ============================================================================

import { BankProviderFactory } from '../../providers/BankProviderFactory.js';
import { dataBrParaMysql, dataMysqlParaBr, query } from '../db.js';

/**
 * Lista o catálogo de bancos.
 * @returns {Promise<Array<object>>}
 */
export async function listaBancos() {
   return query(
      `SELECT cod_banco AS codBanco, nom_banco AS nomBanco, slug_provider AS slugProvider,
              cor_banco AS corBanco, cor_texto AS corTexto, url_logo AS urlLogo
         FROM banco
     ORDER BY nom_banco`
   );
} // listaBancos

/**
 * Monta o objeto de conta no formato da UI.
 * @param {object} oLinha
 * @param {Array<object>} [aProviders]
 * @returns {object}
 */
function mapeiaConta(oLinha, aProviders = []) {
   const oProvider = aProviders.find((oItem) => oItem.slug === oLinha.slugProvider);
   return {
      idConta: oLinha.idConta,
      codConta: oLinha.codConta,
      slugProvider: oLinha.slugProvider,
      codBanco: oLinha.codBanco,
      nomBanco: oLinha.nomBanco,
      codAgencia: oLinha.codAgencia,
      numContaCorrente: oLinha.numContaCorrente,
      tipConta: oLinha.tipConta,
      desAgencia: oLinha.desAgencia,
      corBanco: oLinha.corBanco,
      corTexto: oLinha.corTexto,
      urlLogo: oLinha.urlLogo ?? '',
      valSaldoSistema: Number(oLinha.valSaldoSistema ?? 0),
      datUltimoBloqueio: dataMysqlParaBr(oLinha.datUltimoBloqueio),
      bIntegracaoConfigurada: Boolean(oProvider?.configured),
      nomProvider: oProvider?.name ?? oLinha.nomBanco,
   };
} // mapeiaConta

/**
 * Lista contas correntes ativas.
 * @returns {Promise<Array<object>>}
 */
export async function listaContasCorrentes() {
   const aProviders = BankProviderFactory.getAvailableProviders();
   const aLinhas = await query(
      `SELECT c.id_conta AS idConta,
              c.cod_conta AS codConta,
              b.slug_provider AS slugProvider,
              c.cod_banco AS codBanco,
              b.nom_banco AS nomBanco,
              c.cod_agencia AS codAgencia,
              c.num_conta_corrente AS numContaCorrente,
              c.tip_conta AS tipConta,
              c.des_agencia AS desAgencia,
              b.cor_banco AS corBanco,
              b.cor_texto AS corTexto,
              b.url_logo AS urlLogo,
              c.val_saldo_sistema AS valSaldoSistema,
              c.dat_ultimo_bloqueio AS datUltimoBloqueio
         FROM conta_corrente c
         INNER JOIN banco b ON b.cod_banco = c.cod_banco
        WHERE c.b_ativo = 1
     ORDER BY b.nom_banco, c.cod_agencia, c.num_conta_corrente`
   );
   return aLinhas.map((oLinha) => mapeiaConta(oLinha, aProviders));
} // listaContasCorrentes

/**
 * Busca uma conta pelo código lógico.
 * @param {string} sCodConta
 * @returns {Promise<object|null>}
 */
export async function buscaContaPorCodigo(sCodConta) {
   if (!sCodConta) {
      return null;
   }
   const aProviders = BankProviderFactory.getAvailableProviders();
   const aLinhas = await query(
      `SELECT c.id_conta AS idConta,
              c.cod_conta AS codConta,
              b.slug_provider AS slugProvider,
              c.cod_banco AS codBanco,
              b.nom_banco AS nomBanco,
              c.cod_agencia AS codAgencia,
              c.num_conta_corrente AS numContaCorrente,
              c.tip_conta AS tipConta,
              c.des_agencia AS desAgencia,
              b.cor_banco AS corBanco,
              b.cor_texto AS corTexto,
              b.url_logo AS urlLogo,
              c.val_saldo_sistema AS valSaldoSistema,
              c.dat_ultimo_bloqueio AS datUltimoBloqueio
         FROM conta_corrente c
         INNER JOIN banco b ON b.cod_banco = c.cod_banco
        WHERE c.cod_conta = :codConta
          AND c.b_ativo = 1
        LIMIT 1`,
      { codConta: sCodConta }
   );
   return aLinhas[0] ? mapeiaConta(aLinhas[0], aProviders) : null;
} // buscaContaPorCodigo

/**
 * Gera o código lógico da conta.
 * @param {string} sSlug
 * @param {string} sAgencia
 * @param {string} sConta
 * @returns {string}
 */
export function montaCodConta(sSlug, sAgencia, sConta) {
   return `${sSlug}-${String(sAgencia).replace(/\s+/g, '')}-${String(sConta).replace(/\s+/g, '')}`.toLowerCase();
} // montaCodConta

/**
 * Cadastra uma conta corrente real (sem massa fictícia).
 * @param {object} oDados
 * @returns {Promise<object>}
 */
export async function cadastraContaCorrente(oDados) {
   const aBancos = await listaBancos();
   const oBanco = aBancos.find((oItem) => oItem.slugProvider === oDados.slugProvider);
   if (!oBanco) {
      throw new Error('Banco inválido. Selecione BB, Itaú ou Bradesco.');
   }

   const sAgencia = String(oDados.codAgencia ?? '').trim();
   const sConta = String(oDados.numContaCorrente ?? '').trim();
   if (!sAgencia || !sConta) {
      throw new Error('Informe a agência e a conta corrente.');
   }

   const sCodConta = montaCodConta(oBanco.slugProvider, sAgencia, sConta);
   const sTipConta = oDados.tipConta === 'cp' ? 'cp' : 'cc';
   const sDatBloqueio = dataBrParaMysql(oDados.datUltimoBloqueio);

   try {
      await query(
         `INSERT INTO conta_corrente
            (cod_conta, cod_banco, cod_agencia, num_conta_corrente, tip_conta,
             des_agencia, val_saldo_sistema, dat_ultimo_bloqueio, b_ativo)
          VALUES
            (:codConta, :codBanco, :codAgencia, :numConta, :tipConta,
             :desAgencia, :valSaldo, :datBloqueio, 1)`,
         {
            codConta: sCodConta,
            codBanco: oBanco.codBanco,
            codAgencia: sAgencia,
            numConta: sConta,
            tipConta: sTipConta,
            desAgencia: String(oDados.desAgencia ?? '').trim() || `Agência ${sAgencia}`,
            valSaldo: Number(oDados.valSaldoSistema) || 0,
            datBloqueio: sDatBloqueio,
         }
      );
   } catch (oErro) {
      if (oErro?.code === 'ER_DUP_ENTRY') {
         throw new Error('Já existe uma conta cadastrada com este banco, agência e C.C.');
      }
      throw oErro;
   }

   return buscaContaPorCodigo(sCodConta);
} // cadastraContaCorrente

/**
 * Altera banco, agência, conta e descrição de uma conta já cadastrada.
 *
 * O código lógico deriva de slug + agência + conta, então mudar qualquer um
 * deles muda o cod_conta. As tabelas filhas apontam para id_conta, que não se
 * altera — o histórico de conciliação da conta é preservado.
 *
 * @param {string} sCodContaAtual Código da conta antes da alteração
 * @param {object} oDados
 * @returns {Promise<object>} Conta atualizada
 */
export async function atualizaContaCorrente(sCodContaAtual, oDados) {
   const oAtual = await buscaContaPorCodigo(sCodContaAtual);
   if (!oAtual) {
      throw new Error(`Conta "${sCodContaAtual}" não localizada.`);
   }

   const aBancos = await listaBancos();
   const oBanco = aBancos.find((oItem) => oItem.slugProvider === oDados.slugProvider);
   if (!oBanco) {
      throw new Error('Banco inválido. Selecione um banco do catálogo.');
   }

   const sAgencia = String(oDados.codAgencia ?? '').trim();
   const sConta = String(oDados.numContaCorrente ?? '').trim();
   if (!sAgencia || !sConta) {
      throw new Error('Informe a agência e a conta corrente.');
   }

   const sCodConta = montaCodConta(oBanco.slugProvider, sAgencia, sConta);
   const sTipConta = oDados.tipConta === 'cp' ? 'cp' : 'cc';

   try {
      await query(
         `UPDATE conta_corrente
             SET cod_conta = :codConta,
                 cod_banco = :codBanco,
                 cod_agencia = :codAgencia,
                 num_conta_corrente = :numConta,
                 tip_conta = :tipConta,
                 des_agencia = :desAgencia,
                 val_saldo_sistema = :valSaldo,
                 dat_ultimo_bloqueio = :datBloqueio
           WHERE id_conta = :idConta`,
         {
            idConta: oAtual.idConta,
            codConta: sCodConta,
            codBanco: oBanco.codBanco,
            codAgencia: sAgencia,
            numConta: sConta,
            tipConta: sTipConta,
            desAgencia: String(oDados.desAgencia ?? '').trim() || `Agência ${sAgencia}`,
            valSaldo: Number(oDados.valSaldoSistema) || 0,
            datBloqueio: dataBrParaMysql(oDados.datUltimoBloqueio),
         }
      );
   } catch (oErro) {
      if (oErro?.code === 'ER_DUP_ENTRY') {
         throw new Error('Já existe outra conta cadastrada com este banco, agência e C.C.');
      }
      throw oErro;
   }

   return buscaContaPorCodigo(sCodConta);
} // atualizaContaCorrente

/**
 * Atualiza a data de bloqueio da conta.
 * @param {string} sCodConta
 * @param {string} sDatBloqueioBr
 * @returns {Promise<void>}
 */
export async function atualizaBloqueioConta(sCodConta, sDatBloqueioBr) {
   await query(
      `UPDATE conta_corrente
          SET dat_ultimo_bloqueio = :datBloqueio
        WHERE cod_conta = :codConta`,
      {
         codConta: sCodConta,
         datBloqueio: dataBrParaMysql(sDatBloqueioBr),
      }
   );
} // atualizaBloqueioConta

/**
 * Remove (inativa) uma conta cadastrada.
 * @param {string} sCodConta
 * @returns {Promise<boolean>}
 */
export async function inativaConta(sCodConta) {
   const oResultado = await query(
      `UPDATE conta_corrente SET b_ativo = 0 WHERE cod_conta = :codConta`,
      { codConta: sCodConta }
   );
   return (oResultado.affectedRows ?? 0) > 0;
} // inativaConta
