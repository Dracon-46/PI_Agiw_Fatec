import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_DIAS_PERIODO, calculaPeriodoInicial, excedePeriodoMaximo } from '../../src/hooks/useConciliacao.js';
import { normalizaRateio, somaRateio, validaRateio } from '../../src/utils/rateio.js';
import {
   chaveSubgrupo,
   localizaSubgrupo,
   sentidoDaCategoria,
   subgrupoAtendeSentido,
   trocaSubgrupoPorSentido,
} from '../../src/utils/subgrupos.js';
import { bancoIntegrado, compensacoesIntegradas, normalizaNumBanco } from '../../src/utils/bancos.js';

describe('período da tela (item 6.1.3.2)', () => {
   afterEach(() => vi.useRealTimers());

   it('vai do bloqueio + 1 até ontem', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 10, 18, 10, 0, 0));

      expect(calculaPeriodoInicial('31/10/2026')).toEqual({ sDataInicio: '01/11/2026', sDataFim: '17/11/2026' });
   });

   it('usa os últimos 30 dias quando não há bloqueio', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 10, 18, 10, 0, 0));

      expect(calculaPeriodoInicial('')).toEqual({ sDataInicio: '18/10/2026', sDataFim: '17/11/2026' });
   });

   it('não abre período invertido quando o bloqueio está no futuro', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 10, 18, 10, 0, 0));

      const oPeriodo = calculaPeriodoInicial('30/12/2026');
      expect(oPeriodo.sDataInicio).toBe(oPeriodo.sDataFim);
   });

   it(`recusa buscas com mais de ${MAX_DIAS_PERIODO} dias`, () => {
      expect(excedePeriodoMaximo('01/01/2026', '01/03/2026')).toBe(false);
      expect(excedePeriodoMaximo('01/01/2026', '02/03/2026')).toBe(true);
   });
});

describe('rateio por centro de custo', () => {
   it('descarta linhas vazias e converte valores', () => {
      expect(normalizaRateio([{ codCentroCusto: ' 100 ', valRateio: '10.5' }, {}])).toEqual([
         { codCentroCusto: '100', valRateio: 10.5 },
      ]);
   });

   it('soma em centavos', () => {
      expect(somaRateio([{ valRateio: 0.1 }, { valRateio: 0.2 }])).toBe(0.3);
   });

   it('exige que o rateio feche o valor do lançamento', () => {
      expect(validaRateio([], 100)).toBe('');
      expect(validaRateio([{ codCentroCusto: '100', valRateio: 60 }, { codCentroCusto: '200', valRateio: 40 }], 100)).toBe('');
      expect(validaRateio([{ codCentroCusto: '100', valRateio: 60 }], 100)).toContain('diferença de 40.00');
   });

   it('recusa centro de custo repetido, vazio ou valor zerado', () => {
      expect(validaRateio([{ codCentroCusto: '', valRateio: 10 }], 10)).toContain('Informe o centro de custo');
      expect(validaRateio([{ codCentroCusto: '100', valRateio: 0 }], 10)).toContain('maior que zero');
      expect(
         validaRateio([{ codCentroCusto: '100', valRateio: 5 }, { codCentroCusto: '100', valRateio: 5 }], 10)
      ).toContain('mais de uma vez');
   });
});

describe('subgrupo e tipo de movimento (ata de 24/09/2026)', () => {
   const aSubgrupos = [
      { codSubgrupo: 'S01', categoria: 'D', desSubgrupo: 'Vendas' },
      { codSubgrupo: 'S01', categoria: 'C', desSubgrupo: 'Vendas (estorno)' },
      { codSubgrupo: 'S02', categoria: 'C', desSubgrupo: 'Despesas bancárias' },
   ];

   it('débito sugere entrada e crédito sugere saída', () => {
      expect(sentidoDaCategoria('D')).toBe(true);
      expect(sentidoDaCategoria('E')).toBe(true);
      expect(sentidoDaCategoria('C')).toBe(false);
      expect(sentidoDaCategoria('X')).toBeNull();
   });

   it('troca o subgrupo de lado quando o tipo de movimento muda', () => {
      const oSaida = trocaSubgrupoPorSentido(aSubgrupos, aSubgrupos[0], false);
      expect(chaveSubgrupo(oSaida)).toBe('C|S01');
   });

   it('mantém a escolha quando não há equivalente do outro lado', () => {
      expect(trocaSubgrupoPorSentido(aSubgrupos, aSubgrupos[2], true)).toBe(aSubgrupos[2]);
      expect(subgrupoAtendeSentido({ categoria: '' }, true)).toBe(true);
   });

   it('localiza o subgrupo gravado pela categoria ou pelo sentido', () => {
      expect(localizaSubgrupo(aSubgrupos, 'S01', 'C', true).categoria).toBe('C');
      expect(localizaSubgrupo(aSubgrupos, 'S01', '', true).categoria).toBe('D');
      expect(localizaSubgrupo(aSubgrupos, 'S99', '', true)).toBeNull();
   });
});

describe('bancos integrados', () => {
   it('reconhece os quatro bancos pelo código de compensação', () => {
      expect(compensacoesIntegradas().sort()).toEqual(['001', '237', '341', '422']);
      expect(bancoIntegrado('000341').sSlug).toBe('itau');
      expect(bancoIntegrado('1').sSlug).toBe('bb');
      expect(bancoIntegrado('104')).toBeNull();
      expect(normalizaNumBanco('')).toBe('');
   });
});
