// Utilitários de valor - Conciliação Bancária - Ticket 37060

export const ESCALA_CENTAVOS = 100;

export function limpaSeparadores(sValor) {
  if (typeof sValor !== 'string') sValor = String(sValor);
  let sLimpo = sValor.trim();
  const bTemVirgula = sLimpo.includes(',');
  const bTemPonto = sLimpo.includes('.');

  if (bTemVirgula) {
    sLimpo = sLimpo.replace(/\./g, '').replace(',', '.');
  } else if (bTemPonto) {
    const aPartes = sLimpo.split('.');
    if (aPartes.length > 1 && aPartes[aPartes.length - 1].length === 3) {
      sLimpo = sLimpo.replace(/\./g, '');
    }
  }

  const nValor = parseFloat(sLimpo);
  if (isNaN(nValor)) throw new Error(`Valor inválido: "${sValor}"`);
  return nValor;
}

export function valorParaCentavos(nValor) {
  return Math.round(nValor * ESCALA_CENTAVOS);
}

export function centavosParaReais(nCentavos) {
  return (nCentavos / ESCALA_CENTAVOS)
    .toFixed(2)
    .replace('.', ',')
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formataDataBradescoParaDDMMAAAA(sData) {
  if (!sData) return '';
  const sDigits = sData.replace(/\D/g, '');
  if (sDigits.length === 8) {
    if (sData.includes('/')) {
      const [sDia, sMes, sAno] = sData.split('/');
      return `${sDia.padStart(2, '0')}${sMes.padStart(2, '0')}${sAno}`;
    }
    if (/^\d{4}\d{2}\d{2}$/.test(sDigits)) {
      const sAno = sDigits.slice(0, 4);
      const sMes = sDigits.slice(4, 6);
      const sDia = sDigits.slice(6, 8);
      return `${sDia}${sMes}${sAno}`;
    }
  }
  throw new Error(`Data inválida: "${sData}". Use DD/MM/AAAA ou YYYYMMDD.`);
}

export function normalizaDataBradesco(sData) {
  if (!sData || sData === '0') return '';
  const sPad = sData.replace(/\D/g, '').padStart(8, '0');
  if (sPad.length !== 8) return sData;
  const sDia = sPad.slice(0, 2);
  const sMes = sPad.slice(2, 4);
  const sAno = sPad.slice(4, 8);
  if (parseInt(sAno, 10) > 31) {
    return `${sPad.slice(6, 8)}/${sPad.slice(4, 6)}/${sPad.slice(0, 4)}`;
  }
  return `${sDia}/${sMes}/${sAno}`;
}
