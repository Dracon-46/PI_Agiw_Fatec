// ============================================================================
// api/bank/extrato - Importação do extrato bancário (API real + persistência MySQL)
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Sem massa falsa: se o provider não estiver configurado, retorna erro claro.
// Agência/conta vêm da conta cadastrada no MySQL (não só do .env).
// Datas enviadas à API Bradesco em DDMMAAAA.
// ============================================================================

import { NextResponse } from 'next/server';
import { BankProviderFactory } from '../../../../providers/BankProviderFactory.js';
import { buscaContaPorCodigo } from '../../../../lib/repositories/contaRepository.js';
import { gravaMovimentosImportados } from '../../../../lib/repositories/movimentoRepository.js';

export const dynamic = 'force-dynamic';

export const ORIGEM_API = 'API';

/**
 * Normaliza movimentos do provider para o formato da tela + MySQL.
 * @param {Array<object>} aMovimentosBrutos
 * @param {string} sCodConta
 * @returns {Array<object>}
 */
function normalizaMovimentosDoProvider(aMovimentosBrutos, sCodConta) {
   return aMovimentosBrutos.map((oMovimento, iIndice) => {
      const nEntrada = oMovimento.valEntrada ?? 0;
      const nSaida = oMovimento.valSaida ?? 0;
      const bEntrada = nEntrada > 0;
      const sDoc = oMovimento.numDocumento ?? '';
      const sData = oMovimento.datMovimento ?? '';
      const nValor = bEntrada ? nEntrada : nSaida;

      // Chave composta e determinística: o "codigoLancamento" do Bradesco
      // identifica o TIPO da transação (ex.: 03584 = rendimento) e se repete
      // entre movimentos distintos — usá-lo sozinho fazia o upsert sobrescrever
      // lançamentos diferentes, reduzindo o extrato importado.
      const sCod = [
         'API',
         sCodConta,
         sData.replace(/\D/g, ''),
         sDoc || String(iIndice),
         bEntrada ? 'E' : 'S',
         String(Math.round(nValor * 100)),
         oMovimento.codigoLancamento || '',
      ].join('-');

      return {
         codMovimento: sCod,
         codConta: sCodConta,
         datMovimento: sData,
         desHistorico: oMovimento.desHistorico,
         numDocumento: sDoc,
         valMovimento: bEntrada ? nEntrada : nSaida,
         bEntrada,
         staConciliado: false,
         codigoLancamento: oMovimento.codigoLancamento || '',
      };
   });
} // normalizaMovimentosDoProvider

function calculaResumo(aMovimentos) {
   let nEntradas = 0;
   let nSaidas = 0;

   for (const oMovimento of aMovimentos) {
      if (oMovimento.bEntrada) {
         nEntradas += oMovimento.valMovimento;
      } else {
         nSaidas += oMovimento.valMovimento;
      }
   }

   return {
      valEntradas: nEntradas,
      valSaidas: nSaidas,
      iQuantidade: aMovimentos.length,
   };
} // calculaResumo

/**
 * GET /api/bank/extrato?banco=&conta=&dataInicio=&dataFim=
 */
export async function GET(oRequisicao) {
   const oParams = new URL(oRequisicao.url).searchParams;
   const sBanco = oParams.get('banco') ?? '';
   const sCodConta = oParams.get('conta') ?? '';
   const sDataInicio = oParams.get('dataInicio') ?? '';
   const sDataFim = oParams.get('dataFim') ?? '';

   if (!sDataInicio || !sDataFim) {
      return NextResponse.json(
         { erro: 'Informe a data inicial e a data final do período (DD/MM/AAAA).' },
         { status: 400 }
      );
   }

   let oConta = null;
   try {
      oConta = sCodConta ? await buscaContaPorCodigo(sCodConta) : null;
   } catch (oErro) {
      return NextResponse.json(
         { erro: `Falha ao ler a conta no MySQL: ${oErro.message}` },
         { status: 500 }
      );
   }

   const sSlugProvider = sBanco || oConta?.slugProvider || '';

   if (!sSlugProvider) {
      return NextResponse.json(
         { erro: 'Conta corrente não identificada. Cadastre e selecione uma conta.' },
         { status: 400 }
      );
   }

   if (!oConta) {
      return NextResponse.json(
         { erro: `Conta "${sCodConta}" não encontrada no MySQL. Cadastre a conta antes de importar.` },
         { status: 404 }
      );
   }

   let oProvider = null;
   try {
      oProvider = BankProviderFactory.createProvider(sSlugProvider);
   } catch (oErro) {
      return NextResponse.json({ erro: oErro.message }, { status: 404 });
   }

   if (!oProvider.isConfigured()) {
      // Quando o provider sabe detalhar o que falta, a lista vai para a tela
      const aPendencias =
         typeof oProvider.verificaConfiguracao === 'function' ? oProvider.verificaConfiguracao() : [];

      return NextResponse.json(
         {
            erro:
               aPendencias.length > 0
                  ? `Integração com ${oProvider.getName()} incompleta: ${aPendencias.join(' ')}`
                  : `Integração com ${oProvider.getName()} não configurada. ` +
                    'Defina as credenciais e certificados no arquivo .env do servidor.',
            pendencias: aPendencias,
         },
         { status: 503 }
      );
   }

   try {
      const aMovimentosBrutos = await oProvider.fetchExtrato(sDataInicio, sDataFim, {
         codAgencia: oConta.codAgencia,
         numContaCorrente: oConta.numContaCorrente,
         tipConta: oConta.tipConta,
      });
      const aMovimentos = normalizaMovimentosDoProvider(aMovimentosBrutos, sCodConta);

      if (oConta.idConta && aMovimentos.length > 0) {
         await gravaMovimentosImportados(oConta.idConta, aMovimentos);
      }

      return NextResponse.json({
         movimentos: aMovimentos,
         resumo: calculaResumo(aMovimentos),
         periodo: { sDataInicio, sDataFim },
         origem: ORIGEM_API,
         conta: {
            codConta: oConta.codConta,
            codAgencia: oConta.codAgencia,
            numContaCorrente: oConta.numContaCorrente,
         },
      });
   } catch (oErro) {
      console.error(`[api/bank/extrato] Falha na importação (${sSlugProvider}):`, oErro);
      return NextResponse.json(
         { erro: `Não foi possível importar o extrato: ${oErro.message}` },
         { status: 502 }
      );
   }
} // GET
