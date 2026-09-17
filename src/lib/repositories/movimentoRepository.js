// ============================================================================
// movimentoRepository.js - Extrato bancário no ERP (TBCONB006 e TBCONB008)
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// A grade "Movimentos no Banco" é TBCONB006, a tabela que o ERP já usava para
// o extrato importado por arquivo (NOMEARQUIVO guarda o nome do .txt ou .ofx).
// O que este módulo acrescenta é a origem: o extrato passa a vir da API da
// instituição, e é gravado na MESMA tabela — quem concilia pelo Satis e quem
// concilia por aqui olham o mesmo extrato.
//
// Quatro decisões vêm disso:
//
//   - a chave de TBCONB006 é (empresa, banco, agência, NUMSEQMOVTO, conta), e
//     NUMSEQMOVTO é uma sequência de 12 dígitos por conta. Como sequência não
//     identifica a LINHA do extrato, reconsultar um período gravaria tudo de
//     novo. Quem impede isso é o FITID: é o campo de OFX para "id único da
//     transação no banco", e é nele que gravamos o código determinístico do
//     movimento. Mesma linha do extrato, mesmo FITID, logo UPDATE em vez de
//     INSERT;
//   - HISTMOVTO é CHAR(60) e o histórico das APIs passa disso. O texto
//     completo vai para MEMO (VARCHAR 256), que é a coluna de OFX para isso,
//     e HISTMOVTOEXIBE guarda o que a grade mostra;
//   - a conciliação é marcada em STAMOVTO + NUMSEQCONC, exatamente como em
//     TBCONB001. É o mesmo NUMSEQCONC nos dois lados que forma o grupo;
//   - os dias já consultados na API ficam em TBCONB008, tabela nova. Sem ela
//     não haveria como distinguir "dia sem movimento" de "dia nunca
//     consultado" — os dois chegam da API como lista vazia.
//
// NÃO há exclusão de movimento: o item 6.1.3.8 permite excluir apenas
// registros do ERP. Extrato do banco é fato consumado e não se apaga.
// ============================================================================

import {
   codEmp,
   dataBrParaData,
   dataIsoParaData,
   dataSqlParaBr,
   dataSqlParaIso,
   limpa,
   prisma,
} from '../db.js';
import { filtroContaMovimento } from './contaRepository.js';
import { STATUS_CONCILIADO } from './lancamentoRepository.js';

/** Identificação da origem gravada em TBCONB006.NOMEARQUIVO */
const ORIGEM_ARQUIVO = 'API';

/** Colunas lidas nas consultas da grade do banco */
const SELECAO_MOVIMENTO = {
   CODEMP: true,
   CODBANCO: true,
   CODAGENCIA: true,
   CODCTACORRENTE: true,
   NUMSEQMOVTO: true,
   DATMOVTO: true,
   HISTMOVTO: true,
   HISTMOVTOEXIBE: true,
   MEMO: true,
   DOCUMENTO: true,
   VALMOVTO: true,
   TIPOMOVTO: true,
   STAMOVTO: true,
   NUMSEQCONC: true,
   TRNTYPE: true,
   FITID: true,
   DATIMPORTACAO: true,
   NOMEARQUIVO: true,
};

/**
 * Converte a linha do ERP no objeto que a grade consome.
 * @param {object} oLinha Linha de TBCONB006
 * @returns {object}
 */
function mapeiaMovimento(oLinha) {
   return {
      codMovimento: limpa(oLinha.NUMSEQMOVTO),
      codConta: '',
      datMovimento: dataSqlParaBr(oLinha.DATMOVTO),
      // HISTMOVTOEXIBE é o texto para a tela; MEMO tem o histórico completo da
      // API, e HISTMOVTO é o de 60 posições que o ERP mostra nos relatórios.
      desHistorico: limpa(oLinha.HISTMOVTOEXIBE) || limpa(oLinha.MEMO) || limpa(oLinha.HISTMOVTO),
      numDocumento: limpa(oLinha.DOCUMENTO),
      valMovimento: Math.abs(Number(oLinha.VALMOVTO ?? 0)),
      bEntrada: limpa(oLinha.TIPOMOVTO) === 'E',
      staConciliado: STATUS_CONCILIADO.includes(limpa(oLinha.STAMOVTO)),
      numSeqConc: limpa(oLinha.NUMSEQCONC),
      codigoLancamento: limpa(oLinha.TRNTYPE),
   };
} // mapeiaMovimento

