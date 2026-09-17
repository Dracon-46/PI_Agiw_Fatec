// ============================================================================
// contaRepository.js - Bancos e contas correntes do ERP
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Nada aqui é tabela do módulo: banco é TBGENE015 e conta corrente é
// TBGENE016, as mesmas que o Satis usa. Três consequências disso explicam o
// arquivo:
//
//   - a conta NÃO tem id inteiro. A chave é (CODEMP, CODBANCO, CODAGENCIA), e
//     é por isso que os repositórios recebem o OBJETO da conta, e não um
//     `iIdConta` — quem carrega a conta já tem a chave inteira;
//   - o cadastro exige endereço da agência (colunas NOT NULL herdadas do
//     cadastro completo do Satis). A tela do módulo pede só banco, agência e
//     conta, então o que ela não pergunta é gravado vazio, para o Satis
//     completar depois;
//   - CODBANCO é o código INTERNO do banco no ERP e NUMBANCO é o de
//     compensação ("237"). A tela fala em compensação, o banco de dados fala
//     em CODBANCO, e a conversão acontece aqui.
// ============================================================================

import { BankProviderFactory } from '../../providers/BankProviderFactory.js';
import { bancoIntegrado, compensacoesIntegradas, normalizaNumBanco } from '../../utils/bancos.js';
import { codEmp, dataBrParaData, dataSqlParaBr, ehChaveDuplicada, limpa, prisma } from '../db.js';

/** Situação de agência ativa em TBGENE016.STAGENCIA */
const AGENCIA_ATIVA = 'S';

/** Situação de banco ativo em TBGENE015.STABANCO */
const BANCO_ATIVO = 'S';

/**
 * Monta a chave da conta no ERP, no formato aceito pelo `where` do Prisma.
 *
 * Os valores vão sem preenchimento: o SQL Server compara CHAR ignorando
 * espaços à direita, então "3149" casa com "3149      ".
 *
 * @param {object} oConta Conta devolvida por este repositório
 * @returns {{ CODEMP: string, CODBANCO: string, CODAGENCIA: string }}
 */
export function chaveContaErp(oConta) {
   return {
      CODEMP: oConta.codEmp || codEmp(),
      CODBANCO: oConta.codBancoErp,
      CODAGENCIA: oConta.codAgencia,
   };
} // chaveContaErp

/**
 * Monta o filtro que identifica a conta nas tabelas de movimento.
 *
 * TBCONB001 e TBCONB006 não apontam para a chave de TBGENE016: repetem banco,
 * agência e conta corrente. TBCONB001 chama a coluna de NUMCTACORRENTE e
 * TBCONB006 de CODCTACORRENTE — o nome da coluna vai por parâmetro.
 *
 * @param {object} oConta
 * @param {string} [sColunaConta] Nome da coluna da conta corrente
 * @returns {object} Trecho de `where` do Prisma
 */
export function filtroContaMovimento(oConta, sColunaConta = 'NUMCTACORRENTE') {
   return {
      CODEMP: oConta.codEmp || codEmp(),
      CODBANCO: oConta.codBancoErp,
      CODAGENCIA: oConta.codAgencia,
      [sColunaConta]: oConta.numContaCorrente,
   };
} // filtroContaMovimento

/**
 * Gera o código lógico da conta.
 *
 * É a chave que a tela usa em toda chamada: um texto só, derivado de provider,
 * agência e conta. A chave real do ERP é composta, e trafegar as três partes
 * em cada URL só aumentaria a superfície de erro.
 *
 * @param {string} sSlug
 * @param {string} sAgencia
 * @param {string} sConta
 * @returns {string}
 */
export function montaCodConta(sSlug, sAgencia, sConta) {
   return `${sSlug}-${String(sAgencia).replace(/\s+/g, '')}-${String(sConta).replace(/\s+/g, '')}`.toLowerCase();
} // montaCodConta

/**
 * Lista o catálogo de bancos integrados, do ERP.
 *
 * Só entram os bancos que têm provider neste módulo: oferecer no cadastro um
 * banco que o sistema não sabe consultar criaria conta inútil.
 *
 * @returns {Promise<Array<object>>}
 */
