// ============================================================================
// lancamentoRepository.js - Movimento da conciliação no ERP (TBCONB001)
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// A grade "Movimentos no Sistema" é a tabela TBCONB001 do Satis — a mesma que
// o Contas a Pagar e o Contas a Receber alimentam. Quatro particularidades
// dela explicam este arquivo:
//
//   - a CHAVE é composta por oito colunas (empresa, documento, número, série,
//     emitente, desdobro, sequência de pagamento e sequência do movimento). A
//     tela precisa de uma chave só para marcar linha, então o `codLancamento`
//     que sobe para o navegador é essa chave codificada em um texto, e
//     `chaveLancamento` faz o caminho de volta;
//   - o SENTIDO do movimento é TIPOMOVTO ('E' entrada, 'S' saída), e VALMOVTO
//     é sempre positivo. A coluna SINAL (+1/-1) é CALCULADA pelo servidor a
//     partir de TIPOMOVTO — o próprio SQL Server recusa a gravação dela —,
//     então quem escreve informa apenas TIPOMOVTO, e quem soma usa SINAL;
//   - a ORIGEM do lançamento é ORIGEMMOVTO, de uma letra: P (Contas a Pagar),
//     R (Contas a Receber), C (Conciliação), T (Transferência) e M (Manual).
//     O item 6.1.3.8 — ação 4 só permite excluir o que nasceu nesta tela, ou
//     seja, C e T;
//   - a CONCILIAÇÃO é marcada em STAMOVTO ('C' manual, 'A' automática, 'N' ou
//     nulo para não conciliado) mais NUMSEQCONC, a sequência que amarra os dois
//     lados. É ela que torna o N:N possível: todos os registros do grupo, dos
//     dois lados, recebem o mesmo NUMSEQCONC.
// ============================================================================

import { codEmp, dataBrParaData, dataSqlParaBr, limpa, prisma } from '../db.js';
import { filtroContaMovimento } from './contaRepository.js';

/** Origem atribuída aos lançamentos criados dentro da própria conciliação */
export const ORIGEM_CONCILIACAO = 'Conciliação';

/** Origem dos lançamentos gerados por transferência entre contas */
export const ORIGEM_TRANSFERENCIA = 'Transferência';

/**
 * Origens nascidas dentro do módulo de conciliação.
 *
 * O item 6.1.3.8 — ação 4 permite excluir apenas o lançamento "com origem na
 * própria conciliação". Isso abrange o lançamento avulso e a transferência
 * entre contas: as duas são criadas nesta tela. Já os lançamentos vindos do
 * Contas a Pagar/Receber pertencem ao Satis e não podem ser removidos aqui.
 */
export const ORIGENS_EXCLUIVEIS = [ORIGEM_CONCILIACAO, ORIGEM_TRANSFERENCIA];

/** ORIGEMMOVTO (uma letra no ERP) para o texto exibido na grade */
const ORIGEM_POR_LETRA = {
   C: ORIGEM_CONCILIACAO,
   T: ORIGEM_TRANSFERENCIA,
   P: 'Contas a Pagar',
   R: 'Contas a Receber',
   M: 'Manual',
};

/** Texto da grade para a letra gravada em ORIGEMMOVTO */
const LETRA_POR_ORIGEM = {
   [ORIGEM_CONCILIACAO]: 'C',
   [ORIGEM_TRANSFERENCIA]: 'T',
};

/** STAMOVTO que significam "conciliado" (manual e automática) */
export const STATUS_CONCILIADO = ['C', 'A'];

/**
 * Prefixo do NUMDOCTO dos lançamentos avulsos da conciliação.
 *
 * É só a numeração, não o tipo: o NUMDOCTO fica "MC000001" e distingue o que
 * este módulo criou da numeração fiscal do ERP.
 */
const PREFIXO_DOCUMENTO = 'MC';

/** Prefixo do NUMDOCTO das transferências entre contas */
const PREFIXO_TRANSFERENCIA = 'TR';

