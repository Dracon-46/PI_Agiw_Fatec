// ============================================================================
// diag-bradesco.mjs - Diagnóstico da integração Bradesco
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Uso: node scripts/diag-bradesco.mjs [dataInicio] [dataFim]
// Exemplo: node scripts/diag-bradesco.mjs 01/09/2024 30/09/2024
// ============================================================================

import 'dotenv/config';
import { BradescoProvider } from '../src/providers/BradescoProvider.js';

const sDataInicio = process.argv[2] || '01/09/2024';
const sDataFim = process.argv[3] || '30/09/2024';

const oProvider = new BradescoProvider();
const oCfg = oProvider.getConfig();

console.log('\n=== CONFIGURAÇÃO ===');
console.log('Base URL........:', oCfg.sBaseUrl);
console.log('Token path......:', oCfg.sTokenPath);
console.log('API extrato.....:', oCfg.sApiUrl);
console.log('Client ID.......:', oCfg.sClientId ? `${oCfg.sClientId.slice(0, 6)}… (${oCfg.sClientId.length} chars)` : '(VAZIO)');
console.log('Client Secret...:', oCfg.sClientSecret ? `(${oCfg.sClientSecret.length} chars)` : '(VAZIO)');
console.log('App Key.........:', oCfg.sAppKey ? `(${oCfg.sAppKey.length} chars)` : '(VAZIO)');
console.log('Agência (.env)..:', oCfg.sAgencia || '(vazio — virá do cadastro)');
console.log('Conta (.env)....:', oCfg.sConta || '(vazio — virá do cadastro)');
console.log('Usa mTLS........:', oCfg.bUsaMtls);
console.log('isConfigured()..:', oProvider.isConfigured());

const aPendencias = oProvider.verificaConfiguracao();
if (aPendencias.length > 0) {
   console.log('\n=== PENDÊNCIAS ===');
   aPendencias.forEach((s) => console.log(' -', s));
}

console.log('\n=== AUTENTICAÇÃO ===');
try {
   const sToken = await oProvider.authenticate();
   console.log('OK — token recebido:', `${sToken.slice(0, 12)}… (${sToken.length} chars)`);
} catch (oErro) {
   console.log('FALHOU:', oErro.message);
   process.exit(1);
}

// Usa a conta cadastrada no SQL Server; se não houver, cai para o .env
let oContaTeste = { codAgencia: oCfg.sAgencia, numContaCorrente: oCfg.sConta, tipConta: 'cc' };
try {
   const { listaContasCorrentes } = await import('../src/lib/repositories/contaRepository.js');
   const aContas = await listaContasCorrentes();
   const oConta = aContas.find((o) => o.slugProvider === 'bradesco') ?? aContas[0];
   if (oConta) {
      oContaTeste = {
         codAgencia: oConta.codAgencia,
         numContaCorrente: oConta.numContaCorrente,
         tipConta: oConta.tipConta ?? 'cc',
      };
      console.log(
         '\nConta usada no teste (SQL Server):',
         `${oConta.codAgencia}/${oConta.numContaCorrente}`
      );
   }
} catch (oErro) {
   console.log('\nNão foi possível ler contas do SQL Server:', oErro.message);
}

console.log(`\n=== EXTRATO (${sDataInicio} a ${sDataFim}) ===`);
try {
   const aMovimentos = await oProvider.fetchExtrato(sDataInicio, sDataFim, oContaTeste);
   console.log('Movimentos retornados:', aMovimentos.length);
   aMovimentos.slice(0, 10).forEach((oMov) => {
      const sValor = oMov.valEntrada ? `+${oMov.valEntrada}` : `-${oMov.valSaida}`;
      console.log(` ${oMov.datMovimento}  ${String(sValor).padStart(14)}  ${oMov.desHistorico}`);
   });
} catch (oErro) {
   console.log('FALHOU:', oErro.message);
}

// Sem fechar a conexão o processo não termina: a leitura da conta acima deixa
// uma conexão aberta com o SQL Server.
const { fechaConexao } = await import('../src/lib/db.js');
await fechaConexao();