export async function listaBancos() {
   const aLinhas = await prisma.TBGENE015.findMany({
      where: { CODEMP: codEmp(), STABANCO: BANCO_ATIVO },
      select: { CODBANCO: true, NUMBANCO: true, NOMBANCO: true },
      orderBy: { NOMBANCO: 'asc' },
   });

   return aLinhas
      .map((oLinha) => {
         const oIntegracao = bancoIntegrado(oLinha.NUMBANCO);
         if (!oIntegracao) {
            return null;
         }

         return {
            codBanco: normalizaNumBanco(oLinha.NUMBANCO),
            codBancoErp: limpa(oLinha.CODBANCO),
            nomBanco: limpa(oLinha.NOMBANCO),
            slugProvider: oIntegracao.sSlug,
            corBanco: oIntegracao.sCor,
            corTexto: oIntegracao.sCorTexto,
            urlLogo: oIntegracao.sLogo,
         };
      })
      .filter(Boolean);
} // listaBancos

/**
 * Monta o objeto de conta no formato da UI.
 * @param {object} oLinha Linha de TBGENE016 com o banco embutido
 * @param {Array<object>} [aProviders] Providers disponíveis
 * @param {number} [nSaldoMovimento] Soma dos movimentos do ERP na conta
 * @returns {object|null} null quando o banco não é integrado pelo módulo
 */
function mapeiaConta(oLinha, aProviders = [], nSaldoMovimento = 0) {
   const oIntegracao = bancoIntegrado(oLinha.TBGENE015?.NUMBANCO);
   if (!oIntegracao) {
      return null;
   }

   const sCodAgencia = limpa(oLinha.CODAGENCIA);
   const sNumConta = limpa(oLinha.NUMCTACORRENTE);
   const oProvider = aProviders.find((oItem) => oItem.slug === oIntegracao.sSlug);

   // A credencial é global, mas agência/conta/DAC vêm do cadastro: uma conta
   // só está pronta quando as duas pontas estão. Sem esta segunda conferência
   // o Itaú aparecia como configurado e quebrava ao buscar o extrato.
   let aPendenciasConta = [];
   if (oProvider?.configured) {
      try {
         aPendenciasConta = BankProviderFactory.createProvider(oIntegracao.sSlug).verificaConta({
            codAgencia: sCodAgencia,
            numContaCorrente: sNumConta,
            tipConta: 'cc',
         });
      } catch (oErro) {
         aPendenciasConta = [oErro.message];
      }
   }

   return {
      codConta: montaCodConta(oIntegracao.sSlug, sCodAgencia, sNumConta),
      codEmp: limpa(oLinha.CODEMP),
      codBancoErp: limpa(oLinha.CODBANCO),
      codBanco: normalizaNumBanco(oLinha.TBGENE015?.NUMBANCO),
      slugProvider: oIntegracao.sSlug,
      nomBanco: limpa(oLinha.TBGENE015?.NOMBANCO),
      codAgencia: sCodAgencia,
      numContaCorrente: sNumConta,
      digContaCorrente: limpa(oLinha.DIGCTACORRENTE),
      // TBGENE016 não distingue conta corrente de poupança; a API do Bradesco
      // exige o tipo, e conta de conciliação bancária é sempre corrente.
      tipConta: 'cc',
      desAgencia: limpa(oLinha.NOMAGENCIA),
      corBanco: oIntegracao.sCor,
      corTexto: oIntegracao.sCorTexto,
      urlLogo: oIntegracao.sLogo,
      // Saldo previsto = saldo cadastrado na conta + tudo que o ERP registrou
      // nela. SLDCTACORRENTE é um valor informado no cadastro e não acompanha
      // os movimentos, então sozinho ele congela o cartão da tela inicial.
      valSaldoSistema: Number(oLinha.SLDCTACORRENTE ?? 0) + nSaldoMovimento,
      datUltimoBloqueio: dataSqlParaBr(oLinha.DATULTBLOQUEIO),
      bIntegracaoConfigurada: Boolean(oProvider?.configured) && aPendenciasConta.length === 0,
      desPendenciaIntegracao: aPendenciasConta.join(' '),
      nomProvider: oProvider?.name ?? limpa(oLinha.TBGENE015?.NOMBANCO),
   };
} // mapeiaConta

/**
 * Soma os movimentos do ERP por conta, em uma única consulta.
 *
 * O sinal está na coluna SINAL (+1 entrada, -1 saída) de TBCONB001, então a
 * soma é SUM(VALMOVTO * SINAL) — algo que o `aggregate` do Prisma não
 * expressa. Uma consulta agrupada para todas as contas é o que evita varrer a
 * tabela uma vez por cartão da tela inicial.
 *
 * @returns {Promise<Map<string, number>>} Chave "CODBANCO|CODAGENCIA|CONTA"
 */
