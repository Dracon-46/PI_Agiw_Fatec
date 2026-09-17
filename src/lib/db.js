// ============================================================================
// db.js - Cliente Prisma e borda de conversão do SQL Server
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// O módulo trabalha DENTRO do banco do ERP (BDAPRESENTACAO), sobre as tabelas
// do Satis: TBGENE015 (bancos), TBGENE016 (contas), TBCONB001 (movimento do
// sistema), TBCONB006 (extrato do banco) e os catálogos. O acesso é pelo
// Prisma Client, com o adapter mssql configurado pelas variáveis DB_* do .env.
//
// Três decisões concentradas aqui explicam o resto dos repositórios:
//
//   - o cliente é criado uma única vez e guardado em globalThis. Em
//     desenvolvimento o Next.js recarrega os módulos a cada alteração, e um
//     cliente novo por recarga esgotaria as conexões do servidor;
//   - as colunas de texto do ERP são CHAR de tamanho fixo, então todo valor
//     lido vem preenchido com espaços à direita ("237   "). `limpa()` é
//     aplicado na leitura — comparar sem isso faz "237   " !== "237";
//   - datas. O ERP guarda DATETIME; a tela e os relatórios falam DD/MM/AAAA.
//     A conversão acontece só aqui, e sempre em UTC: `dataBrParaData` monta a
//     meia-noite UTC do dia, e `dataSqlParaBr` lê os componentes em UTC. Usar
//     hora local deslocaria a data em um dia para quem está a oeste de
//     Greenwich, e o movimento do dia 1º apareceria no dia 31.
// ============================================================================

import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaClient } from '@prisma/client';
import { separaComponentesData } from './conciliacao/valorUtils.js';

/** Empresa usada quando o .env não informa outra (CODEMP) */
const CODEMP_PADRAO = '01';

/**
 * Empresa corrente do módulo.
 *
 * Todas as tabelas do ERP têm CODEMP na chave. Enquanto não há sessão do Satis
 * informando a empresa, ela vem do .env — e filtrar por ela é obrigatório, sob
 * pena de somar o movimento de duas empresas na mesma grade.
 *
 * @returns {string} Código com 2 posições
 */
export function codEmp() {
   return ((process.env.CODEMP || '').trim() || CODEMP_PADRAO).padStart(2, '0');
} // codEmp

/**
 * Monta a configuração do adapter a partir do .env.
 * @returns {object} Configuração aceita por PrismaMssql
 */
function montaConfiguracao() {
   const bEncriptar = (process.env.DB_ENCRYPT ?? 'true').trim().toLowerCase() !== 'false';
   const bConfiaCertificado =
      (process.env.DB_TRUST_SERVER_CERTIFICATE ?? 'true').trim().toLowerCase() !== 'false';

   return {
      server: process.env.DB_SERVER || 'localhost',
      port: Number(process.env.DB_PORT || 1433),
      database: process.env.DB_NAME || 'BDAPRESENTACAO',
      user: process.env.DB_USER || 'sa',
      password: process.env.DB_PASS || '',
      options: {
         // A instância local usa certificado autoassinado: sem confiar nele, o
         // handshake TLS falha antes de chegar ao login.
         encrypt: bEncriptar,
         trustServerCertificate: bConfiaCertificado,
         enableArithAbort: true,
         // Só em instância nomeada (ex.: DELL5\SQLEXPRESS); resolvida pelo
         // SQL Browser, que nesse caso decide a porta.
         instanceName: (process.env.DB_INSTANCE || '').trim() || undefined,
      },
      connectionTimeout: Number(process.env.DB_TIMEOUT || 15000),
      requestTimeout: Number(process.env.DB_REQUEST_TIMEOUT || 60000),
   };
} // montaConfiguracao

/**
 * Obtém (ou cria) o cliente Prisma.
 * @returns {import('@prisma/client').PrismaClient}
 */
export function getPrisma() {
   if (!globalThis.__oPrismaConciliacao) {
      globalThis.__oPrismaConciliacao = new PrismaClient({
         adapter: new PrismaMssql(montaConfiguracao()),
         log: ['warn', 'error'],
      });
   }

   return globalThis.__oPrismaConciliacao;
} // getPrisma

/**
 * Cliente Prisma do módulo; é este objeto que os repositórios importam.
 *
 * Instanciar não abre conexão — o adapter só conecta na primeira consulta —,
 * então importar este módulo durante o build do Next.js não custa nada.
 */
export const prisma = getPrisma();

/**
 * Encerra a conexão. Usado pelos scripts de linha de comando, para que o
 * processo termine em vez de ficar preso na conexão aberta.
 * @returns {Promise<void>}
 */
export async function fechaConexao() {
   const oPrisma = globalThis.__oPrismaConciliacao;
   globalThis.__oPrismaConciliacao = null;

   if (oPrisma) {
      await oPrisma.$disconnect();
   }
} // fechaConexao

