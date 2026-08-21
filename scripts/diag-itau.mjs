// ============================================================================
// diag-itau.mjs - Diagnóstico da integração Banco Itaú
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Exercita, na ordem, tudo que o provider oferece: configuração, token,
// identificação da francesa, posições disponíveis, extrato para a conciliação,
// resumo do dia e a visão completa da carteira. Cada etapa reporta o resultado
// sem interromper as seguintes, para que uma execução mostre o quadro completo.
//
// Uso: node scripts/diag-itau.mjs [agencia] [conta] [dataInicio] [dataFim]
//
// Sem argumentos, usa a agência/conta do .env e, na falta delas, o exemplo
// documentado na collection do portal (agência 1500 / conta 0001560-1).
// ============================================================================

import 'dotenv/config';
import {
   ItauProvider,
   TIPO_BAIXAS,
   TIPO_ENTRADAS,
   TIPO_LIQUIDACOES,
   formataDataItau,
   leDataPosicao,
   listaMesesReferencia,
} from '../src/providers/ItauProvider.js';

/** Agência e conta do exemplo da collection, usadas quando o .env está vazio */
const AGENCIA_EXEMPLO = '1500';
const CONTA_EXEMPLO = '0001560-1';

/**
 * Período padrão do diagnóstico.
 *
 * O sandbox do Itaú é um mock com massa fixa: /francesas devolve posições em
 * setembro/2021 independentemente do mesReferencia pedido. O padrão aponta
 * para lá, e não para o período da tela, para que o diagnóstico exercite o
 * caminho completo até a movimentação.
 */
const DATA_INICIO_PADRAO = '01/09/2021';
const DATA_FIM_PADRAO = '30/09/2021';

const oProvider = new ItauProvider();
const cfg = oProvider.getConfig();

const sAgencia = process.argv[2] || cfg.sAgencia || AGENCIA_EXEMPLO;
const sConta = process.argv[3] || cfg.sConta || CONTA_EXEMPLO;
const sDataInicio = process.argv[4] || DATA_INICIO_PADRAO;
const sDataFim = process.argv[5] || DATA_FIM_PADRAO;

/**
 * Oculta o miolo de um segredo, mostrando apenas o suficiente para conferência.
 * @param {string} sSegredo
 * @returns {string}
 */
function mascara(sSegredo) {
   if (!sSegredo) {
      return '(VAZIO)';
   }
   return `${sSegredo.slice(0, 8)}... (${sSegredo.length} chars)`;
} // mascara

console.log('\n=== CONFIGURAÇÃO ITAÚ ===');
console.log('Ambiente......:', cfg.bSandbox ? 'sandbox' : 'produção');
console.log('API URL.......:', cfg.sApiUrl);
console.log('Token URL.....:', cfg.sTokenUrl);
console.log('Francesas URL.:', cfg.sFrancesasUrl);
console.log('Client ID.....:', mascara(cfg.sClientId));
console.log('Client Secret.:', mascara(cfg.sClientSecret));
console.log('x-itau-apikey.:', mascara(cfg.sApiKey));
console.log('Agência/Conta.:', `${sAgencia} / ${sConta}`);
console.log('Período.......:', `${sDataInicio} a ${sDataFim}`);
console.log('Configurado...:', oProvider.isConfigured());

const aPendencias = oProvider.verificaConfiguracao();
if (aPendencias.length > 0) {
   console.log('\nPENDÊNCIAS:');
   aPendencias.forEach((sItem) => console.log(' -', sItem));
   process.exit(1);
}

console.log('\n=== 1. IDENTIFICAÇÃO DA FRANCESA (agência + conta + DAC) ===');
let oIdent = null;
try {
   // Método interno de propósito: é exatamente a montagem que o banco exige e
   // o que mais falha na configuração inicial (o DAC não existe no cadastro).
   oIdent = oProvider._resolveIdentificacao({
      codAgencia: sAgencia,
      numContaCorrente: sConta,
   });
   console.log('OK — agência:', oIdent.sAgencia, '| conta:', oIdent.sConta, '| DAC:', oIdent.sDac);
   console.log('     francesaId:', oIdent.sFrancesaId);
} catch (oErro) {
   console.log('FALHOU:', oErro.message);
   console.log('\nSem o francesaId não há como consultar a carteira. Encerrando.');
   process.exit(1);
}