/**
 * Tipo de documento usado na transferência entre contas.
 *
 * O ERP não tem um CODDOCUM de "transferência entre contas correntes" — quem
 * lança pela conciliação escolhe o tipo que descreve o movimento (TRF para
 * tarifa, APL para aplicação, TED para TED/DOC…). A transferência não passa
 * pela caixa de tipo de documento, então o código vem do .env; "TED" é o
 * padrão porque é o que o Satis usa para transferência eletrônica.
 *
 * @returns {string}
 */
function codDocumTransferencia() {
   return (process.env.CONB_CODDOCUM_TRANSFERENCIA || '').trim() || 'TED';
} // codDocumTransferencia

/** Separador da chave composta codificada para a tela */
const SEPARADOR_CHAVE = '|';

/** Colunas da chave primária de TBCONB001, na ordem em que são codificadas */
const COLUNAS_CHAVE = [
   'CODDOCUM',
   'NUMDOCTO',
   'SERIE',
   'CODEMITENTE',
   'DESDOBRO',
   'NUMSEQPAGTO',
   'SEQMOVTOCONB',
];

/**
 * Codifica a chave composta de TBCONB001 no código que a tela usa.
 * @param {object} oLinha Linha de TBCONB001
 * @returns {string}
 */
export function montaCodLancamento(oLinha) {
   return COLUNAS_CHAVE.map((sColuna) => limpa(oLinha[sColuna])).join(SEPARADOR_CHAVE);
} // montaCodLancamento

/**
 * Decodifica o código da tela de volta para a chave composta do ERP.
 *
 * As colunas em branco voltam como string vazia, e não como nulo: o SQL Server
 * compara CHAR ignorando espaços à direita, então "" casa com "     ".
 *
 * @param {string} sCodLancamento
 * @returns {object|null} null quando o código não tem as sete partes
 */
export function chaveLancamento(sCodLancamento) {
   const aPartes = String(sCodLancamento ?? '').split(SEPARADOR_CHAVE);
   if (aPartes.length !== COLUNAS_CHAVE.length) {
      return null;
   }

   const oChave = { CODEMP: codEmp() };
   COLUNAS_CHAVE.forEach((sColuna, iPos) => {
      oChave[sColuna] = aPartes[iPos];
   });

   return oChave;
} // chaveLancamento

/**
 * Converte a linha do ERP no objeto que a grade consome.
 * @param {object} oLinha Linha de TBCONB001
 * @returns {object}
 */
function mapeiaLancamento(oLinha) {
   const sOrigem = limpa(oLinha.ORIGEMMOVTO);
   const bTransferencia = sOrigem === 'T';

   return {
      codLancamento: montaCodLancamento(oLinha),
      codConta: '',
      datMovimento: dataSqlParaBr(oLinha.DATMOVTO),
      datCompensacao: dataSqlParaBr(oLinha.DATBAIXA),
      numDocumento: limpa(oLinha.NUMDOCTO),
      desHistorico: limpa(oLinha.HISTMOVTO),
      valMovimento: Math.abs(Number(oLinha.VALMOVTO ?? 0)),
      // TIPOMOVTO é a fonte do sentido; SINAL é derivado dele no servidor
      bEntrada: limpa(oLinha.TIPOMOVTO) !== 'S',
      tipOrigem: ORIGEM_POR_LETRA[sOrigem] ?? sOrigem,
      tipDocumento: limpa(oLinha.CODDOCUM),
      codSubgrupo: limpa(oLinha.SUBGRUPO),
      codContaContabil: limpa(oLinha.CTACONTRAPARTIDA),
      codCentroCusto: limpa(oLinha.CCUSTO),
      staConciliado: STATUS_CONCILIADO.includes(limpa(oLinha.STAMOVTO)),
      numSeqConc: limpa(oLinha.NUMSEQCONC),
      // As duas pernas de uma transferência compartilham o documento; é o que
      // as torna um par indivisível na exclusão (item 6.1.3.8 — ação 2).
      codTransferencia: bTransferencia
         ? `${limpa(oLinha.CODDOCUM)}${SEPARADOR_CHAVE}${limpa(oLinha.NUMDOCTO)}`
         : null,
   };
} // mapeiaLancamento