async function somaMovimentosPorConta() {
   const aLinhas = await prisma.$queryRaw`
      SELECT RTRIM(CODBANCO) AS codBanco,
             RTRIM(CODAGENCIA) AS codAgencia,
             RTRIM(NUMCTACORRENTE) AS numConta,
             SUM(VALMOVTO * SINAL) AS valSaldo
        FROM dbo.TBCONB001
       WHERE CODEMP = ${codEmp()}
       GROUP BY CODBANCO, CODAGENCIA, NUMCTACORRENTE`;

   return new Map(
      aLinhas.map((oLinha) => [
         `${oLinha.codBanco}|${oLinha.codAgencia}|${oLinha.numConta}`,
         Number(oLinha.valSaldo ?? 0),
      ])
   );
} // somaMovimentosPorConta

/**
 * Lista as contas correntes ativas dos bancos integrados.
 * @returns {Promise<Array<object>>}
 */
export async function listaContasCorrentes() {
   const aProviders = BankProviderFactory.getAvailableProviders();

   const [aLinhas, oSaldos] = await Promise.all([
      prisma.TBGENE016.findMany({
         where: { CODEMP: codEmp(), STAGENCIA: AGENCIA_ATIVA },
         include: { TBGENE015: { select: { NUMBANCO: true, NOMBANCO: true, STABANCO: true } } },
         orderBy: [{ CODBANCO: 'asc' }, { CODAGENCIA: 'asc' }],
      }),
      somaMovimentosPorConta(),
   ]);

   return aLinhas
      .filter((oLinha) => limpa(oLinha.TBGENE015?.STABANCO) === BANCO_ATIVO)
      .map((oLinha) => {
         const sChave = `${limpa(oLinha.CODBANCO)}|${limpa(oLinha.CODAGENCIA)}|${limpa(oLinha.NUMCTACORRENTE)}`;
         return mapeiaConta(oLinha, aProviders, oSaldos.get(sChave) ?? 0);
      })
      .filter(Boolean);
} // listaContasCorrentes

/**
 * Busca uma conta pelo código lógico.
 *
 * O cod_conta deriva de provider + agência + conta, e não existe como coluna:
 * a busca traz as contas dos bancos integrados e compara o código montado.
 * São poucas dezenas de linhas em TBGENE016 — e é essa volta que permite à
 * tela trabalhar com uma chave só.
 *
 * @param {string} sCodConta
 * @returns {Promise<object|null>}
 */
export async function buscaContaPorCodigo(sCodConta) {
   if (!sCodConta) {
      return null;
   }

   const aContas = await listaContasCorrentes();
   return aContas.find((oConta) => oConta.codConta === sCodConta) ?? null;
} // buscaContaPorCodigo

/**
 * Localiza o banco do ERP pelo slug do provider.
 * @param {string} sSlug
 * @returns {Promise<object>} Banco do catálogo
 */
async function bancoPorSlug(sSlug) {
   const aBancos = await listaBancos();
   const oBanco = aBancos.find((oItem) => oItem.slugProvider === sSlug);

   if (!oBanco) {
      throw new Error(
         `Banco "${sSlug}" não localizado em TBGENE015 (compensação ${compensacoesIntegradas().join(', ')}). ` +
            'Cadastre o banco no Satis antes de cadastrar a conta.'
      );
   }

   return oBanco;
} // bancoPorSlug

/**
 * Cadastra uma conta corrente no ERP (TBGENE016).
 *
 * As colunas de endereço da agência são NOT NULL no ERP e a tela do módulo não
 * as pergunta: entram vazias, para o cadastro completo ser feito no Satis.
 *
 * @param {object} oDados
 * @returns {Promise<object>} Conta cadastrada
 */
