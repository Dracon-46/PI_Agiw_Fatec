// ============================================================================
// auditoriaRepository.js - Trilha de auditoria do módulo
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Atende o item 6.5 das sugestões: registro detalhado de todas as ações
// realizadas no módulo (quem conciliou, quem bloqueou período, quem lançou),
// necessário para compliance e auditorias financeiras.
// ============================================================================

import { query } from '../db.js';

/** Ações registradas na trilha de auditoria */
export const ACAO_CONCILIACAO = 'CONCILIACAO';
export const ACAO_ESTORNO = 'ESTORNO';
export const ACAO_CONCILIACAO_AUTOMATICA = 'CONCILIACAO_AUTO';
export const ACAO_LANCAMENTO_INCLUIDO = 'LANCAMENTO_INCLUIDO';
export const ACAO_LANCAMENTO_EXCLUIDO = 'LANCAMENTO_EXCLUIDO';
export const ACAO_MOVIMENTO_EXCLUIDO = 'MOVIMENTO_EXCLUIDO';
export const ACAO_IMPORTACAO_API = 'IMPORTACAO_API';
export const ACAO_IMPORTACAO_ARQUIVO = 'IMPORTACAO_ARQUIVO';
export const ACAO_BLOQUEIO = 'BLOQUEIO_PERIODO';
export const ACAO_DESBLOQUEIO = 'DESBLOQUEIO_PERIODO';
export const ACAO_EXPORTACAO = 'EXPORTACAO';
export const ACAO_CONTA_CADASTRADA = 'CONTA_CADASTRADA';
export const ACAO_CONTA_REMOVIDA = 'CONTA_REMOVIDA';

/** Rótulos amigáveis exibidos na tela de auditoria */
export const ROTULOS_ACAO = {
   [ACAO_CONCILIACAO]: 'Conciliação',
   [ACAO_ESTORNO]: 'Estorno de conciliação',
   [ACAO_CONCILIACAO_AUTOMATICA]: 'Conciliação automática',
   [ACAO_LANCAMENTO_INCLUIDO]: 'Lançamento incluído',
   [ACAO_LANCAMENTO_EXCLUIDO]: 'Lançamento excluído',
   [ACAO_MOVIMENTO_EXCLUIDO]: 'Movimento excluído',
   [ACAO_IMPORTACAO_API]: 'Importação via API',
   [ACAO_IMPORTACAO_ARQUIVO]: 'Importação por arquivo',
   [ACAO_BLOQUEIO]: 'Bloqueio de período',
   [ACAO_DESBLOQUEIO]: 'Desbloqueio de período',
   [ACAO_EXPORTACAO]: 'Exportação de relatório',
   [ACAO_CONTA_CADASTRADA]: 'Conta cadastrada',
   [ACAO_CONTA_REMOVIDA]: 'Conta removida',
};

/** Limite padrão de registros devolvidos na consulta */
export const LIMITE_CONSULTA_PADRAO = 200;

/**
 * Grava um evento na trilha de auditoria.
 *
 * Falhas de auditoria não interrompem a operação de negócio: o registro é
 * complementar e não deve provocar rollback de uma conciliação já validada.
 *
 * @param {object} oEvento
 * @param {number|null} [oEvento.idConta] Conta relacionada
 * @param {string} oEvento.tipAcao Uma das constantes ACAO_*
 * @param {string} oEvento.desEntidade Entidade afetada (lancamento, movimento, conta)
 * @param {string} [oEvento.codEntidade] Identificador do registro afetado
 * @param {string} oEvento.desDetalhe Descrição legível do que aconteceu
 * @param {number} [oEvento.valReferencia] Valor envolvido, quando aplicável
 * @param {string} [oEvento.nomUsuario] Usuário responsável
 * @returns {Promise<void>}
 */
export async function registraAuditoria(oEvento) {
   try {
      await query(
         `INSERT INTO auditoria
            (id_conta, nom_usuario, tip_acao, des_entidade, cod_entidade, des_detalhe, val_referencia)
          VALUES
            (:idConta, :nomUsuario, :tipAcao, :desEntidade, :codEntidade, :desDetalhe, :valReferencia)`,
         {
            idConta: oEvento.idConta ?? null,
            nomUsuario: oEvento.nomUsuario || 'INFTEC',
            tipAcao: oEvento.tipAcao,
            desEntidade: oEvento.desEntidade,
            codEntidade: oEvento.codEntidade ?? null,
            desDetalhe: String(oEvento.desDetalhe ?? '').slice(0, 600),
            valReferencia: oEvento.valReferencia ?? null,
         }
      );
   } catch (oErro) {
      console.error('[auditoriaRepository] Falha ao registrar auditoria:', oErro.message);
   }
} // registraAuditoria

/**
 * Grava vários eventos de auditoria de uma vez.
 * @param {Array<object>} aEventos
 * @returns {Promise<void>}
 */
export async function registraAuditoriaEmLote(aEventos) {
   for (const oEvento of aEventos) {
      await registraAuditoria(oEvento);
   }
} // registraAuditoriaEmLote

/**
 * Lista os eventos de auditoria, com filtros opcionais.
 * @param {object} [oFiltro]
 * @param {number} [oFiltro.idConta] Restringe a uma conta
 * @param {string} [oFiltro.tipAcao] Restringe a um tipo de ação
 * @param {string} [oFiltro.datInicioMysql] Data inicial (AAAA-MM-DD)
 * @param {string} [oFiltro.datFimMysql] Data final (AAAA-MM-DD)
 * @param {number} [oFiltro.iLimite] Máximo de registros
 * @returns {Promise<Array<object>>}
 */