/** Colunas lidas nas duas consultas da grade do sistema */
const SELECAO_LANCAMENTO = {
   CODEMP: true,
   CODDOCUM: true,
   NUMDOCTO: true,
   SERIE: true,
   CODEMITENTE: true,
   DESDOBRO: true,
   NUMSEQPAGTO: true,
   SEQMOVTOCONB: true,
   DATMOVTO: true,
   DATBAIXA: true,
   HISTMOVTO: true,
   TIPOMOVTO: true,
   VALMOVTO: true,
   ORIGEMMOVTO: true,
   SUBGRUPO: true,
   CTACONTRAPARTIDA: true,
   CCUSTO: true,
   STAMOVTO: true,
   NUMSEQCONC: true,
};

/**
 * Lista lançamentos do sistema no período.
 * @param {object} oConta Conta corrente carregada do ERP
 * @param {string} sDataInicioBr
 * @param {string} sDataFimBr
 * @returns {Promise<Array<object>>}
 */
export async function listaLancamentosPeriodo(oConta, sDataInicioBr, sDataFimBr) {
   const aLinhas = await prisma.TBCONB001.findMany({
      where: {
         ...filtroContaMovimento(oConta),
         DATMOVTO: {
            gte: dataBrParaData(sDataInicioBr),
            lte: dataBrParaData(sDataFimBr),
         },
      },
      select: SELECAO_LANCAMENTO,
      orderBy: [{ DATMOVTO: 'asc' }, { NUMDOCTO: 'asc' }, { SEQMOVTOCONB: 'asc' }],
   });

   return aLinhas.map((oLinha) => ({ ...mapeiaLancamento(oLinha), codConta: oConta.codConta }));
} // listaLancamentosPeriodo

/**
 * Calcula saldo anterior (soma dos movimentos do sistema antes da data inicial).
 *
 * A soma é VALMOVTO * SINAL, direto no servidor: trazer os movimentos
 * anteriores para somar no Node significaria carregar anos de extrato a cada
 * abertura de tela.
 *
 * @param {object} oConta
 * @param {string} sDataInicioBr
 * @returns {Promise<number>}
 */
export async function calculaSaldoAnterior(oConta, sDataInicioBr) {
   const dtInicio = dataBrParaData(sDataInicioBr);
   if (!dtInicio) {
      return 0;
   }

   const aLinhas = await prisma.$queryRaw`
      SELECT COALESCE(SUM(VALMOVTO * SINAL), 0) AS valSaldo
        FROM dbo.TBCONB001
       WHERE CODEMP = ${oConta.codEmp || codEmp()}
         AND CODBANCO = ${oConta.codBancoErp}
         AND CODAGENCIA = ${oConta.codAgencia}
         AND NUMCTACORRENTE = ${oConta.numContaCorrente}
         AND DATMOVTO < ${dtInicio}`;

   return Number(aLinhas[0]?.valSaldo ?? 0);
} // calculaSaldoAnterior

/**
 * Gera o próximo NUMDOCTO de um prefixo, dentro do tipo de documento.
 *
 * NUMDOCTO é CHAR(8) e faz parte da chave. Os lançamentos do módulo usam
 * prefixo próprio (MC para o avulso, TR para a transferência), o que os
 * distingue dos documentos do ERP e mantém a sequência independente da
 * numeração fiscal.
 *
 * @param {string} sCodDocum Tipo de documento (TBGENE009.CODDOCUM)
 * @param {string} sPrefixo
 * @returns {Promise<string>} Número com 8 posições, ex.: "MC000001"
 */
async function geraProximoNumDocto(sCodDocum, sPrefixo) {
   const aLinhas = await prisma.$queryRaw`
      SELECT MAX(NUMDOCTO) AS numUltimo
        FROM dbo.TBCONB001
       WHERE CODEMP = ${codEmp()}
         AND CODDOCUM = ${sCodDocum}
         AND NUMDOCTO LIKE ${`${sPrefixo}%`}`;

   const sUltimo = limpa(aLinhas[0]?.numUltimo);
   const iSequencia = Number(sUltimo.slice(sPrefixo.length)) || 0;

   return `${sPrefixo}${String(iSequencia + 1).padStart(8 - sPrefixo.length, '0')}`;
} // geraProximoNumDocto