/**
 * Lista os movimentos do extrato bancário no período.
 * @param {object} oConta Conta corrente carregada do ERP
 * @param {string} sDataInicioBr
 * @param {string} sDataFimBr
 * @returns {Promise<Array<object>>}
 */
export async function listaMovimentosPeriodo(oConta, sDataInicioBr, sDataFimBr) {
   const aLinhas = await prisma.TBCONB006.findMany({
      where: {
         ...filtroContaMovimento(oConta, 'CODCTACORRENTE'),
         DATMOVTO: {
            gte: dataBrParaData(sDataInicioBr),
            lte: dataBrParaData(sDataFimBr),
         },
      },
      select: SELECAO_MOVIMENTO,
      orderBy: [{ DATMOVTO: 'asc' }, { NUMSEQMOVTO: 'asc' }],
   });

   return aLinhas.map((oLinha) => ({ ...mapeiaMovimento(oLinha), codConta: oConta.codConta }));
} // listaMovimentosPeriodo

/**
 * Descobre a última sequência de movimento usada na conta.
 *
 * NUMSEQMOVTO é CHAR(12) com zeros à esquerda, então a ordenação alfabética
 * coincide com a numérica e MAX() serve.
 *
 * @param {object} oConta
 * @returns {Promise<number>}
 */
async function ultimaSequenciaMovimento(oConta) {
   const aLinhas = await prisma.$queryRaw`
      SELECT MAX(NUMSEQMOVTO) AS numUltimo
        FROM dbo.TBCONB006
       WHERE CODEMP = ${oConta.codEmp || codEmp()}
         AND CODBANCO = ${oConta.codBancoErp}
         AND CODAGENCIA = ${oConta.codAgencia}
         AND CODCTACORRENTE = ${oConta.numContaCorrente}`;

   return Number(limpa(aLinhas[0]?.numUltimo)) || 0;
} // ultimaSequenciaMovimento

/**
 * Grava os movimentos lidos da instituição.
 *
 * O status de conciliação NÃO é tocado no update: ele é nosso, não do banco.
 * Reconsultar um período já conciliado não pode desfazer a conciliação.
 *
 * A identidade da linha é o FITID (o código determinístico montado em
 * extratoBanco.js): já existe, atualiza; não existe, insere com a próxima
 * sequência. A sequência é calculada UMA vez e incrementada na memória —
 * consultar o MAX a cada movimento transformaria um extrato de 200 linhas em
 * 200 idas ao banco.
 *
 * @param {object} oConta
 * @param {Array<object>} aMovimentos Movimentos já normalizados
 * @returns {Promise<number>} Quantidade gravada
 */
