// ============================================================================
// auditoriaRepository.js - Trilha de auditoria do módulo (TBCONB009)
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Atende o item 6.5 das sugestões: registro detalhado de todas as ações
// realizadas no módulo (quem conciliou, quem bloqueou período, quem lançou),
// necessário para compliance e auditorias financeiras.
//
// TBCONB009 é tabela NOVA: o ERP não tem trilha de auditoria da conciliação —
// TBSENH008 registra mudança de permissão, não de movimento. A tabela segue o
// padrão de nomes da Agiw, na sequência do módulo de conciliação bancária.
//
// A conta do evento é gravada como em TBCONB006 (banco, agência e conta
// corrente), e não por um id: é a mesma chave que o ERP usa.
// ============================================================================

import { codEmp, dataIsoParaData, dataSqlParaIso, limpa, prisma } from '../db.js';
import { nomUsuarioAtual } from './usuarioRepository.js';

/** Ações registradas na trilha de auditoria */
export const ACAO_CONCILIACAO = 'CONCILIACAO';
export const ACAO_ESTORNO = 'ESTORNO';
export const ACAO_CONCILIACAO_AUTOMATICA = 'CONCILIACAO_AUTO';
export const ACAO_LANCAMENTO_INCLUIDO = 'LANCAMENTO_INCLUIDO';
export const ACAO_LANCAMENTO_EXCLUIDO = 'LANCAMENTO_EXCLUIDO';
export const ACAO_LANCAMENTO_ALTERADO = 'LANCAMENTO_ALTERADO';
export const ACAO_MOVIMENTO_EXCLUIDO = 'MOVIMENTO_EXCLUIDO';
export const ACAO_IMPORTACAO_API = 'IMPORTACAO_API';
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
   [ACAO_LANCAMENTO_ALTERADO]: 'Lançamento alterado',
   [ACAO_MOVIMENTO_EXCLUIDO]: 'Movimento excluído',
   [ACAO_IMPORTACAO_API]: 'Importação via API',
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
 * @param {object|null} [oEvento.oConta] Conta relacionada
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
      const oConta = oEvento.oConta ?? null;

      await prisma.TBCONB009.create({
         data: {
            CODEMP: oConta?.codEmp || codEmp(),
            DATEVENTO: new Date(),
            USER_ID: (oEvento.nomUsuario || nomUsuarioAtual()).slice(0, 10),
            TIPACAO: String(oEvento.tipAcao ?? '').slice(0, 20),
            DESENTIDADE: String(oEvento.desEntidade ?? '').slice(0, 20),
            CODENTIDADE: oEvento.codEntidade ? String(oEvento.codEntidade).slice(0, 120) : null,
            DESDETALHE: String(oEvento.desDetalhe ?? '').slice(0, 600),
            VALREFERENCIA: oEvento.valReferencia ?? null,
            CODBANCO: oConta?.codBancoErp ?? null,
            CODAGENCIA: oConta?.codAgencia ?? null,
            CODCTACORRENTE: oConta?.numContaCorrente ?? null,
         },
      });
   } catch (oErro) {
      console.error('[auditoriaRepository] Falha ao registrar auditoria:', oErro.message);
   }
} // registraAuditoria

/**
 * Monta o objeto de evento no formato da tela de auditoria.
 * @param {object} oLinha Linha de TBCONB009
 * @returns {object}
 */
function mapeiaEvento(oLinha) {
   const sTipAcao = limpa(oLinha.TIPACAO);

   return {
      idAuditoria: Number(oLinha.NUMSEQAUDIT),
      // A tela formata a partir do texto ISO; devolvê-lo já pronto evita que o
      // fuso do navegador mova o carimbo de hora do evento.
      datEvento: oLinha.DATEVENTO ? oLinha.DATEVENTO.toISOString().slice(0, 19) : '',
      nomUsuario: limpa(oLinha.USER_ID),
      tipAcao: sTipAcao,
      desAcao: ROTULOS_ACAO[sTipAcao] ?? sTipAcao,
      desEntidade: limpa(oLinha.DESENTIDADE),
      codEntidade: limpa(oLinha.CODENTIDADE),
      desDetalhe: limpa(oLinha.DESDETALHE),
      valReferencia: oLinha.VALREFERENCIA === null ? null : Number(oLinha.VALREFERENCIA),
      codAgencia: limpa(oLinha.CODAGENCIA),
      numContaCorrente: limpa(oLinha.CODCTACORRENTE),
      codConta: '',
   };
} // mapeiaEvento