/**
 * Gera o código de um novo lançamento originado na conciliação.
 *
 * Mantido para compatibilidade com quem só precisa do número do documento: a
 * chave completa é montada por `insereLancamento`.
 *
 * @param {string} [sCodDocum] Tipo de documento
 * @returns {Promise<string>} Número do documento, ex.: "MC000001"
 */
export async function geraProximoCodigoLancamento(sCodDocum = PREFIXO_DOCUMENTO) {
   return geraProximoNumDocto(sCodDocum, PREFIXO_DOCUMENTO);
} // geraProximoCodigoLancamento

/**
 * Gera a próxima sequência de conciliação (NUMSEQCONC).
 *
 * É a sequência que amarra os dois lados, então tem de ser única nas DUAS
 * tabelas — TBCONB001 e TBCONB006 compartilham a numeração, e reaproveitar um
 * número juntaria grupos conciliados em momentos diferentes.
 *
 * @returns {Promise<string>} Sequência com 6 posições
 */
export async function geraProximoNumSeqConc() {
   const aLinhas = await prisma.$queryRaw`
      SELECT MAX(numSeq) AS numUltimo
        FROM (SELECT MAX(NUMSEQCONC) AS numSeq FROM dbo.TBCONB001
              UNION ALL
              SELECT MAX(NUMSEQCONC) AS numSeq FROM dbo.TBCONB006) AS ambos`;

   const iSequencia = Number(limpa(aLinhas[0]?.numUltimo)) || 0;
   return String(iSequencia + 1).padStart(6, '0');
} // geraProximoNumSeqConc

/**
 * Confere se o tipo de documento existe no cadastro do ERP.
 *
 * TBCONB001 tem chave estrangeira para TBGENE009 (FKTBCONB001_TBGENE009_01):
 * gravar um CODDOCUM que não está lá é recusado pelo banco com erro de
 * constraint, que não diz nada a quem está na tela. A conferência acontece
 * antes de qualquer gravação, como manda o padrão de programação.
 *
 * @param {string} sCodDocum
 * @param {boolean} bTransferencia Origem é transferência entre contas
 * @returns {Promise<void>}
 */
async function validaTipoDocumento(sCodDocum, bTransferencia) {
   if (!sCodDocum) {
      throw new Error('Selecione o tipo de documento do lançamento.');
   }

   const oTipo = await prisma.TBGENE009.findFirst({
      where: { CODDOCUM: sCodDocum },
      select: { CODDOCUM: true, STADOCUM: true },
   });

   if (!oTipo) {
      throw new Error(
         bTransferencia
            ? `O tipo de documento "${sCodDocum}" (CONB_CODDOCUM_TRANSFERENCIA no .env) não existe ` +
              'no cadastro de documentos do ERP (TBGENE009). Informe um código cadastrado.'
            : `O tipo de documento "${sCodDocum}" não existe no cadastro do ERP (TBGENE009).`
      );
   }

   if (limpa(oTipo.STADOCUM) !== 'S') {
      throw new Error(`O tipo de documento "${sCodDocum}" está inativo no cadastro do ERP.`);
   }
} // validaTipoDocumento

/**
 * Completa o subgrupo com a categoria e o grupo do fluxo de caixa.
 *
 * TBCONB001 guarda SUBGRUPO, CATEGORIA e CODGRUPO — as três colunas da chave
 * de TBFLCX002. A tela pergunta só o subgrupo, então as outras duas são
 * buscadas aqui; gravar o subgrupo sem elas deixaria o lançamento fora do
 * fluxo de caixa do ERP.
 *
 * @param {string} sCodSubgrupo
 * @returns {Promise<{ SUBGRUPO: string|null, CATEGORIA: string|null, CODGRUPO: string|null }>}
 */