export async function gravaMovimentos(oConta, aMovimentos) {
   if (!Array.isArray(aMovimentos) || aMovimentos.length === 0) {
      return 0;
   }

   const oFiltroConta = filtroContaMovimento(oConta, 'CODCTACORRENTE');
   let iSequencia = await ultimaSequenciaMovimento(oConta);
   let iGravados = 0;

   for (const oMovimento of aMovimentos) {
      const dtMovimento = dataBrParaData(oMovimento.datMovimento);
      if (!dtMovimento) {
         continue;
      }

      const sFitid = String(oMovimento.codFitid ?? '').slice(0, 50);
      const sHistorico = limpa(oMovimento.desHistorico) || 'Movimento bancário';
      const bEntrada = Boolean(oMovimento.bEntrada);

      const oComuns = {
         DATMOVTO: dtMovimento,
         HISTMOVTO: sHistorico.slice(0, 60),
         HISTMOVTOEXIBE: sHistorico.slice(0, 60),
         MEMO: sHistorico.slice(0, 256),
         DOCUMENTO: limpa(oMovimento.numDocumento).slice(0, 8) || null,
         VALMOVTO: Math.abs(Number(oMovimento.valMovimento) || 0),
         TIPOMOVTO: bEntrada ? 'E' : 'S',
         TRNTYPE: limpa(oMovimento.codigoLancamento).slice(0, 15) || (bEntrada ? 'CREDIT' : 'DEBIT'),
         DATATU: new Date(),
      };

      const oExistente = await prisma.TBCONB006.findFirst({
         where: { ...oFiltroConta, FITID: sFitid },
         select: { NUMSEQMOVTO: true },
      });

      if (oExistente) {
         await prisma.TBCONB006.update({
            where: {
               CODEMP_CODBANCO_CODAGENCIA_NUMSEQMOVTO_CODCTACORRENTE: {
                  ...oFiltroConta,
                  NUMSEQMOVTO: oExistente.NUMSEQMOVTO,
               },
            },
            data: oComuns,
         });
      } else {
         iSequencia += 1;
         await prisma.TBCONB006.create({
            data: {
               ...oFiltroConta,
               NUMSEQMOVTO: String(iSequencia).padStart(12, '0'),
               ...oComuns,
               FITID: sFitid,
               // Nasce não conciliado; a conciliação é ação própria
               STAMOVTO: 'N',
               DATIMPORTACAO: new Date(),
               NOMEARQUIVO: `${ORIGEM_ARQUIVO}-${oConta.slugProvider}`.slice(0, 30),
            },
         });
      }

      iGravados += 1;
   }

   return iGravados;
} // gravaMovimentos

/**
 * Relaciona os dias do período que JÁ foram consultados na instituição.
 * @param {object} oConta
 * @param {string} sDataInicioBr
 * @param {string} sDataFimBr
 * @returns {Promise<Set<string>>} Dias em AAAA-MM-DD
 */
export async function listaDiasConsultados(oConta, sDataInicioBr, sDataFimBr) {
   const aLinhas = await prisma.TBCONB008.findMany({
      where: {
         ...filtroContaMovimento(oConta, 'CODCTACORRENTE'),
         DATEXTRATO: {
            gte: dataBrParaData(sDataInicioBr),
            lte: dataBrParaData(sDataFimBr),
         },
      },
      select: { DATEXTRATO: true },
   });

   return new Set(aLinhas.map((oLinha) => dataSqlParaIso(oLinha.DATEXTRATO)));
} // listaDiasConsultados

/**
 * Marca dias como já consultados na instituição (TBCONB008).
 *
 * Gravado DEPOIS dos movimentos: se a gravação falhar no meio, o dia continua
 * pendente e a próxima busca refaz a consulta, em vez de dar o dia por coberto
 * com o extrato incompleto.
 *
 * @param {object} oConta
 * @param {string[]} aDiasIso Dias em AAAA-MM-DD
 * @param {object} [oQtdPorDia] Quantidade de movimentos por dia, se conhecida
 * @returns {Promise<number>}
 */
export async function marcaDiasConsultados(oConta, aDiasIso, oQtdPorDia = {}) {
   if (!Array.isArray(aDiasIso) || aDiasIso.length === 0) {
      return 0;
   }

   const oFiltroConta = filtroContaMovimento(oConta, 'CODCTACORRENTE');
   let iMarcados = 0;

   for (const sDia of aDiasIso) {
      const dtDia = dataIsoParaData(sDia);
      if (!dtDia) {
         continue;
      }

      const oChave = { ...oFiltroConta, DATEXTRATO: dtDia };
      const oDados = {
         DATCONSULTA: new Date(),
         QTDMOVTO: Number(oQtdPorDia[sDia] ?? 0),
         NOMPROVIDER: String(oConta.slugProvider ?? '').slice(0, 20),
      };

      await prisma.TBCONB008.upsert({
         where: { CODEMP_CODBANCO_CODAGENCIA_CODCTACORRENTE_DATEXTRATO: oChave },
         create: { ...oChave, ...oDados },
         update: oDados,
      });

      iMarcados += 1;
   }

   return iMarcados;
} // marcaDiasConsultados