export async function listaAuditoria(oFiltro = {}) {
   const aCondicoes = [];
   const oParams = {};

   if (oFiltro.idConta) {
      aCondicoes.push('a.id_conta = :idConta');
      oParams.idConta = oFiltro.idConta;
   }
   if (oFiltro.tipAcao) {
      aCondicoes.push('a.tip_acao = :tipAcao');
      oParams.tipAcao = oFiltro.tipAcao;
   }
   if (oFiltro.datInicioMysql) {
      aCondicoes.push('a.dat_evento >= :datInicio');
      oParams.datInicio = `${oFiltro.datInicioMysql} 00:00:00`;
   }
   if (oFiltro.datFimMysql) {
      aCondicoes.push('a.dat_evento <= :datFim');
      oParams.datFim = `${oFiltro.datFimMysql} 23:59:59`;
   }

   // O LIMIT é interpolado como inteiro validado: placeholders em LIMIT
   // não são aceitos em instruções preparadas do MySQL
   const iLimite = Math.min(Math.max(Number(oFiltro.iLimite) || LIMITE_CONSULTA_PADRAO, 1), 1000);
   const sWhere = aCondicoes.length > 0 ? `WHERE ${aCondicoes.join(' AND ')}` : '';

   const aLinhas = await query(
      `SELECT a.id_auditoria AS idAuditoria,
              a.dat_evento AS datEvento,
              a.nom_usuario AS nomUsuario,
              a.tip_acao AS tipAcao,
              a.des_entidade AS desEntidade,
              a.cod_entidade AS codEntidade,
              a.des_detalhe AS desDetalhe,
              a.val_referencia AS valReferencia,
              c.cod_conta AS codConta,
              c.cod_agencia AS codAgencia,
              c.num_conta_corrente AS numContaCorrente
         FROM auditoria a
         LEFT JOIN conta_corrente c ON c.id_conta = a.id_conta
         ${sWhere}
     ORDER BY a.dat_evento DESC, a.id_auditoria DESC
        LIMIT ${iLimite}`,
      oParams
   );

   return aLinhas.map((oLinha) => ({
      ...oLinha,
      desAcao: ROTULOS_ACAO[oLinha.tipAcao] ?? oLinha.tipAcao,
      valReferencia: oLinha.valReferencia === null ? null : Number(oLinha.valReferencia),
   }));
} // listaAuditoria

/**
 * Resume a quantidade de eventos por tipo de ação.
 * @param {number} [iIdConta]
 * @returns {Promise<Array<{ tipAcao: string, desAcao: string, iQuantidade: number }>>}
 */
export async function resumeAuditoriaPorAcao(iIdConta) {
   const aLinhas = await query(
      `SELECT tip_acao AS tipAcao, COUNT(*) AS iQuantidade
         FROM auditoria
        ${iIdConta ? 'WHERE id_conta = :idConta' : ''}
     GROUP BY tip_acao
     ORDER BY iQuantidade DESC`,
      iIdConta ? { idConta: iIdConta } : undefined
   );

   return aLinhas.map((oLinha) => ({
      tipAcao: oLinha.tipAcao,
      desAcao: ROTULOS_ACAO[oLinha.tipAcao] ?? oLinha.tipAcao,
      iQuantidade: Number(oLinha.iQuantidade),
   }));
} // resumeAuditoriaPorAcao

/**
 * Registra o envio de um arquivo de extrato e devolve o identificador.
 * @param {object} oArquivo
 * @returns {Promise<void>}
 */
export async function registraArquivoImportado(oArquivo) {
   try {
      await query(
         `INSERT INTO arquivo_importado
            (id_conta, nom_arquivo, tip_formato, num_bytes, qtd_lidos, qtd_importados, qtd_ignorados, nom_usuario)
          VALUES
            (:idConta, :nomArquivo, :tipFormato, :numBytes, :qtdLidos, :qtdImportados, :qtdIgnorados, :nomUsuario)`,
         {
            idConta: oArquivo.idConta,
            nomArquivo: String(oArquivo.nomArquivo ?? '').slice(0, 260),
            tipFormato: oArquivo.tipFormato,
            numBytes: oArquivo.numBytes ?? 0,
            qtdLidos: oArquivo.qtdLidos ?? 0,
            qtdImportados: oArquivo.qtdImportados ?? 0,
            qtdIgnorados: oArquivo.qtdIgnorados ?? 0,
            nomUsuario: oArquivo.nomUsuario || 'INFTEC',
         }
      );
   } catch (oErro) {
      console.error('[auditoriaRepository] Falha ao registrar arquivo:', oErro.message);
   }
} // registraArquivoImportado

/**
 * Lista o histórico de arquivos enviados para uma conta.
 * @param {number} iIdConta
 * @returns {Promise<Array<object>>}
 */
export async function listaArquivosImportados(iIdConta) {
   const aLinhas = await query(
      `SELECT nom_arquivo AS nomArquivo,
              tip_formato AS tipFormato,
              num_bytes AS numBytes,
              qtd_lidos AS qtdLidos,
              qtd_importados AS qtdImportados,
              qtd_ignorados AS qtdIgnorados,
              dat_importacao AS datImportacao,
              nom_usuario AS nomUsuario
         FROM arquivo_importado
        WHERE id_conta = :idConta
     ORDER BY dat_importacao DESC
        LIMIT 50`,
      { idConta: iIdConta }
   );

   return aLinhas.map((oLinha) => ({
      ...oLinha,
      numBytes: Number(oLinha.numBytes),
      qtdLidos: Number(oLinha.qtdLidos),
      qtdImportados: Number(oLinha.qtdImportados),
      qtdIgnorados: Number(oLinha.qtdIgnorados),
   }));
} // listaArquivosImportados
