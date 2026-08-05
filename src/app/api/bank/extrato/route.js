// GET /api/bank/extrato - Busca extrato genérico via provider
// Ticket 37060 - Refatoração Strategy/Factory

import { NextResponse } from 'next/server';
import { BankProviderFactory } from '../../../../providers/BankProviderFactory.js';

function formataDataParam(sData, sPadrao) {
  if (!sData) return sPadrao;

  const sDigits = sData.replace(/\D/g, '');

  if (sDigits.length === 8 && sData.includes('/')) {
    return sData;
  }

  if (sDigits.length === 8) {
    return `${sDigits.slice(6, 8)}/${sDigits.slice(4, 6)}/${sDigits.slice(0, 4)}`;
  }

  return sData;
}

export async function GET(oReq) {
  try {
    const oParams = oReq.nextUrl.searchParams;
    const sBanco = oParams.get('banco') || BankProviderFactory.getDefaultProvider();

    console.log(`\n[API /bank/extrato] Provider: ${sBanco}`);

    const provider = BankProviderFactory.createProvider(sBanco);

    if (!provider.isConfigured()) {
      return NextResponse.json(
        {
          erro: `${provider.getName()} não está configurado. Verifique as variáveis de ambiente.`,
          banco: sBanco,
        },
        { status: 503 }
      );
    }

    const sDataInicio = formataDataParam(oParams.get('dataInicio'), '01/05/2026');
    const sDataFim = formataDataParam(oParams.get('dataFim'), '31/05/2026');

    console.log(`[API /bank/extrato] Período: ${sDataInicio} a ${sDataFim}`);

    const aMovimentos = await provider.fetchExtrato(sDataInicio, sDataFim);

    console.log(`[API /bank/extrato] ${aMovimentos.length} movimento(s) retornado(s)`);

    // Calcula resumo
    const aPendentes = aMovimentos.filter((m) => !m.staConciliado);
    const aConciliados = aMovimentos.filter((m) => m.staConciliado);
    const somaValores = (aLista) =>
      aLista.reduce((n, m) => n + (m.valEntrada ?? 0) - (m.valSaida ?? 0), 0);

    const oResumo = {
      numTotal: aMovimentos.length,
      numConciliados: aConciliados.length,
      numPendentes: aPendentes.length,
      valTotalConciliado: somaValores(aConciliados),
      valTotalPendente: Math.abs(somaValores(aPendentes)),
    };

    return NextResponse.json({
      movimentos: aMovimentos,
      resumo: oResumo,
      periodo: { dataInicio: sDataInicio, dataFim: sDataFim },
      origem: sBanco,
    });
  } catch (err) {
    console.error('[API /bank/extrato] Erro:', err.message);

    return NextResponse.json(
      {
        erro: err.message || 'Erro desconhecido',
      },
      { status: 500 }
    );
  }
}
