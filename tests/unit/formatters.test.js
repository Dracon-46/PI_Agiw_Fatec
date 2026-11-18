import { describe, expect, it } from 'vitest';
import {
   comparaDatas,
   converteDataBrParaIso,
   converteIsoParaDataBr,
   converteTextoParaValor,
   formataMoeda,
   formataValor,
   normalizaTexto,
   somaDiasData,
   trataDataNula,
} from '../../src/utils/formatters.js';
import {
   formataDataBradescoParaDDMMAAAA,
   limpaSeparadores,
   normalizaDataExibicao,
   separaComponentesData,
} from '../../src/lib/conciliacao/valorUtils.js';

const semEspacoRigido = (sTexto) => sTexto.replace(/\s/g, ' ');

describe('formatação de valores', () => {
   it('formata moeda no padrão brasileiro', () => {
      expect(semEspacoRigido(formataMoeda(1234.5))).toBe('R$ 1.234,50');
      expect(formataValor(1234.5)).toBe('1.234,50');
      expect(formataMoeda(null)).toBe('—');
   });

   it('converte texto digitado em número', () => {
      expect(converteTextoParaValor('R$ 1.234,56')).toBe(1234.56);
      expect(converteTextoParaValor('')).toBe(0);
      expect(converteTextoParaValor(10)).toBe(10);
   });

   it('limpa separadores de milhar e decimais das APIs', () => {
      expect(limpaSeparadores('6.759,00')).toBe(6759);
      expect(limpaSeparadores('1.234')).toBe(1234);
      expect(limpaSeparadores('128847.13')).toBe(128847.13);
      expect(() => limpaSeparadores('abc')).toThrow('Valor inválido');
   });
});

describe('datas', () => {
   it('converte entre DD/MM/AAAA e ISO', () => {
      expect(converteDataBrParaIso('5/1/2026')).toBe('2026-01-05');
      expect(converteIsoParaDataBr('2026-01-05')).toBe('05/01/2026');
      expect(converteDataBrParaIso('data')).toBe('');
   });

   it('soma dias atravessando o mês e o ano', () => {
      expect(somaDiasData('31/12/2026', 1)).toBe('01/01/2027');
      expect(somaDiasData('01/03/2026', -1)).toBe('28/02/2026');
   });

   it('compara datas', () => {
      expect(comparaDatas('02/10/2026', '01/10/2026')).toBeGreaterThan(0);
      expect(comparaDatas('01/10/2026', '01/10/2026')).toBe(0);
   });

   it('trata a data nula do Delphi', () => {
      expect(trataDataNula('30/12/1899')).toBe('—');
      expect(trataDataNula('01/10/2026')).toBe('01/10/2026');
   });

   it('lê DDMMAAAA antes de AAAAMMDD (caso "20062025")', () => {
      expect(separaComponentesData('20062025')).toEqual({ sDia: '20', sMes: '06', sAno: '2025' });
      expect(separaComponentesData('20250620')).toEqual({ sAno: '2025', sMes: '06', sDia: '20' });
      expect(separaComponentesData('00000000')).toBeNull();
   });

   it('normaliza datas vindas das APIs dos bancos', () => {
      expect(normalizaDataExibicao('2026-10-01T00:00:00')).toBe('01/10/2026');
      expect(normalizaDataExibicao('1/10/2026')).toBe('01/10/2026');
      expect(formataDataBradescoParaDDMMAAAA('06/11/2024')).toBe('06112024');
      expect(() => formataDataBradescoParaDDMMAAAA('')).toThrow();
   });
});

describe('normalizaTexto', () => {
   it('remove acentos e caixa para comparação', () => {
      expect(normalizaTexto('  Conciliação  ')).toBe('conciliacao');
   });
});