/**
 * Monta o filtro de conta e período usado nas duas consultas.
 * @param {object} oFiltro
 * @returns {object} Trecho de `where` do Prisma
 */
function montaFiltro(oFiltro) {
   const oWhere = { CODEMP: oFiltro.oConta?.codEmp || codEmp() };

   if (oFiltro.oConta) {
      oWhere.CODBANCO = oFiltro.oConta.codBancoErp;
      oWhere.CODAGENCIA = oFiltro.oConta.codAgencia;
      oWhere.CODCTACORRENTE = oFiltro.oConta.numContaCorrente;
   }
   if (oFiltro.tipAcao) {
      oWhere.TIPACAO = oFiltro.tipAcao;
   }

   const dtInicio = dataIsoParaData(oFiltro.datInicioSql);
   const dtFim = dataIsoParaData(oFiltro.datFimSql);

   if (dtInicio || dtFim) {
      oWhere.DATEVENTO = {};
      if (dtInicio) {
         oWhere.DATEVENTO.gte = dtInicio;
      }
      if (dtFim) {
         // A data final entra como o fim do dia: o evento das 15h do último dia
         // do filtro pertence ao período que o usuário pediu.
         oWhere.DATEVENTO.lte = new Date(`${dataSqlParaIso(dtFim)}T23:59:59.999Z`);
      }
   }

   return oWhere;
} // montaFiltro

/**
 * Lista os eventos de auditoria, com filtros opcionais.
 * @param {object} [oFiltro]
 * @param {object} [oFiltro.oConta] Restringe a uma conta
 * @param {string} [oFiltro.tipAcao] Restringe a um tipo de ação
 * @param {string} [oFiltro.datInicioSql] Data inicial (AAAA-MM-DD)
 * @param {string} [oFiltro.datFimSql] Data final (AAAA-MM-DD)
 * @param {number} [oFiltro.iLimite] Máximo de registros
 * @returns {Promise<Array<object>>}
 */
export async function listaAuditoria(oFiltro = {}) {
   const iLimite = Math.min(Math.max(Number(oFiltro.iLimite) || LIMITE_CONSULTA_PADRAO, 1), 1000);

   const aLinhas = await prisma.TBCONB009.findMany({
      where: montaFiltro(oFiltro),
      orderBy: [{ DATEVENTO: 'desc' }, { NUMSEQAUDIT: 'desc' }],
      take: iLimite,
   });

   return aLinhas.map((oLinha) => ({
      ...mapeiaEvento(oLinha),
      codConta: oFiltro.oConta?.codConta ?? '',
   }));
} // listaAuditoria

/**
 * Resume a quantidade de eventos por tipo de ação.
 * @param {object} [oConta] Restringe a uma conta
 * @returns {Promise<Array<{ tipAcao: string, desAcao: string, iQuantidade: number }>>}
 */
export async function resumeAuditoriaPorAcao(oConta) {
   const aLinhas = await prisma.TBCONB009.groupBy({
      by: ['TIPACAO'],
      where: montaFiltro({ oConta }),
      _count: { _all: true },
   });

   return aLinhas
      .map((oLinha) => {
         const sTipAcao = limpa(oLinha.TIPACAO);
         return {
            tipAcao: sTipAcao,
            desAcao: ROTULOS_ACAO[sTipAcao] ?? sTipAcao,
            iQuantidade: Number(oLinha._count?._all ?? 0),
         };
      })
      .sort((oA, oB) => oB.iQuantidade - oA.iQuantidade);
} // resumeAuditoriaPorAcao