async function completaSubgrupo(sCodSubgrupo) {
   const sSubgrupo = limpa(sCodSubgrupo);
   if (!sSubgrupo) {
      return { SUBGRUPO: null, CATEGORIA: null, CODGRUPO: null };
   }

   const oLinha = await prisma.TBFLCX002.findFirst({
      where: { SUBGRUPO: sSubgrupo },
      select: { SUBGRUPO: true, CATEGORIA: true, CODGRUPO: true },
   });

   return {
      SUBGRUPO: sSubgrupo,
      CATEGORIA: oLinha ? limpa(oLinha.CATEGORIA) : null,
      CODGRUPO: oLinha ? limpa(oLinha.CODGRUPO) : null,
   };
} // completaSubgrupo

/**
 * Insere um lançamento no movimento da conciliação (TBCONB001).
 * Corresponde à ação "Novo Lançamento" (item 6.1.3.8 — ação 1).
 *
 * @param {object} oConta Conta corrente carregada do ERP
 * @param {object} oLancamento
 * @param {string} oLancamento.datMovimento Data do movimento (DD/MM/AAAA)
 * @param {string} [oLancamento.datCompensacao] Data de compensação (DD/MM/AAAA)
 * @param {string} [oLancamento.numDocumento] Número do documento; gerado quando ausente
 * @param {string} oLancamento.desHistorico Histórico do lançamento
 * @param {number} oLancamento.valMovimento Valor absoluto
 * @param {boolean} oLancamento.bEntrada Indica entrada (crédito)
 * @param {string} [oLancamento.tipDocumento] CODDOCUM (TBGENE009)
 * @param {string} [oLancamento.codSubgrupo] SUBGRUPO (TBFLCX002)
 * @param {string} [oLancamento.codContaContabil] CTACONTRAPARTIDA (TBGENE023)
 * @param {string} [oLancamento.codCentroCusto] CCUSTO (TBCOMP008)
 * @param {string} [oLancamento.tipOrigem] Origem; padrão "Conciliação"
 * @param {string} [oLancamento.seqMovtoConb] Sequência; padrão "001"
 * @param {string} [oLancamento.seqMovtoConbRelac] Sequência da contrapartida
 * @returns {Promise<object>} Lançamento gravado, no formato da grade
 */
