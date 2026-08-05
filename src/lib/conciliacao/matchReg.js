// matchReg - Conciliação por subconjunto de soma - Ticket 37060

import { centavosParaReais, valorParaCentavos } from './valorUtils.js';

export function subsetSumReconstruct(aValores, nAlvo) {
  const nTam = aValores.length;
  const abDp = new Uint8Array(nAlvo + 1);
  const anParent = new Int32Array(nAlvo + 1).fill(-1);
  const anAnt = new Int32Array(nAlvo + 1).fill(-1);

  abDp[0] = 1;

  for (let i = 0; i < nTam; i++) {
    const nV = aValores[i];
    if (nV > nAlvo) continue;

    for (let s = nAlvo; s >= nV; s--) {
      if (!abDp[s] && abDp[s - nV]) {
        abDp[s] = 1;
        anParent[s] = i;
        anAnt[s] = s - nV;
      }
    }
  }

  if (!abDp[nAlvo]) return null;

  const aIndices = [];
  let s = nAlvo;
  while (s !== 0) {
    aIndices.push(anParent[s]);
    s = anAnt[s];
  }
  return aIndices.reverse();
}

export function executaConciliacao(aLancamentosCentavos, aMovimentos) {
  let aPoolIndices = aLancamentosCentavos.map((_, i) => i);
  const aResultados = [];

  for (const oMov of aMovimentos) {
    const nAlvo = oMov.nValorCentavos;
    const aValoresPool = aPoolIndices.map((i) => aLancamentosCentavos[i]);
    const aIndicesPool = subsetSumReconstruct(aValoresPool, nAlvo);

    if (aIndicesPool === null) {
      aResultados.push({
        sDtMovimento: oMov.sDtMovimento,
        sDescricao: oMov.sDescricao,
        sSinal: oMov.sSinal,
        sDocumento: oMov.sDocumento,
        sValorAlvo: centavosParaReais(nAlvo),
        bConciliado: false,
        aLancamentos: [],
      });
      continue;
    }

    const aIndicesOriginais = aIndicesPool.map((iPosPool) => aPoolIndices[iPosPool]);
    const oUsados = new Set(aIndicesOriginais);
    aPoolIndices = aPoolIndices.filter((i) => !oUsados.has(i));

    aResultados.push({
      sDtMovimento: oMov.sDtMovimento,
      sDescricao: oMov.sDescricao,
      sSinal: oMov.sSinal,
      sDocumento: oMov.sDocumento,
      sValorAlvo: centavosParaReais(nAlvo),
      bConciliado: true,
      aLancamentos: aIndicesOriginais.map((i) => ({
        nIndiceOriginal: i,
        sValor: centavosParaReais(aLancamentosCentavos[i]),
      })),
    });
  }

  return aResultados;
}

export function lancamentoParaCentavos(valEntrada, valSaida) {
  if (valEntrada && valEntrada > 0) return valorParaCentavos(valEntrada);
  if (valSaida && valSaida > 0) return valorParaCentavos(valSaida);
  return 0;
}

export function movimentoBancoParaConciliacao(mov) {
  const nValor = mov.valEntrada ?? mov.valSaida ?? 0;
  return {
    nValorCentavos: valorParaCentavos(Math.abs(nValor)),
    sDescricao: mov.desHistorico,
    sDtMovimento: mov.datMovimento,
    sSinal: mov.valEntrada ? 'C' : 'D',
    sDocumento: mov.numDocumento,
  };
}
