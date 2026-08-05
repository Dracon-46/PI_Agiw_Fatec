// POST /api/conciliacao/auto-match - Auto conciliação por subconjunto de soma
// Ticket 37060

import { NextResponse } from 'next/server';
import {
  executaConciliacao,
  lancamentoParaCentavos,
  movimentoBancoParaConciliacao,
} from '../../../../lib/conciliacao/matchReg.js';

export async function POST(oReq) {
  try {
    const oCorpo = await oReq.json();
    const { lancamentos, movimentos } = oCorpo;

    if (!Array.isArray(lancamentos) || !Array.isArray(movimentos)) {
      return NextResponse.json(
        { erro: 'Corpo inválido. Envie lancamentos e movimentos.' },
        { status: 400 }
      );
    }

    const aIndicesERP = lancamentos
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => !l.staConciliado);

    const aIndicesBanco = movimentos
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => !m.staConciliado);

    const aLancamentosCentavos = aIndicesERP.map(({ l }) =>
      lancamentoParaCentavos(l.valEntrada, l.valSaida)
    );

    const aMovimentosConc = aIndicesBanco.map(({ m }) => movimentoBancoParaConciliacao(m));
    const aResultados = executaConciliacao(aLancamentosCentavos, aMovimentosConc);
    const aGrupos = [];

    aResultados.forEach((oRes, iIdxBancoPool) => {
      if (!oRes.bConciliado || oRes.aLancamentos.length === 0) return;
      const iIndexBanco = aIndicesBanco[iIdxBancoPool].i;
      const aIdxERP = oRes.aLancamentos.map(
        (oLanc) => aIndicesERP[oLanc.nIndiceOriginal].i
      );
      aGrupos.push({ aIndicesERP: aIdxERP, iIndexBanco });
    });

    const nTotalItens = aGrupos.reduce(
      (n, g) => n + g.aIndicesERP.length + 1,
      0
    );

    return NextResponse.json({
      grupos: aGrupos,
      resultados: aResultados,
      numGrupos: aGrupos.length,
      numConciliados: nTotalItens,
    });
  } catch (err) {
    const sMsg = err instanceof Error ? err.message : 'Erro desconhecido';
    return NextResponse.json({ erro: sMsg }, { status: 500 });
  }
}