export async function insereLancamento(oConta, oLancamento) {
   const dtMovimento = dataBrParaData(oLancamento.datMovimento);
   if (!dtMovimento) {
      throw new Error(`Data do movimento inválida: "${oLancamento.datMovimento}". Use DD/MM/AAAA.`);
   }

   const nValor = Number(oLancamento.valMovimento);
   if (!Number.isFinite(nValor) || nValor <= 0) {
      throw new Error('O valor do lançamento deve ser maior que zero.');
   }

   const sOrigem = oLancamento.tipOrigem || ORIGEM_CONCILIACAO;
   const sLetraOrigem = LETRA_POR_ORIGEM[sOrigem] ?? 'C';
   const bTransferencia = sOrigem === ORIGEM_TRANSFERENCIA;
   const sPrefixo = bTransferencia ? PREFIXO_TRANSFERENCIA : PREFIXO_DOCUMENTO;

   // O tipo de documento NÃO tem padrão inventado: TBCONB001 tem chave
   // estrangeira para TBGENE009, e um código que não existe lá é recusado pelo
   // banco com erro de constraint. A conferência aqui troca isso por uma
   // mensagem que diz o que fazer.
   const sCodDocum = limpa(oLancamento.tipDocumento) || (bTransferencia ? codDocumTransferencia() : '');
   await validaTipoDocumento(sCodDocum, bTransferencia);

   const sNumDocto =
      limpa(oLancamento.numDocumento) || (await geraProximoNumDocto(sCodDocum, sPrefixo));
   const oSubgrupo = await completaSubgrupo(oLancamento.codSubgrupo);
   const bEntrada = Boolean(oLancamento.bEntrada);

   const oChave = {
      CODEMP: oConta.codEmp || codEmp(),
      CODDOCUM: sCodDocum,
      NUMDOCTO: sNumDocto,
      SERIE: '',
      CODEMITENTE: '',
      DESDOBRO: '00',
      NUMSEQPAGTO: '00',
      SEQMOVTOCONB: limpa(oLancamento.seqMovtoConb) || '001',
   };

   const oDados = {
      ...oChave,
      DATMOVTO: dtMovimento,
      DATBAIXA: dataBrParaData(oLancamento.datCompensacao) ?? dtMovimento,
      DTLANCTO: new Date(),
      HISTMOVTO: (oLancamento.desHistorico || 'Lançamento da conciliação').slice(0, 60),
      // VALMOVTO é sempre positivo; o sentido está em TIPOMOVTO. SINAL NÃO
      // entra: é coluna calculada a partir de TIPOMOVTO, e o SQL Server
      // recusa a instrução que tenta gravá-la.
      VALMOVTO: Math.abs(nValor),
      TIPOMOVTO: bEntrada ? 'E' : 'S',
      ORIGEMMOVTO: sLetraOrigem,
      CODBANCO: oConta.codBancoErp,
      CODAGENCIA: oConta.codAgencia,
      NUMCTACORRENTE: oConta.numContaCorrente,
      CTACONTRAPARTIDA: limpa(oLancamento.codContaContabil) || null,
      CCUSTO: limpa(oLancamento.codCentroCusto) || null,
      ...oSubgrupo,
      // Nasce não conciliado: a conciliação é ação própria (item 6.1.3.6)
      STAMOVTO: 'N',
      SEQMOVTOCONBRELAC: limpa(oLancamento.seqMovtoConbRelac) || null,
   };

   // Upsert, e não create: reenviar o mesmo documento atualiza em vez de
   // estourar a chave. STAMOVTO e NUMSEQCONC ficam FORA do update — regravar
   // um lançamento não pode desfazer conciliação já feita.
   const { STAMOVTO, ...oAtualizacao } = oDados;

   const oGravado = await prisma.TBCONB001.upsert({
      where: {
         CODEMP_CODDOCUM_NUMDOCTO_SERIE_CODEMITENTE_DESDOBRO_NUMSEQPAGTO_SEQMOVTOCONB: oChave,
      },
      create: oDados,
      update: oAtualizacao,
      select: SELECAO_LANCAMENTO,
   });

   return { ...mapeiaLancamento(oGravado), codConta: oConta.codConta };
} // insereLancamento

/**
 * Exclui um lançamento do sistema.
 *
 * Regras do item 6.1.3.8 — ação 4: não exclui registro conciliado e, na grade
 * de lançamentos, somente os originados na própria conciliação (ORIGEMMOVTO
 * C ou T).
 *
 * @param {object} oConta
 * @param {string} sCodLancamento
 * @returns {Promise<{ bExcluido: boolean, sMotivo: string }>}
 */
