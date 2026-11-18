import { afterEach, describe, expect, it, vi } from 'vitest';

// O módulo lê e grava no ERP; aqui só interessam as funções puras
vi.mock('../../src/lib/repositories/movimentoRepository.js', () => ({}));

const {
   MAX_DIAS_POR_CHAMADA,
   agrupaEmFaixas,
   listaDiasDoPeriodo,
   normalizaMovimentosDoProvider,
   recortaPeriodo,
} = await import('../../src/lib/extratoBanco.js');

describe('cache do extrato por dia', () => {
   afterEach(() => vi.unstubAllEnvs());

   it('lista os dias do período, inclusive as pontas', () => {
      expect(listaDiasDoPeriodo('30/10/2026', '02/11/2026')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
      expect(listaDiasDoPeriodo('02/11/2026', '01/11/2026')).toEqual([]);
   });

   it('agrupa só os dias faltantes em faixas contíguas', () => {
      expect(agrupaEmFaixas(['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07'])).toEqual([
         { sInicioIso: '2026-10-01', sFimIso: '2026-10-02' },
         { sInicioIso: '2026-10-05', sFimIso: '2026-10-07' },
      ]);
   });

   it(`quebra faixas maiores que ${MAX_DIAS_POR_CHAMADA} dias (limite do Banco do Brasil)`, () => {
      const aDias = listaDiasDoPeriodo('01/01/2026', '28/02/2026');
      const aFaixas = agrupaEmFaixas(aDias);

      expect(aFaixas).toHaveLength(2);
      expect(aFaixas[0]).toEqual({ sInicioIso: '2026-01-01', sFimIso: '2026-01-31' });
   });

   it('gera FITID determinístico e distinto para movimentos repetidos', () => {
      const oBruto = { datMovimento: '01/10/2026', valEntrada: 100, numDocumento: '55', codigoLancamento: 'LIQ' };
      const [oA, oB] = normalizaMovimentosDoProvider([oBruto, oBruto], 'itau-1500-12345');
      const [oA2] = normalizaMovimentosDoProvider([oBruto], 'itau-1500-12345');

      expect(oA.codFitid).toBe(oA2.codFitid);
      expect(oA.codFitid).not.toBe(oB.codFitid);
      expect(oA).toMatchObject({ bEntrada: true, valMovimento: 100, staConciliado: false });
   });

   it('recorta o que a API devolve fora do período pedido', () => {
      const aMov = [{ datMovimento: '30/09/2026' }, { datMovimento: '01/10/2026' }, { datMovimento: '01/11/2026' }];

      expect(recortaPeriodo(aMov, '01/10/2026', '31/10/2026')).toEqual({ aDentro: [aMov[1]], iFora: 2 });

      vi.stubEnv('BANK_FILTRA_PERIODO', 'false');
      expect(recortaPeriodo(aMov, '01/10/2026', '31/10/2026').iFora).toBe(0);
   });
});
