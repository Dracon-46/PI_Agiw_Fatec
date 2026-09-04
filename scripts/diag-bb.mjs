// ============================================================================
// diag-bb.mjs - Diagnóstico da integração Banco do Brasil
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Exercita, na ordem, tudo que o provider oferece: configuração, token e
// extrato de conta corrente. Cada etapa reporta o resultado sem interromper as
// seguintes, para que uma execução mostre o quadro completo.
//
// Uso: node scripts/diag-bb.mjs [agencia] [conta] [dataInicio] [dataFim]
//
// Sem argumentos, usa a agência/conta do .env e, na falta delas, o exemplo
// documentado para homologação (agência 1505 / conta 1348).
// ============================================================================

import dotenv from 'dotenv';
import { BancoBrasilProvider, MAX_DIAS_PERIODO } from '../src/providers/BancoBrasilProvider.js';

dotenv.config();

const oProvider = new BancoBrasilProvider();
const cfg = oProvider.getConfig();

const sAgencia = process.argv[2] || cfg.sAgencia || '1505';
const sConta = process.argv[3] || cfg.sConta || '1348';

/**
 * Monta um período padrão de 30 dias terminando ontem, dentro do limite da API.
 * @returns {{ sDataInicio: string, sDataFim: string }}
 */
function periodoPadrao() {
   const dtFim = new Date();
   dtFim.setDate(dtFim.getDate() - 1);
   const dtInicio = new Date(dtFim);
   dtInicio.setDate(dtInicio.getDate() - (MAX_DIAS_PERIODO - 1));

   const formata = (dt) =>
      `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;

   return { sDataInicio: formata(dtInicio), sDataFim: formata(dtFim) };
}

const oPeriodo = periodoPadrao();
const sDataInicio = process.argv[4] || oPeriodo.sDataInicio;
const sDataFim = process.argv[5] || oPeriodo.sDataFim;

/**
 * Exibe o valor de uma credencial sem revelá-la por inteiro.
 * @param {string} sValor
 * @returns {string}
 */
function mascara(sValor) {
   return sValor ? `${sValor.slice(0, 8)}… (${sValor.length} chars)` : '(VAZIO)';
}

console.log('\n=== CONFIGURAÇÃO BANCO DO BRASIL ===');
console.log('Ambiente......:', cfg.bProducao ? 'produção' : 'homologação');
console.log('Token URL.....:', cfg.sTokenUrl);
console.log('Extrato URL...:', cfg.sExtratoUrl);
console.log('Client ID.....:', mascara(cfg.sClientId));
console.log('Client Secret.:', mascara(cfg.sClientSecret));
console.log('Basic.........:', mascara(cfg.sBasic));
console.log('App Key.......:', mascara(cfg.sAppKey));
console.log('Agência/Conta.:', `${sAgencia} / ${sConta}`);
console.log('Certificado...:', cfg.sCertPath || '(VAZIO — a API exige mTLS)');
console.log('Chave.........:', cfg.sKeyPath || '(VAZIO — a API exige mTLS)');
console.log('Período.......:', `${sDataInicio} a ${sDataFim}`);
console.log('Configurado...:', oProvider.isConfigured());

const aPendencias = oProvider.verificaConfiguracao();
if (aPendencias.length > 0) {
   console.log('\n=== PENDÊNCIAS DE CONFIGURAÇÃO ===');
   aPendencias.forEach((sPendencia) => console.log(' -', sPendencia));
}

// ---------------------------------------------------------------------------
// 1. Autenticação — não exige mTLS, então roda mesmo sem certificado
// ---------------------------------------------------------------------------
console.log('\n=== 1. AUTENTICAÇÃO (OAuth2 client_credentials) ===');
let bTokenOk = false;
try {
   const sToken = await oProvider.authenticate();
   bTokenOk = true;
   console.log(`OK — token: ${sToken.slice(0, 16)}… (${sToken.length} chars)`);
} catch (oErro) {
   console.log('FALHOU —', oErro.message);
}

// ---------------------------------------------------------------------------
// 2. Extrato — exige mTLS; sem certificado a conexão cai no handshake
// ---------------------------------------------------------------------------
console.log('\n=== 2. EXTRATO DE CONTA CORRENTE ===');
try {
   const aMovimentos = await oProvider.fetchExtrato(sDataInicio, sDataFim, {
      codAgencia: sAgencia,
      numContaCorrente: sConta,
   });

   console.log(`OK — ${aMovimentos.length} movimento(s) no período.`);
   aMovimentos.slice(0, 10).forEach((oMovimento) => {
      const sSinal = oMovimento.valEntrada ? '+' : '-';
      const nValor = oMovimento.valEntrada ?? oMovimento.valSaida;
      console.log(
         `  ${oMovimento.datMovimento}  ${sSinal}${nValor}  ${oMovimento.desHistorico}` +
            (oMovimento.idTransacao ? `  [${oMovimento.idTransacao.slice(0, 20)}…]` : '')
      );
   });
   if (aMovimentos.length > 10) {
      console.log(`  … e mais ${aMovimentos.length - 10}.`);
   }
} catch (oErro) {
   console.log('FALHOU —', oErro.message);
   if (!bTokenOk) {
      console.log('Obs.: a falha no token derruba esta etapa; corrija a autenticação primeiro.');
   }
}

console.log('\nDiagnóstico concluído.');