export async function excluiLancamento(oConta, sCodLancamento) {
   const oChave = chaveLancamento(sCodLancamento);
   if (!oChave) {
      return { bExcluido: false, sMotivo: `Código de lançamento inválido: "${sCodLancamento}".` };
   }

   const oLinha = await prisma.TBCONB001.findFirst({
      where: { ...oChave, ...filtroContaMovimento(oConta) },
      select: SELECAO_LANCAMENTO,
   });

   if (!oLinha) {
      return { bExcluido: false, sMotivo: 'Lançamento não localizado.' };
   }

   const oLancamento = mapeiaLancamento(oLinha);

   if (oLancamento.staConciliado) {
      return {
         bExcluido: false,
         sMotivo: 'Lançamento conciliado não pode ser excluído. Estorne a conciliação antes.',
      };
   }
   if (!ORIGENS_EXCLUIVEIS.includes(oLancamento.tipOrigem)) {
      return {
         bExcluido: false,
         sMotivo: `Somente lançamentos originados na conciliação podem ser excluídos (origem atual: ${oLancamento.tipOrigem}).`,
      };
   }

   // A transferência entre contas é um par indivisível: excluir só uma perna
   // deixaria o caixa da outra conta com um movimento sem contrapartida. As
   // duas pernas são o mesmo documento, em sequências diferentes.
   if (oLancamento.codTransferencia) {
      const aPernas = await prisma.TBCONB001.findMany({
         where: {
            CODEMP: oChave.CODEMP,
            CODDOCUM: oChave.CODDOCUM,
            NUMDOCTO: oChave.NUMDOCTO,
         },
         select: SELECAO_LANCAMENTO,
      });

      const oConciliada = aPernas.map(mapeiaLancamento).find((oPerna) => oPerna.staConciliado);
      if (oConciliada) {
         return {
            bExcluido: false,
            sMotivo:
               `A contrapartida desta transferência (documento ${oConciliada.numDocumento}) está conciliada. ` +
               'Estorne a conciliação das duas contas antes de excluir.',
         };
      }

      const oResultado = await prisma.TBCONB001.deleteMany({
         where: {
            CODEMP: oChave.CODEMP,
            CODDOCUM: oChave.CODDOCUM,
            NUMDOCTO: oChave.NUMDOCTO,
         },
      });

      return {
         bExcluido: true,
         sMotivo: '',
         iPernasExcluidas: oResultado.count,
         codTransferencia: oLancamento.codTransferencia,
      };
   }

   await prisma.TBCONB001.delete({
      where: {
         CODEMP_CODDOCUM_NUMDOCTO_SERIE_CODEMITENTE_DESDOBRO_NUMSEQPAGTO_SEQMOVTOCONB: oChave,
      },
   });

   return { bExcluido: true, sMotivo: '' };
} // excluiLancamento

/**
 * Gera o código que identifica as duas pernas de uma transferência.
 * @returns {Promise<string>} Código no formato "TRF|TR000001"
 */
export async function geraProximoCodigoTransferencia() {
   const sCodDocum = codDocumTransferencia();
   const sNumDocto = await geraProximoNumDocto(sCodDocum, PREFIXO_TRANSFERENCIA);
   return `${sCodDocum}${SEPARADOR_CHAVE}${sNumDocto}`;
} // geraProximoCodigoTransferencia

/**
 * Registra uma transferência entre contas, gerando simultaneamente o
 * lançamento de saída (débito) e o de entrada (crédito).
 *
 * Item 6.1.3.8 — ação 2 do documento de visão: "Abrir caixa para informar o
 * banco/agência(conta) de contrapartida do movimento e gerar tanto o
 * lançamento de débito como o de crédito."
 *
 * As duas pernas são o MESMO documento em TBCONB001, em sequências 001 e 002,
 * apontando uma para a outra em SEQMOVTOCONBRELAC — é assim que o ERP amarra
 * movimentos relacionados, e é o que permite excluir as duas juntas.
 *
 * @param {object} oTransferencia
 * @param {object} oTransferencia.oContaSaida Conta debitada
 * @param {object} oTransferencia.oContaEntrada Conta creditada
 * @param {string} oTransferencia.sDatMovimento Data (DD/MM/AAAA)
 * @param {string} [oTransferencia.sNumDocumento]
 * @param {string} oTransferencia.sDesHistorico
 * @param {number} oTransferencia.nValor Valor absoluto transferido
 * @param {string} [oTransferencia.sDesContaSaida] Identificação legível
 * @param {string} [oTransferencia.sDesContaEntrada] Identificação legível
 * @returns {Promise<{ sCodTransferencia: string, oSaida: object, oEntrada: object }>}
 */