/**
 * Calcula o saldo do banco acumulado antes da data inicial.
 *
 * A soma sai do servidor: trazer o extrato anterior para somar no Node
 * significaria carregar anos de movimento a cada abertura de tela.
 *
 * @param {object} oConta
 * @param {string} sDataInicioBr
 * @returns {Promise<number>}
 */
export async function calculaSaldoAnteriorBanco(oConta, sDataInicioBr) {
   const dtInicio = dataBrParaData(sDataInicioBr);
   if (!dtInicio) {
      return 0;
   }

   const aLinhas = await prisma.$queryRaw`
      SELECT COALESCE(SUM(CASE WHEN TIPOMOVTO = 'E' THEN VALMOVTO ELSE -VALMOVTO END), 0) AS valSaldo
        FROM dbo.TBCONB006
       WHERE CODEMP = ${oConta.codEmp || codEmp()}
         AND CODBANCO = ${oConta.codBancoErp}
         AND CODAGENCIA = ${oConta.codAgencia}
         AND CODCTACORRENTE = ${oConta.numContaCorrente}
         AND DATMOVTO < ${dtInicio}`;

   return Number(aLinhas[0]?.valSaldo ?? 0);
} // calculaSaldoAnteriorBanco

/**
 * Devolve a data de cada movimento informado, lida da base.
 *
 * Usada na conferência de período bloqueado: quem grava não pode aceitar a
 * data que o navegador informou.
 *
 * @param {object} oConta
 * @param {string[]} aCodMovimentos
 * @returns {Promise<Array<{ codMovimento: string, datMovimento: string }>>}
 */
export async function listaDatasMovimentos(oConta, aCodMovimentos) {
   if (!Array.isArray(aCodMovimentos) || aCodMovimentos.length === 0) {
      return [];
   }

   const aLinhas = await prisma.TBCONB006.findMany({
      where: {
         ...filtroContaMovimento(oConta, 'CODCTACORRENTE'),
         NUMSEQMOVTO: { in: aCodMovimentos.map((s) => String(s)) },
      },
      select: { NUMSEQMOVTO: true, DATMOVTO: true },
   });

   return aLinhas.map((oLinha) => ({
      codMovimento: limpa(oLinha.NUMSEQMOVTO),
      datMovimento: dataSqlParaBr(oLinha.DATMOVTO),
   }));
} // listaDatasMovimentos

/**
 * Grava o status de conciliação de um conjunto de movimentos.
 *
 * Conciliar grava STAMOVTO ('C' manual, 'A' automática) e a sequência do grupo
 * em NUMSEQCONC; estornar devolve 'N' e limpa a sequência. É a MESMA sequência
 * usada do lado do sistema — é ela que amarra os dois lados do grupo.
 *
 * @param {object} oConta
 * @param {string[]} aCodMovimentos
 * @param {boolean} bConciliado
 * @param {object} [oOpcoes]
 * @param {string} [oOpcoes.sNumSeqConc] Sequência do grupo (obrigatória ao conciliar)
 * @param {boolean} [oOpcoes.bAutomatica] Conciliação automática (item 6.1.3.5)
 * @returns {Promise<number>} Quantidade de registros atualizados
 */
export async function atualizaStatusMovimentos(oConta, aCodMovimentos, bConciliado, oOpcoes = {}) {
   if (!Array.isArray(aCodMovimentos) || aCodMovimentos.length === 0) {
      return 0;
   }

   const oResultado = await prisma.TBCONB006.updateMany({
      where: {
         ...filtroContaMovimento(oConta, 'CODCTACORRENTE'),
         NUMSEQMOVTO: { in: aCodMovimentos.map((s) => String(s)) },
      },
      data: bConciliado
         ? {
              STAMOVTO: oOpcoes.bAutomatica ? 'A' : 'C',
              NUMSEQCONC: oOpcoes.sNumSeqConc ?? null,
              DATATU: new Date(),
           }
         : { STAMOVTO: 'N', NUMSEQCONC: null, DATATU: new Date() },
   });

   return oResultado.count;
} // atualizaStatusMovimentos
