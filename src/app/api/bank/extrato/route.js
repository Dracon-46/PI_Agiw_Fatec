// ============================================================================
// api/bank/extrato - Extrato bancário lido da API da instituição
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// A grade "Movimentos no Banco" é sempre o retorno vivo da API: o extrato não
// é copiado para o nosso MySQL. O que fica gravado localmente é apenas o
// estado que a API não sabe responder — se o movimento já foi conciliado e se
// foi removido da grade (item 6.1.3.8 — ação 4).
//
// A exceção é a importação por arquivo (item 6.1.3.3): o OFX não pode ser
// reconsultado, então aqueles movimentos ficam gravados por inteiro. A leitura
// das duas fontes está em lib/extratoBanco.js, compartilhada com o relatório
// do item 6.2 — o papel tem de imprimir exatamente o que está na tela.
//
// Sem massa falsa: se o provider não estiver configurado, o motivo volta em
// "aviso" e a grade traz apenas o que veio de arquivo.
// ============================================================================

import { NextResponse } from 'next/server';
import { buscaContaPorCodigo } from '../../../../lib/repositories/contaRepository.js';
import { ORIGEM_API, leExtratoDaConta } from '../../../../lib/extratoBanco.js';

export const dynamic = 'force-dynamic';

export { ORIGEM_API };

/**
 * Soma entradas e saídas do extrato devolvido.
 * @param {Array<object>} aMovimentos
 * @returns {{ valEntradas: number, valSaidas: number, iQuantidade: number }}
 */
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
 * GET /api/bank/extrato?conta=&dataInicio=&dataFim=
 * @param {Request} oRequisicao
 * @returns {Promise<NextResponse>}
 */
export async function GET(oRequisicao) {
   const oParams = new URL(oRequisicao.url).searchParams;
   const sCodConta = oParams.get('conta') ?? '';
   const sDataInicio = oParams.get('dataInicio') ?? '';
   const sDataFim = oParams.get('dataFim') ?? '';
   // A tela abre com somenteCache=1: mostra o que já está gravado sem esperar
   // a instituição. O botão Buscar chama sem o parâmetro e aí sim consulta.
   const bSomenteCache = oParams.get('somenteCache') === '1';

   // ---------- Validações (antes de tocar na rede ou no banco) ----------
   if (!sDataInicio || !sDataFim) {
      return NextResponse.json(
         { erro: 'Informe a data inicial e a data final do período (DD/MM/AAAA).' },
         { status: 400 }
      );
   }
   if (!sCodConta) {
      return NextResponse.json(
         { erro: 'Conta corrente não identificada. Cadastre e selecione uma conta.' },
         { status: 400 }
      );
   }

   let oConta = null;
   try {
      oConta = await buscaContaPorCodigo(sCodConta);
   } catch (oErro) {
      return NextResponse.json(
         { erro: `Falha ao ler a conta no MySQL: ${oErro.message}` },
         { status: 500 }
      );
   }

   if (!oConta) {
      return NextResponse.json(
         { erro: `Conta "${sCodConta}" não encontrada no MySQL. Cadastre a conta antes de importar.` },
         { status: 404 }
      );
   }

   try {
      const { aMovimentos, sAviso } = await leExtratoDaConta(oConta, sDataInicio, sDataFim, {
         bSomenteCache,
      });

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
         aviso: sAviso || undefined,
      });
   } catch (oErro) {
      console.error(`[api/bank/extrato] Falha na leitura (${oConta.slugProvider}):`, oErro);
      return NextResponse.json(
         { erro: `Não foi possível ler o extrato: ${oErro.message}` },
         { status: 502 }
      );
   }
} // GET