export async function insereTransferencia(oTransferencia) {
   const sCodDocum = codDocumTransferencia();
   const sNumDocto =
      limpa(oTransferencia.sNumDocumento) ||
      (await geraProximoNumDocto(sCodDocum, PREFIXO_TRANSFERENCIA));

   const oBase = {
      datMovimento: oTransferencia.sDatMovimento,
      datCompensacao: oTransferencia.sDatMovimento,
      numDocumento: sNumDocto,
      tipDocumento: sCodDocum,
      valMovimento: Math.abs(Number(oTransferencia.nValor)),
      tipOrigem: ORIGEM_TRANSFERENCIA,
   };

   // Cada perna cita a conta oposta, para que a grade explique o movimento
   const oSaida = await insereLancamento(oTransferencia.oContaSaida, {
      ...oBase,
      desHistorico:
         `${oTransferencia.sDesHistorico} - transf. para ` +
         `${oTransferencia.sDesContaEntrada || 'conta de destino'}`,
      bEntrada: false,
      seqMovtoConb: '001',
      seqMovtoConbRelac: '002',
   });

   const oEntrada = await insereLancamento(oTransferencia.oContaEntrada, {
      ...oBase,
      desHistorico:
         `${oTransferencia.sDesHistorico} - transf. de ` +
         `${oTransferencia.sDesContaSaida || 'conta de origem'}`,
      bEntrada: true,
      seqMovtoConb: '002',
      seqMovtoConbRelac: '001',
   });

   return {
      sCodTransferencia: `${sCodDocum}${SEPARADOR_CHAVE}${sNumDocto}`,
      oSaida,
      oEntrada,
   };
} // insereTransferencia

/**
 * Datas dos lançamentos informados, lidas da base.
 *
 * A conferência do bloqueio (item 6.1.3.1) não pode confiar na data que a tela
 * envia — quem grava precisa consultar a data real do registro.
 *
 * @param {object} oConta
 * @param {string[]} aCodLancamentos
 * @returns {Promise<Array<{ codLancamento: string, datMovimento: string }>>}
 */
export async function listaDatasLancamentos(oConta, aCodLancamentos) {
   if (!Array.isArray(aCodLancamentos) || aCodLancamentos.length === 0) {
      return [];
   }

   const aChaves = aCodLancamentos.map(chaveLancamento).filter(Boolean);
   if (aChaves.length === 0) {
      return [];
   }

   const aLinhas = await prisma.TBCONB001.findMany({
      where: { ...filtroContaMovimento(oConta), OR: aChaves },
      select: SELECAO_LANCAMENTO,
   });

   return aLinhas.map((oLinha) => ({
      codLancamento: montaCodLancamento(oLinha),
      datMovimento: dataSqlParaBr(oLinha.DATMOVTO),
   }));
} // listaDatasLancamentos

/**
 * Grava o status de conciliação de um conjunto de lançamentos.
 *
 * Conciliar grava STAMOVTO ('C' manual, 'A' automática) e a sequência do grupo
 * em NUMSEQCONC; estornar devolve 'N' e limpa a sequência. É a sequência que
 * permite reconstituir depois quais registros foram conciliados juntos.
 *
 * @param {object} oConta
 * @param {string[]} aCodLancamentos
 * @param {boolean} bConciliado
 * @param {object} [oOpcoes]
 * @param {string} [oOpcoes.sNumSeqConc] Sequência do grupo (obrigatória ao conciliar)
 * @param {boolean} [oOpcoes.bAutomatica] Conciliação automática (item 6.1.3.5)
 * @returns {Promise<number>} Quantidade de registros atualizados
 */
export async function atualizaStatusLancamentos(oConta, aCodLancamentos, bConciliado, oOpcoes = {}) {
   if (!Array.isArray(aCodLancamentos) || aCodLancamentos.length === 0) {
      return 0;
   }

   const aChaves = aCodLancamentos.map(chaveLancamento).filter(Boolean);
   if (aChaves.length === 0) {
      return 0;
   }

   const oResultado = await prisma.TBCONB001.updateMany({
      where: { ...filtroContaMovimento(oConta), OR: aChaves },
      data: bConciliado
         ? {
              STAMOVTO: oOpcoes.bAutomatica ? 'A' : 'C',
              NUMSEQCONC: oOpcoes.sNumSeqConc ?? null,
           }
         : { STAMOVTO: 'N', NUMSEQCONC: null },
   });

   return oResultado.count;
} // atualizaStatusLancamentos
