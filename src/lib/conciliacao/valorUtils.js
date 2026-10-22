// Utilitários de valor / data - Conciliação Bancária - Ticket 37060

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

/** Faixa de anos aceita como válida em qualquer interpretação de data */
export const ANO_MINIMO = 1900;
export const ANO_MAXIMO = 2100;

/**
 * Valida os componentes de uma data.
 * @param {number} iDia
 * @param {number} iMes
 * @param {number} iAno
 * @returns {boolean}
 */
function ehDataValida(iDia, iMes, iAno) {
  if (iAno < ANO_MINIMO || iAno > ANO_MAXIMO) return false;
  if (iMes < 1 || iMes > 12) return false;
  if (iDia < 1 || iDia > 31) return false;
  // Confere o dia real do mês (trata fevereiro e meses de 30 dias)
  const dtTeste = new Date(iAno, iMes - 1, iDia);
  return dtTeste.getDate() === iDia && dtTeste.getMonth() === iMes - 1;
}

/**
 * Interpreta 8 dígitos como data, resolvendo a ambiguidade DDMMAAAA x AAAAMMDD.
 *
 * A ordem de tentativa é DDMMAAAA primeiro, porque é o formato documentado
 * pela API Bradesco. Só recai para AAAAMMDD quando a primeira leitura produz
 * uma data impossível. Isso corrige a corrupção em datas como "20062025",
 * cujos 4 primeiros dígitos ("2006") pareciam um ano válido e faziam o valor
 * ser lido como 25/20/2006.
 *
 * @param {string} sDigits Exatamente 8 dígitos
 * @returns {{ sDia: string, sMes: string, sAno: string }|null}
 */
function interpretaOitoDigitos(sDigits) {
  const oComoDDMMAAAA = {
    sDia: sDigits.slice(0, 2),
    sMes: sDigits.slice(2, 4),
    sAno: sDigits.slice(4, 8),
  };
  if (ehDataValida(Number(oComoDDMMAAAA.sDia), Number(oComoDDMMAAAA.sMes), Number(oComoDDMMAAAA.sAno))) {
    return oComoDDMMAAAA;
  }

  const oComoAAAAMMDD = {
    sAno: sDigits.slice(0, 4),
    sMes: sDigits.slice(4, 6),
    sDia: sDigits.slice(6, 8),
  };
  if (ehDataValida(Number(oComoAAAAMMDD.sDia), Number(oComoAAAAMMDD.sMes), Number(oComoAAAAMMDD.sAno))) {
    return oComoAAAAMMDD;
  }

  return null;
}

/**
 * Separa uma data em dia/mês/ano, aceitando DD/MM/AAAA, DD-MM-AAAA,
 * AAAA-MM-DD, DDMMAAAA e AAAAMMDD.
 * @param {string} sData
 * @returns {{ sDia: string, sMes: string, sAno: string }|null}
 */
export function separaComponentesData(sData) {
  if (!sData) return null;

  const sTexto = String(sData).trim();
  if (!sTexto || /^0+$/.test(sTexto.replace(/\D/g, ''))) return null;

  // Formato ISO explícito (AAAA-MM-DD), usado pelo SQL Server e pelos inputs date
  const oIso = /^(\d{4})-(\d{2})-(\d{2})/.exec(sTexto);
  if (oIso) {
    return { sAno: oIso[1], sMes: oIso[2], sDia: oIso[3] };
  }

  // Formato brasileiro com separador (DD/MM/AAAA)
  const oBr = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/.exec(sTexto);
  if (oBr) {
    return {
      sDia: oBr[1].padStart(2, '0'),
      sMes: oBr[2].padStart(2, '0'),
      sAno: oBr[3],
    };
  }

  const sDigits = sTexto.replace(/\D/g, '');
  if (sDigits.length !== 8) return null;

  return interpretaOitoDigitos(sDigits);
}

/**
 * Converte a data da tela para o formato da API Bradesco: DDMMAAAA.
 * @param {string} sData Aceita DD/MM/AAAA, AAAA-MM-DD, DDMMAAAA ou AAAAMMDD
 * @returns {string}
 */
export function formataDataBradescoParaDDMMAAAA(sData) {
  if (!sData) {
    throw new Error('Data vazia. Use DD/MM/AAAA.');
  }

  const oPartes = separaComponentesData(sData);
  if (!oPartes) {
    throw new Error(`Data inválida: "${sData}". Use DD/MM/AAAA.`);
  }

  return `${oPartes.sDia}${oPartes.sMes}${oPartes.sAno}`;
}

/**
 * Normaliza datas vindas da API Bradesco para DD/MM/AAAA.
 * @param {string} sData
 * @returns {string} String vazia quando não for possível interpretar
 */
export function normalizaDataExibicao(sData) {
  const oPartes = separaComponentesData(sData);
  if (!oPartes) {
    return '';
  }
  return `${oPartes.sDia}/${oPartes.sMes}/${oPartes.sAno}`;
}
