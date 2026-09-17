// ============================================================================
// api/bank/boletos - Cobrança (consulta e baixa de boleto na instituição)
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Liga a API COB do Safra à tela de conciliação. Serve à ação "Baixar Título"
// (item 6.1.3.8 — ação 3): antes de baixar o documento no sistema, o usuário
// pode conferir no banco se o boleto já foi liquidado e em que data — e,
// opcionalmente, comandar a baixa também na instituição.
//
// Nem todo provider oferece cobrança. A capacidade é detectada pela presença
// dos métodos no provider, e não por uma lista fixa de bancos: assim, quando
// outro banco ganhar a implementação, esta rota passa a atendê-lo sem
// alteração.
// ============================================================================

import { NextResponse } from 'next/server';
import { BankProviderFactory } from '../../../../providers/BankProviderFactory.js';
import { buscaContaPorCodigo } from '../../../../lib/repositories/contaRepository.js';
import {
   ACAO_LANCAMENTO_INCLUIDO,
   registraAuditoria,
} from '../../../../lib/repositories/auditoriaRepository.js';

export const dynamic = 'force-dynamic';

/**
 * Localiza a conta e o provider, validando o suporte à operação pedida.
 *
 * @param {string} sCodConta
 * @param {string} sMetodo Nome do método exigido no provider
 * @returns {Promise<{ oConta: object, oProvider: object }>}
 * @throws {Error} Com a propriedade nStatus para a rota responder
 */
async function resolveProvider(sCodConta, sMetodo) {
   const oConta = await buscaContaPorCodigo(sCodConta);
   if (!oConta) {
      const oErro = new Error(`Conta "${sCodConta}" não localizada.`);
      oErro.nStatus = 404;
      throw oErro;
   }

   const oProvider = BankProviderFactory.createProvider(oConta.slugProvider);

   if (typeof oProvider[sMetodo] !== 'function') {
      const oErro = new Error(
         `${oProvider.getName()} não oferece consulta/baixa de boleto neste módulo. ` +
            'Hoje a cobrança está disponível apenas para o Banco Safra.'
      );
      oErro.nStatus = 501;
      throw oErro;
   }

   if (!oProvider.isConfigured()) {
      const aPendencias =
         typeof oProvider.verificaConfiguracao === 'function' ? oProvider.verificaConfiguracao() : [];
      const oErro = new Error(
         `Integração com ${oProvider.getName()} incompleta: ${aPendencias.join(' ') || 'credenciais ausentes.'}`
      );
      oErro.nStatus = 503;
      throw oErro;
   }

   return { oConta, oProvider };
} // resolveProvider

/**
 * GET /api/bank/boletos?conta=&numBoleto=&seuNumero=
 * Consulta a situação do boleto na instituição.
 * @param {Request} oRequisicao
 * @returns {Promise<NextResponse>}
 */
export async function GET(oRequisicao) {
   const oParams = new URL(oRequisicao.url).searchParams;
   const sCodConta = oParams.get('conta') ?? '';
   const sNumBoleto = oParams.get('numBoleto') ?? '';
   const sSeuNumero = oParams.get('seuNumero') ?? '';

   if (!sCodConta) {
      return NextResponse.json({ erro: 'Selecione a conta corrente.' }, { status: 400 });
   }
   if (!sNumBoleto) {
      return NextResponse.json(
         { erro: 'Informe o nosso número do boleto para consultar no banco.' },
         { status: 400 }
      );
   }

   try {
      const { oConta, oProvider } = await resolveProvider(sCodConta, 'consultaBoletoDetalhado');

      const oBoleto = await oProvider.consultaBoletoDetalhado({
         codAgencia: oConta.codAgencia,
         numConta: oConta.numContaCorrente,
         numBoleto: sNumBoleto,
         numCliente: sSeuNumero,
      });

      return NextResponse.json({ boleto: oBoleto, banco: oProvider.getName() });
   } catch (oErro) {
      console.error('[api/bank/boletos] Falha na consulta:', oErro);
      return NextResponse.json({ erro: oErro.message }, { status: oErro.nStatus ?? 502 });
   }
} // GET

/**
 * POST /api/bank/boletos
 * Corpo: { conta, numBoleto, seuNumero }
 * Comanda a baixa do boleto na instituição.
 * @param {Request} oRequisicao
 * @returns {Promise<NextResponse>}
 */
export async function POST(oRequisicao) {
   let oCorpo = null;

   try {
      oCorpo = await oRequisicao.json();
   } catch {
      return NextResponse.json({ erro: 'Corpo da requisição inválido.' }, { status: 400 });
   }

   const sCodConta = String(oCorpo?.conta ?? '');
   const sNumBoleto = String(oCorpo?.numBoleto ?? '');
   const sSeuNumero = String(oCorpo?.seuNumero ?? '');

   // Validações antes de acionar a instituição
   if (!sCodConta) {
      return NextResponse.json({ erro: 'Selecione a conta corrente.' }, { status: 400 });
   }
   if (!sNumBoleto) {
      return NextResponse.json({ erro: 'Informe o nosso número do boleto.' }, { status: 400 });
   }
   if (!sSeuNumero) {
      return NextResponse.json(
         { erro: 'Informe o "seu número" do boleto — obrigatório na baixa.' },
         { status: 400 }
      );
   }

   try {
      const { oConta, oProvider } = await resolveProvider(sCodConta, 'baixaBoleto');

      const oResultado = await oProvider.baixaBoleto({
         codAgencia: oConta.codAgencia,
         numConta: oConta.numContaCorrente,
         numBoleto: sNumBoleto,
         numCliente: sSeuNumero,
      });

      await registraAuditoria({
         oConta,
         tipAcao: ACAO_LANCAMENTO_INCLUIDO,
         desEntidade: 'boleto',
         codEntidade: sNumBoleto,
         desDetalhe:
            `Baixa do boleto ${sNumBoleto} (seu número ${sSeuNumero}) comandada em ` +
            `${oProvider.getName()}.`,
      });

      return NextResponse.json({
         baixa: oResultado,
         mensagem: `Baixa do boleto ${sNumBoleto} comandada em ${oProvider.getName()}.`,
      });
   } catch (oErro) {
      console.error('[api/bank/boletos] Falha na baixa:', oErro);
      return NextResponse.json({ erro: oErro.message }, { status: oErro.nStatus ?? 502 });
   }
} // POST
