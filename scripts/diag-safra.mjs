// diag-safra.mjs - Diagnóstico da integração Banco Safra
// Projeto Banco - Ticket 37060 | Agiw Sistemas
import 'dotenv/config';
import { SafraProvider } from '../src/providers/SafraProvider.js';

const oProvider = new SafraProvider();
const cfg = oProvider.getConfig();

console.log('\n=== CONFIGURAÇÃO SAFRA ===');
console.log('API URL.....:', cfg.sApiUrl);
console.log('Token URL...:', cfg.sTokenUrl);
console.log('Client ID...:', cfg.sClientId ? `${cfg.sClientId.slice(0, 8)}… (${cfg.sClientId.length} chars)` : '(VAZIO)');
console.log('Username....:', cfg.sUsuario || '(VAZIO)');
console.log('Password....:', cfg.sSenha ? `(${cfg.sSenha.length} chars)` : '(VAZIO)');
console.log('Configurado.:', oProvider.isConfigured());

const aPend = oProvider.verificaConfiguracao();
if (aPend.length) {
   console.log('\nPENDÊNCIAS:');
   aPend.forEach((s) => console.log(' -', s));
   process.exit(1);
}

console.log('\n=== AUTENTICAÇÃO ===');
try {
   const sToken = await oProvider.authenticate();
   console.log('OK — token:', `${sToken.slice(0, 16)}… (${sToken.length} chars)`);
} catch (oErro) {
   console.log('FALHOU:', oErro.message);
}

console.log('\n=== EXTRATO ===');
try {
   await oProvider.fetchExtrato('01/11/2024', '30/11/2024');
} catch (oErro) {
   console.log('Indisponível:', oErro.message);
}
