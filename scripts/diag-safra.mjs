// ============================================================================
// diag-safra.mjs - Diagnóstico da integração Banco Safra
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Exercita, na ordem, tudo que o provider oferece: configuração, token,
// extrato de conta corrente e a API COB (consulta de boleto). Cada etapa
// reporta o resultado sem interromper as seguintes, para que uma execução
// mostre o quadro completo da integração.
//
// Uso: node scripts/diag-safra.mjs [agencia] [conta]
// ============================================================================

import 'dotenv/config';
import { SafraProvider } from '../src/providers/SafraProvider.js';

const oProvider = new SafraProvider();
const cfg = oProvider.getConfig();

const sAgencia = process.argv[2] || cfg.sAgencia;
const sConta = process.argv[3] || cfg.sConta;

console.log('\n=== CONFIGURAÇÃO SAFRA ===');
console.log('API URL.......:', cfg.sApiUrl);
console.log('Token URL.....:', cfg.sTokenUrl);
console.log('Extrato URL...:', cfg.sExtratoUrl);
console.log('Cobranças URL.:', cfg.sCobrancasUrl);
console.log('Baixa URL.....:', cfg.sBaixaUrl);
console.log('Consulta URL..:', cfg.sConsultaDetalheUrl);
console.log(
   'Client ID.....:',
   cfg.sClientId ? `${cfg.sClientId.slice(0, 8)}… (${cfg.sClientId.length} chars)` : '(VAZIO)'
);
console.log('Username......:', cfg.sUsuario || '(VAZIO)');
console.log('Password......:', cfg.sSenha ? `(${cfg.sSenha.length} chars)` : '(VAZIO)');
console.log('Agência/Conta.:', `${sAgencia || '(VAZIO)'} / ${sConta || '(VAZIO)'}`);
console.log('Configurado...:', oProvider.isConfigured());

const aPendencias = oProvider.verificaConfiguracao();
if (aPendencias.length > 0) {
   console.log('\nPENDÊNCIAS:');
   aPendencias.forEach((sItem) => console.log(' -', sItem));
   process.exit(1);
}

console.log('\n=== 1. AUTENTICAÇÃO (OAuth2 grant_type=password) ===');
let bAutenticado = false;
try {
   const sToken = await oProvider.authenticate();
   console.log('OK — token:', `${sToken.slice(0, 16)}… (${sToken.length} chars)`);
   bAutenticado = true;
} catch (oErro) {
   console.log('FALHOU:', oErro.message);
}

if (!bAutenticado) {
   console.log('\nSem token não há como exercitar as demais rotas. Encerrando.');
   process.exit(1);
}

console.log('\n=== 2. EXTRATO DE CONTA CORRENTE ===');
try {
   const aMovimentos = await oProvider.fetchExtrato('01/11/2024', '30/11/2024', {
      codAgencia: sAgencia,
      numContaCorrente: sConta,
   });
   console.log(`OK — ${aMovimentos.length} movimento(s) no período.`);
   aMovimentos.slice(0, 5).forEach((oMov) => {
      const sSentido = oMov.valEntrada ? `+${oMov.valEntrada}` : `-${oMov.valSaida}`;
      console.log(`  ${oMov.datMovimento}  ${sSentido}  ${oMov.desHistorico}`);
   });
} catch (oErro) {
   console.log('Indisponível:', oErro.message);
}

// Boleto usado nas consultas: o exemplo do manual, salvo se informado na linha
// de comando (node scripts/diag-safra.mjs <ag> <conta> <nossoNumero> <seuNumero>)
const sNumBoleto = process.argv[4] || '960058573';
const sSeuNumero = process.argv[5] || '999999';

console.log('\n=== 3. API COB — CONSULTA DE REGISTRO DE BOLETO ===');
try {
   const oBoleto = await oProvider.consultaBoleto({
      codAgencia: sAgencia,
      numConta: sConta,
      numBoleto: sNumBoleto,
      numCliente: sSeuNumero,
   });
   console.log('OK — resposta recebida:', JSON.stringify(oBoleto).slice(0, 300));
} catch (oErro) {
   console.log('Indisponível:', oErro.message);
}

console.log('\n=== 4. API COB — CONSULTA DETALHADA (situação / liquidação) ===');
try {
   const oDetalhe = await oProvider.consultaBoletoDetalhado({
      codAgencia: sAgencia,
      numConta: sConta,
      numBoleto: sNumBoleto,
      numCliente: sSeuNumero,
   });
   console.log('OK — situação:', oDetalhe.sSituacao || '(vazia)');
   console.log('     liquidado:', oDetalhe.bLiquidado, '| data:', oDetalhe.datLiquidacao || '—');
} catch (oErro) {
   console.log('Indisponível:', oErro.message);
}

console.log('\nDiagnóstico concluído.\n');