/**
 * Remove o preenchimento das colunas CHAR do ERP.
 *
 * CHAR(6) devolve "237   ", e comparar esse valor com "237" falha. Todo campo
 * de texto lido do ERP passa por aqui antes de subir para a tela.
 *
 * @param {string|null|undefined} sValor
 * @returns {string}
 */
export function limpa(sValor) {
   return String(sValor ?? '').trim();
} // limpa

/**
 * Indica se o erro é violação de chave única.
 *
 * Substitui a conferência de `ER_DUP_ENTRY` do MySQL: o Prisma normaliza a
 * violação como P2002, seja qual for o banco.
 *
 * @param {object} oErro
 * @returns {boolean}
 */
export function ehChaveDuplicada(oErro) {
   return oErro?.code === 'P2002' || [2627, 2601].includes(Number(oErro?.number ?? 0));
} // ehChaveDuplicada

/**
 * Indica se o erro é de conexão (servidor fora do ar, host errado, login
 * recusado) e não de SQL. A tela usa isso para orientar o usuário a conferir
 * o serviço em vez de mostrar o erro cru.
 * @param {object} oErro
 * @returns {boolean}
 */
export function ehFalhaDeConexao(oErro) {
   const aCodigosPrisma = ['P1000', 'P1001', 'P1002', 'P1017'];
   const aCodigosDriver = [
      'ESOCKET',
      'ELOGIN',
      'ETIMEOUT',
      'ECONNREFUSED',
      'ECONNCLOSED',
      'EINSTLOOKUP',
   ];

   return aCodigosPrisma.includes(oErro?.code) || aCodigosDriver.includes(oErro?.code);
} // ehFalhaDeConexao

// ───────── Datas: a borda entre o DD/MM/AAAA da tela e o DATETIME do ERP ─────────

/**
 * Converte DD/MM/AAAA para AAAA-MM-DD.
 *
 * O texto ISO é o que permite comparar datas por ordem alfabética, e é assim
 * que as rotas conferem período bloqueado. Reaproveita a interpretação de
 * datas da integração bancária, que resolve a ambiguidade entre DDMMAAAA e
 * AAAAMMDD.
 *
 * @param {string} sDataBr
 * @returns {string|null} null quando a data não é interpretável
 */
export function dataBrParaSql(sDataBr) {
   const oPartes = separaComponentesData(sDataBr);
   if (!oPartes) {
      return null;
   }
   return `${oPartes.sAno}-${oPartes.sMes}-${oPartes.sDia}`;
} // dataBrParaSql

/**
 * Converte DD/MM/AAAA no objeto Date que o Prisma grava nas colunas DATETIME.
 *
 * É a meia-noite UTC do dia. O ERP guarda a data do movimento sem hora, e usar
 * a meia-noite local gravaria o dia anterior às 21h no fuso de Brasília.
 *
 * @param {string} sDataBr
 * @returns {Date|null} null quando a data não é interpretável
 */
export function dataBrParaData(sDataBr) {
   const sIso = dataBrParaSql(sDataBr);
   return sIso ? new Date(`${sIso}T00:00:00.000Z`) : null;
} // dataBrParaData

/**
 * Converte AAAA-MM-DD no objeto Date correspondente (meia-noite UTC).
 * @param {string} sDataIso
 * @returns {Date|null}
 */
export function dataIsoParaData(sDataIso) {
   const s = String(sDataIso ?? '').slice(0, 10);
   return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00.000Z`) : null;
} // dataIsoParaData

/**
 * Converte a data lida do ERP para AAAA-MM-DD.
 * @param {Date|string|null} oData
 * @returns {string}
 */
export function dataSqlParaIso(oData) {
   if (!oData) {
      return '';
   }
   if (oData instanceof Date) {
      return Number.isNaN(oData.getTime()) ? '' : oData.toISOString().slice(0, 10);
   }
   return String(oData).slice(0, 10);
} // dataSqlParaIso

/**
 * Converte a data lida do ERP para DD/MM/AAAA.
 *
 * O ERP grava 1899-12-30 no lugar de nulo em algumas colunas de data (herança
 * do TDateTime do Delphi, em que zero é essa data). A tela precisa ver isso
 * como "sem data", e não como um bloqueio no século XIX — é o caso de
 * TBGENE016.DATULTBLOQUEIO nas contas que nunca tiveram período fechado.
 *
 * @param {Date|string|null} oData
 * @returns {string} String vazia quando não há data
 */
export function dataSqlParaBr(oData) {
   const sIso = dataSqlParaIso(oData);
   if (!sIso || sIso < '1900-01-01') {
      return '';
   }

   const [sAno, sMes, sDia] = sIso.split('-');
   if (!sAno || !sMes || !sDia) {
      return '';
   }
   return `${sDia}/${sMes}/${sAno}`;
} // dataSqlParaBr
