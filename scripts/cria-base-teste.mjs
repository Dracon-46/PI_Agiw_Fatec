// ============================================================================
// cria-base-teste.mjs - Base de TESTE local com dados de demonstração
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Permite rodar o módulo sem a base real do ERP Satis:
//
//   1. cria o banco informado em DB_NAME no SQL Server do .env (se não existir);
//   2. aplica database/base-teste.sql, com as 21 tabelas do ERP usadas pelo
//      módulo;
//   3. carrega dados fictícios: dois bancos (Itaú e Safra), uma conta em cada,
//      usuário TESTE com todas as permissões, catálogos, lançamentos do
//      sistema e extrato bancário de outubro/2026, com três pares já
//      conciliados e casos prontos para a conciliação automática (N:1 e 1:N).
//
// O extrato de outubro/2026 é gravado como já consultado (TBCONB008), então a
// tela funciona sem chamar a API dos bancos: as credenciais do .env de teste
// são fictícias e servem apenas para a conta aparecer como integrada.
//
// Trava de segurança: o nome do banco precisa conter "TESTE". O script nunca
// roda contra a base do ERP (BDAPRESENTACAO).
//
// Uso:
//   npm run db:teste               cria a base e carrega os dados
//   npm run db:teste -- --recriar  apaga a base de teste e cria de novo
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import sql from 'mssql';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_ESTRUTURA = path.join(__dirname, '..', 'database', 'base-teste.sql');

const sNomeBanco = (process.env.DB_NAME || '').trim();
const bRecriar = process.argv.includes('--recriar');

/** Período do extrato de demonstração (o mesmo do .env.teste.example) */
const PERIODO_INICIO = '01/10/2026';
const PERIODO_FIM = '31/10/2026';

/**
 * Configuração de conexão do mssql, igual à do módulo (src/lib/db.js).
 * @param {string} sDatabase
 * @returns {object}
 */
function configuracao(sDatabase) {
   return {
      server: process.env.DB_SERVER || 'localhost',
      port: Number(process.env.DB_PORT || 1433),
      database: sDatabase,
      user: process.env.DB_USER || 'sa',
      password: process.env.DB_PASS || '',
      options: {
         encrypt: (process.env.DB_ENCRYPT ?? 'true').trim().toLowerCase() !== 'false',
         trustServerCertificate: (process.env.DB_TRUST_SERVER_CERTIFICATE ?? 'true').trim().toLowerCase() !== 'false',
         instanceName: (process.env.DB_INSTANCE || '').trim() || undefined,
      },
      connectionTimeout: 15000,
      requestTimeout: 120000,
   };
} // configuracao

/**
 * Cria (ou recria) o banco de teste e aplica a estrutura das tabelas.
 * @returns {Promise<void>}
 */
async function criaEstrutura() {
   const oMaster = await sql.connect(configuracao('master'));
   const oExiste = await oMaster.request().input('nome', sql.NVarChar, sNomeBanco)
      .query('SELECT DB_ID(@nome) AS idBanco');
   const bExiste = oExiste.recordset[0].idBanco !== null;

   if (bExiste && bRecriar) {
      console.log(`Apagando o banco ${sNomeBanco} para recriar...`);
      await oMaster.request().query(
         `ALTER DATABASE [${sNomeBanco}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${sNomeBanco}];`
      );
   }
   if (!bExiste || bRecriar) {
      console.log(`Criando o banco ${sNomeBanco}...`);
      await oMaster.request().query(`CREATE DATABASE [${sNomeBanco}]`);
   }
   await oMaster.close();

   const oBanco = await sql.connect(configuracao(sNomeBanco));
   const oTabelas = await oBanco.request().query("SELECT COUNT(*) AS qtd FROM sys.tables WHERE name = 'TBCONB001'");
   if (oTabelas.recordset[0].qtd > 0) {
      await oBanco.close();
      throw new Error(
         `O banco ${sNomeBanco} já tem as tabelas. Para começar do zero, rode: npm run db:teste -- --recriar`
      );
   }

   console.log('Criando as tabelas do ERP usadas pelo módulo...');
   await oBanco.request().batch(fs.readFileSync(SQL_ESTRUTURA, 'utf8'));
   await oBanco.close();
} // criaEstrutura

/**
 * Carrega os dados de demonstração usando os próprios repositórios do módulo.
 * @returns {Promise<void>}
 */