export async function cadastraContaCorrente(oDados) {
   const oBanco = await bancoPorSlug(oDados.slugProvider);

   const sAgencia = String(oDados.codAgencia ?? '').trim();
   const sConta = String(oDados.numContaCorrente ?? '').trim();
   if (!sAgencia || !sConta) {
      throw new Error('Informe a agência e a conta corrente.');
   }

   const dtAgora = new Date();

   try {
      await prisma.TBGENE016.create({
         data: {
            CODEMP: codEmp(),
            CODBANCO: oBanco.codBancoErp,
            CODAGENCIA: sAgencia,
            NUMCTACORRENTE: sConta,
            NOMAGENCIA: String(oDados.desAgencia ?? '').trim() || `Agencia ${sAgencia}`,
            DIGCTACORRENTE: String(oDados.digContaCorrente ?? '').trim() || null,
            SLDCTACORRENTE: Number(oDados.valSaldoSistema) || 0,
            DATULTBLOQUEIO: dataBrParaData(oDados.datUltimoBloqueio),
            STAGENCIA: AGENCIA_ATIVA,
            DATATU: dtAgora,
            DATCADAST: dtAgora,
            // Endereço da agência: completado no Satis
            ENDAGENCIA: '',
            NUMENDAGENCIA: '',
            BAIRROAGENCIA: '',
            CIDADEAGENCIA: '',
            CODUF: '',
            CEPAGENCIA: '',
            TELAGENCIA: '',
         },
      });
   } catch (oErro) {
      if (ehChaveDuplicada(oErro)) {
         throw new Error('Já existe uma conta cadastrada com este banco e agência.');
      }
      throw oErro;
   }

   return buscaContaPorCodigo(montaCodConta(oBanco.slugProvider, sAgencia, sConta));
} // cadastraContaCorrente

/**
 * Altera conta corrente, descrição, saldo e bloqueio de uma conta cadastrada.
 *
 * Banco e agência são a CHAVE PRIMÁRIA em TBGENE016, então alterá-los não é um
 * update: o ERP identifica a conta por eles, e mudar a chave deixaria os
 * movimentos de TBCONB001 e TBCONB006 apontando para uma conta que não existe
 * mais. A alteração é recusada com o motivo — o caminho é inativar a conta e
 * cadastrar a nova.
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

   const oBanco = await bancoPorSlug(oDados.slugProvider);
   const sAgencia = String(oDados.codAgencia ?? '').trim();
   const sConta = String(oDados.numContaCorrente ?? '').trim();

   if (!sAgencia || !sConta) {
      throw new Error('Informe a agência e a conta corrente.');
   }

   if (oBanco.codBancoErp !== oAtual.codBancoErp || sAgencia !== oAtual.codAgencia) {
      throw new Error(
         'Banco e agência formam a chave da conta no ERP (TBGENE016) e não podem ser alterados: ' +
            'os movimentos já gravados apontam para eles. Inative esta conta e cadastre a nova.'
      );
   }

   await prisma.TBGENE016.update({
      where: { CODEMP_CODBANCO_CODAGENCIA: chaveContaErp(oAtual) },
      data: {
         NUMCTACORRENTE: sConta,
         NOMAGENCIA: String(oDados.desAgencia ?? '').trim() || `Agencia ${sAgencia}`,
         DIGCTACORRENTE: String(oDados.digContaCorrente ?? '').trim() || null,
         SLDCTACORRENTE: Number(oDados.valSaldoSistema) || 0,
         DATULTBLOQUEIO: dataBrParaData(oDados.datUltimoBloqueio),
         DATATU: new Date(),
      },
   });

   return buscaContaPorCodigo(montaCodConta(oBanco.slugProvider, sAgencia, sConta));
} // atualizaContaCorrente

/**
 * Atualiza a data de bloqueio da conta (TBGENE016.DATULTBLOQUEIO).
 * @param {string} sCodConta
 * @param {string} sDatBloqueioBr
 * @returns {Promise<void>}
 */
export async function atualizaBloqueioConta(sCodConta, sDatBloqueioBr) {
   const oConta = await buscaContaPorCodigo(sCodConta);
   if (!oConta) {
      throw new Error(`Conta "${sCodConta}" não localizada.`);
   }

   await prisma.TBGENE016.update({
      where: { CODEMP_CODBANCO_CODAGENCIA: chaveContaErp(oConta) },
      data: {
         DATULTBLOQUEIO: dataBrParaData(sDatBloqueioBr),
         DATATU: new Date(),
      },
   });
} // atualizaBloqueioConta

/**
 * Inativa uma conta cadastrada (STAGENCIA = 'N').
 *
 * Exclusão lógica, como no ERP: a conta sai da tela, e os movimentos de
 * TBCONB001 e TBCONB006 continuam apontando para uma linha que existe.
 *
 * @param {string} sCodConta
 * @returns {Promise<boolean>}
 */
export async function inativaConta(sCodConta) {
   const oConta = await buscaContaPorCodigo(sCodConta);
   if (!oConta) {
      return false;
   }

   await prisma.TBGENE016.update({
      where: { CODEMP_CODBANCO_CODAGENCIA: chaveContaErp(oConta) },
      data: { STAGENCIA: 'N', DATATU: new Date() },
   });

   return true;
} // inativaConta