console.log('\n=== 2. AUTENTICAÇÃO (OAuth2 client_credentials) ===');
try {
   const sToken = await oProvider.authenticate();
   console.log('OK — token:', `${sToken.slice(0, 16)}... (${sToken.length} chars)`);
} catch (oErro) {
   console.log('FALHOU:', oErro.message);
   console.log('\nSem token não há como exercitar as demais rotas. Encerrando.');
   process.exit(1);
}

console.log('\n=== 3. POSIÇÕES DISPONÍVEIS (GET /francesas) ===');
const aDatasEncontradas = [];
try {
   const aMeses = listaMesesReferencia(formataDataItau(sDataInicio), formataDataItau(sDataFim));
   console.log('Meses de referência consultados:', aMeses.join(', '));

   for (const sMesReferencia of aMeses) {
      const aPosicoes = await oProvider.listaPosicoes({
         sAgencia: oIdent.sAgencia,
         sConta: oIdent.sConta,
         sDac: oIdent.sDac,
         sMesReferencia,
      });
      console.log(`  ${sMesReferencia}: ${aPosicoes.length} posição(ões)`);
      aPosicoes.forEach((oPosicao) => {
         const sData = leDataPosicao(oPosicao);
         if (sData) {
            aDatasEncontradas.push(sData);
         }
      });
   }

   if (aDatasEncontradas.length > 0) {
      console.log('Datas com posição:', aDatasEncontradas.join(', '));
   }
} catch (oErro) {
   console.log('Indisponível:', oErro.message);
}

console.log('\n=== 4. EXTRATO PARA A CONCILIAÇÃO (só liquidações) ===');
try {
   const aMovimentos = await oProvider.fetchExtrato(sDataInicio, sDataFim, {
      codAgencia: sAgencia,
      numContaCorrente: sConta,
   });
   console.log(`OK — ${aMovimentos.length} movimento(s) no período.`);
   aMovimentos.slice(0, 5).forEach((oMov) => {
      const sSentido = oMov.valEntrada ? `+${oMov.valEntrada}` : `-${oMov.valSaida}`;
      console.log(`  ${oMov.datMovimento}  ${sSentido}  ${oMov.desHistorico}`);
   });
   if (aMovimentos.length > 5) {
      console.log(`  ... e outros ${aMovimentos.length - 5}.`);
   }
} catch (oErro) {
   console.log('Indisponível:', oErro.message);
}

// As duas últimas etapas precisam de um dia concreto; sem posição no período
// não há o que consultar.
const sDataAmostra = aDatasEncontradas[0] ?? '';

console.log('\n=== 5. RESUMO DO DIA (GET /movimentacoes-resumidas) ===');
if (!sDataAmostra) {
   console.log('Sem data com posição no período — etapa não executada.');
} else {
   try {
      const oResumo = await oProvider.consultaPosicaoResumida({
         sFrancesaId: oIdent.sFrancesaId,
         sData: sDataAmostra,
      });
      if (!oResumo) {
         console.log(`Sem resumo para ${sDataAmostra}.`);
      } else {
         const oPosicao = oResumo?.resumidaCobranca?.posicao ?? {};
         console.log('OK — data:', oPosicao.dataPosicao ?? sDataAmostra);
         console.log('     liquidações..:', JSON.stringify(oPosicao.liquidacoes ?? {}));
         console.log('     posição atual:', JSON.stringify(oPosicao.posicaoAtual ?? {}));
      }
   } catch (oErro) {
      console.log('Indisponível:', oErro.message);
      console.log('Obs.: o sandbox responde 400 "Data inválida" nesta rota para');
      console.log('      qualquer data — o mock não lê o parâmetro. Validar em homologação.');
   }
}

console.log('\n=== 6. CARTEIRA COMPLETA POR TIPO (GET /movimentacoes) ===');
if (!sDataAmostra) {
   console.log('Sem data com posição no período — etapa não executada.');
} else {
   for (const sTipo of [TIPO_ENTRADAS, TIPO_LIQUIDACOES, TIPO_BAIXAS]) {
      try {
         const aMovs = await oProvider.consultaMovimentacoes({
            sFrancesaId: oIdent.sFrancesaId,
            sData: sDataAmostra,
            sTipoMovimentacao: sTipo,
         });
         console.log(`  ${sTipo.padEnd(12)}: ${aMovs.length} registro(s)`);
      } catch (oErro) {
         console.log(`  ${sTipo.padEnd(12)}: indisponível — ${oErro.message}`);
      }
   }
   console.log('\nApenas "liquidacoes" entra no extrato: entradas e baixas movimentam');
   console.log('a carteira, não a conta corrente.');
}

console.log('\nDiagnóstico concluído.\n');