async function carregaDados() {
   const { prisma, codEmp, dataBrParaData, fechaConexao } = await import('../src/lib/db.js');
   const { cadastraContaCorrente } = await import('../src/lib/repositories/contaRepository.js');
   const { gravaMovimentos, marcaDiasConsultados, listaMovimentosPeriodo, atualizaStatusMovimentos } =
      await import('../src/lib/repositories/movimentoRepository.js');
   const { listaLancamentosPeriodo, atualizaStatusLancamentos, geraProximoNumSeqConc } =
      await import('../src/lib/repositories/lancamentoRepository.js');
   const { normalizaMovimentosDoProvider, listaDiasDoPeriodo } = await import('../src/lib/extratoBanco.js');

   const sEmp = codEmp();
   const dtAgora = new Date();

   console.log('Carregando bancos, usuário e catálogos...');
   for (const [sCod, sNum, sNome] of [['000341', '341', 'Itaú Unibanco'], ['000422', '422', 'Banco Safra']]) {
      await prisma.TBGENE015.create({
         data: { CODEMP: sEmp, CODBANCO: sCod, NUMBANCO: sNum, NOMBANCO: sNome, STABANCO: 'S', DATATU: dtAgora, DATCADAST: dtAgora },
      });
   }

   const sUsuario = (process.env.USUARIO_ATUAL || 'TESTE').trim();
   await prisma.TBSENH006.create({
      data: {
         USER_ID: sUsuario, NOMUSUARIO: 'Usuário de Teste', SENHA: '', TIPUSUARIO: 'U',
         SUSPENSAO: 'N', BLOQUEIO: 'N', DEPARTAMENTO: 'Empresa Demonstração',
      },
   });
   const sSistema = (process.env.ERP_SISTEMA_ID || 'CONB').trim();
   for (const sModulo of ['CONB001', 'CONB002']) {
      await prisma.TBSENH005.create({
         data: {
            SISTEMA_ID: sSistema, CODEMP: sEmp, USER_ID: sUsuario, MODULO_ID: sModulo,
            INCLUSAO: 'S', ALTERACAO: 'S', CONSULTA: 'S', EXCLUSAO: 'S', IMPRESSAO: 'S', TIPO: 'M', CODMENU: '00001',
         },
      });
   }

   for (const [sCod, sDes] of [['DUP', 'Duplicata'], ['TED', 'Transferência eletrônica'], ['TRF', 'Tarifa bancária']]) {
      await prisma.TBGENE009.create({
         data: { CODDOCUM: sCod, DESDOCUM: sDes, DATATU: dtAgora, STADOCUM: 'S', STAUSODOSISTEMA: 'N' },
      });
   }

   const aGrupos = [['D', 'G1', 'Receitas'], ['C', 'G2', 'Despesas'], ['D', 'G3', 'Transferências'], ['C', 'G3', 'Transferências']];
   for (const [sCat, sGrupo, sDes] of aGrupos) {
      await prisma.TBFLCX001.create({ data: { CATEGORIA: sCat, CODGRUPO: sGrupo, DESGRUPO: sDes, STAGRUPO: 'S' } });
   }
   const aSubgrupos = [
      ['D', 'G1', 'S01', 'Receitas de vendas'],
      ['D', 'G1', 'S03', 'Receitas financeiras'],
      ['C', 'G2', 'S02', 'Despesas bancárias'],
      ['C', 'G2', 'S05', 'Fornecedores'],
      ['D', 'G3', 'S04', 'Transferências entre contas'],
      ['C', 'G3', 'S04', 'Transferências entre contas'],
   ];
   for (const [sCat, sGrupo, sSub, sDes] of aSubgrupos) {
      await prisma.TBFLCX002.create({ data: { CATEGORIA: sCat, CODGRUPO: sGrupo, SUBGRUPO: sSub, DESCSUBGRUPO: sDes } });
   }

   for (const [sConta, sDes] of [['1.1.1.02', 'Bancos conta movimento'], ['3.2.1.05', 'Despesas bancárias']]) {
      await prisma.TBGENE023.create({ data: { CODEMP: sEmp, CONTESTO: sConta, DESCCONTA: sDes, ACEITACC: 'S', STACONTA: 'S' } });
   }
   for (const [sCc, sDes] of [['100', 'Administrativo'], ['200', 'Comercial'], ['300', 'Financeiro']]) {
      await prisma.TBCOMP008.create({
         data: { CODEMP: sEmp, CCUSTO: sCc, DESCCUSTO: sDes, DATCADAST: dtAgora, STACCUSTO: 'S', TIPCCUSTO: 'A' },
      });
   }

   console.log('Cadastrando as contas correntes...');
   const oItau = await cadastraContaCorrente({
      slugProvider: 'itau', codAgencia: '1500', numContaCorrente: '12345-6',
      desAgencia: 'Agência Centro', valSaldoSistema: 42310.12, datUltimoBloqueio: '30/09/2026',
   });
   const oSafra = await cadastraContaCorrente({
      slugProvider: 'safra', codAgencia: '0001', numContaCorrente: '98765-4',
      desAgencia: 'Agência Paulista', valSaldoSistema: 15000, datUltimoBloqueio: '30/09/2026',
   });

   // ---------------- Lançamentos do sistema (TBCONB001) ----------------
   const SUBGRUPO_POR_SENTIDO = { E: ['D', 'G1', 'S01'], S: ['C', 'G2', 'S05'] };
   async function lanca(oConta, [sOrigem, sDoc, sData, sHist, nValor, sTipo]) {
      const [sCat, sGrupo, sSub] = SUBGRUPO_POR_SENTIDO[sTipo];
      await prisma.TBCONB001.create({
         data: {
            CODEMP: sEmp, CODDOCUM: 'DUP', NUMDOCTO: sDoc, SERIE: '', CODEMITENTE: '000001', DESDOBRO: '01',
            NUMSEQPAGTO: '01', SEQMOVTOCONB: '001', DATMOVTO: dataBrParaData(sData), DATBAIXA: dataBrParaData(sData),
            HISTMOVTO: sHist, TIPOMOVTO: sTipo, VALMOVTO: nValor, ORIGEMMOVTO: sOrigem,
            CODBANCO: oConta.codBancoErp, CODAGENCIA: oConta.codAgencia, NUMCTACORRENTE: oConta.numContaCorrente,
            CATEGORIA: sCat, CODGRUPO: sGrupo, SUBGRUPO: sSub, CTACONTRAPARTIDA: '1.1.1.02', STAMOVTO: 'N',
         },
      });
   } // lanca

   const aLancItau = [
      ['R', 'NF001201', '01/10/2026', 'Cliente Alfa Comércio Ltda', 3250.0, 'E'],
      ['R', 'NF001202', '01/10/2026', 'Cliente Beta Indústria S.A.', 1180.4, 'E'],
      ['P', 'CP000877', '02/10/2026', 'Fornecedor Gama Embalagens', 2740.15, 'S'],
      // N:1 - os três somam o PIX de 3.000,00 do extrato
      ['R', 'NF001207', '03/10/2026', 'Cliente Delta Distribuidora', 870.0, 'E'],
      ['R', 'NF001208', '03/10/2026', 'Cliente Épsilon Serviços', 1520.0, 'E'],
      ['R', 'NF001209', '03/10/2026', 'Cliente Zeta Tecnologia', 610.0, 'E'],
      ['P', 'CP000881', '05/10/2026', 'Fornecedor Eta Transportes', 960.32, 'S'],
      ['R', 'NF001215', '07/10/2026', 'Cliente Teta Alimentos', 4415.75, 'E'],
      ['P', 'CP000889', '08/10/2026', 'Fornecedor Iota Energia', 1325.6, 'S'],
      ['R', 'NF001220', '09/10/2026', 'Cliente Kappa Engenharia', 2290.0, 'E'],
      // 1:N - o banco debitou em duas parcelas
      ['P', 'CP000893', '15/10/2026', 'Fornecedor Lambda Papelaria', 450.0, 'S'],
      // sem contrapartida no banco: fica pendente
      ['R', 'NF001231', '20/10/2026', 'Cliente Mu Comércio', 5600.0, 'E'],
   ];
   const aLancSafra = [['R', 'NF001240', '12/10/2026', 'Cliente Nu Atacado', 3100.0, 'E']];

   console.log('Carregando lançamentos do sistema...');
   for (const aLinha of aLancItau) await lanca(oItau, aLinha);
   for (const aLinha of aLancSafra) await lanca(oSafra, aLinha);

   // ---------------- Extrato bancário (TBCONB006 + TBCONB008) ----------------
   const mov = (sData, sHist, sDoc, nValor, bEntrada) => ({
      datMovimento: sData, desHistorico: sHist, numDocumento: sDoc,
      valEntrada: bEntrada ? nValor : null, valSaida: bEntrada ? null : nValor,
   });
   const aMovItau = [
      mov('01/10/2026', 'LIQUIDACAO BOLETO 001201', '100231', 3250.0, true),
      mov('01/10/2026', 'LIQUIDACAO BOLETO 001202', '100232', 1180.4, true),
      mov('02/10/2026', 'PAGTO FORNECEDOR SISPAG', '100233', 2740.15, false),
      mov('03/10/2026', 'PIX RECEBIDO LOTE', '100234', 3000.0, true),
      mov('05/10/2026', 'PAGTO BOLETO TRANSPORTE', '100235', 960.32, false),
      // sem lançamento no sistema: caso do "Novo Lançamento"
      mov('06/10/2026', 'TARIFA MANUTENCAO CONTA', '100236', 58.9, false),
      mov('07/10/2026', 'LIQUIDACAO BOLETO 001215', '100237', 4415.75, true),
      mov('08/10/2026', 'DEBITO AUTOMATICO ENERGIA', '100238', 1325.6, false),
      mov('09/10/2026', 'LIQUIDACAO BOLETO 001220', '100239', 2290.0, true),
      mov('09/10/2026', 'RENDIMENTO APLIC AUTOMATICA', '100240', 12.84, true),
      mov('15/10/2026', 'PAGTO PAPELARIA PARCELA 1', '100241', 200.0, false),
      mov('15/10/2026', 'PAGTO PAPELARIA PARCELA 2', '100242', 250.0, false),
      // caso da "Transferência entre contas" para o Safra
      mov('22/10/2026', 'TED ENVIADA 422 0001', '100243', 1500.0, false),
   ];
   const aMovSafra = [
      mov('12/10/2026', 'LIQUIDACAO BOLETO 001240', '200101', 3100.0, true),
      mov('22/10/2026', 'TED RECEBIDA 341 1500', '200102', 1500.0, true),
   ];

   console.log('Carregando o extrato bancário de outubro/2026...');
   const aDias = listaDiasDoPeriodo(PERIODO_INICIO, PERIODO_FIM);
   for (const [oConta, aMov] of [[oItau, aMovItau], [oSafra, aMovSafra]]) {
      await gravaMovimentos(oConta, normalizaMovimentosDoProvider(aMov, oConta.codConta));
      await marcaDiasConsultados(oConta, aDias);
   }

   // ---------------- Três pares já conciliados no Itaú ----------------
   const aLanc = await listaLancamentosPeriodo(oItau, PERIODO_INICIO, PERIODO_FIM);
   const aMovGravados = await listaMovimentosPeriodo(oItau, PERIODO_INICIO, PERIODO_FIM);
   const aPares = [['NF001201', 'LIQUIDACAO BOLETO 001201'], ['NF001202', 'LIQUIDACAO BOLETO 001202'], ['CP000877', 'PAGTO FORNECEDOR SISPAG']];
   for (const [sDoc, sHist] of aPares) {
      const oLanc = aLanc.find((oItem) => oItem.numDocumento === sDoc);
      const oMov = aMovGravados.find((oItem) => oItem.desHistorico === sHist);
      const oOpcoes = { sNumSeqConc: await geraProximoNumSeqConc(), bAutomatica: false };
      await atualizaStatusLancamentos(oItau, [oLanc.codLancamento], true, oOpcoes);
      await atualizaStatusMovimentos(oItau, [oMov.codMovimento], true, oOpcoes);
   }

   await fechaConexao();
   console.log(
      `\nBase ${sNomeBanco} pronta: 2 contas, ${aLancItau.length + aLancSafra.length} lançamentos, ` +
         `${aMovItau.length + aMovSafra.length} movimentos (3 pares conciliados).`
   );
   console.log(`Usuário: ${sUsuario} | Período: ${PERIODO_INICIO} a ${PERIODO_FIM} | Rode: npm run dev`);
} // carregaDados

if (!/teste/i.test(sNomeBanco)) {
   console.error(
      `Recusado: DB_NAME="${sNomeBanco}". A base de teste precisa ter "TESTE" no nome ` +
         '(ex.: BDCONCILIACAO_TESTE), para nunca alterar a base do ERP.'
   );
   process.exit(1);
}

try {
   await criaEstrutura();
   await carregaDados();
} catch (oErro) {
   console.error(`\nFalha ao preparar a base de teste: ${oErro.message}`);
   process.exit(1);
}
