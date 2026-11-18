import { describe, expect, it } from 'vitest';
import { executaConciliacaoAutomatica } from '../../src/services/autoMatchService.js';

const lanc = (cod, dat, val, bEntrada = true, staConciliado = false) => ({
   codLancamento: cod,
   datMovimento: dat,
   valMovimento: val,
   bEntrada,
   staConciliado,
});
const mov = (cod, dat, val, bEntrada = true, staConciliado = false) => ({
   codMovimento: cod,
   datMovimento: dat,
   valMovimento: val,
   bEntrada,
   staConciliado,
});

describe('executaConciliacaoAutomatica', () => {
   it('concilia pares 1:1 de mesmo valor, sentido e data próxima', () => {
      const oRes = executaConciliacaoAutomatica(
         [lanc('L1', '01/10/2026', 3250), lanc('L2', '02/10/2026', 2740.15, false)],
         [mov('M1', '01/10/2026', 3250), mov('M2', '03/10/2026', 2740.15, false)]
      );

      expect(oRes.iGrupos).toBe(2);
      expect(oRes.aGrupos.every((oGrupo) => oGrupo.tipCorrespondencia === 'EXATA')).toBe(true);
   });

   it('não concilia valores iguais em sentidos opostos', () => {
      const oRes = executaConciliacaoAutomatica([lanc('L1', '01/10/2026', 100, true)], [mov('M1', '01/10/2026', 100, false)]);

      expect(oRes.iGrupos).toBe(0);
   });

   it('respeita a janela de 3 dias entre as datas', () => {
      const oRes = executaConciliacaoAutomatica([lanc('L1', '01/10/2026', 100)], [mov('M1', '10/10/2026', 100)]);

      expect(oRes.iGrupos).toBe(0);
   });

   it('ignora registros já conciliados', () => {
      const oRes = executaConciliacaoAutomatica(
         [lanc('L1', '01/10/2026', 100, true, true)],
         [mov('M1', '01/10/2026', 100)]
      );

      expect(oRes.iGrupos).toBe(0);
   });

   it('agrupa N lançamentos que somam um movimento (N:1)', () => {
      const oRes = executaConciliacaoAutomatica(
         [lanc('L1', '03/10/2026', 870), lanc('L2', '03/10/2026', 1520), lanc('L3', '03/10/2026', 610)],
         [mov('M1', '03/10/2026', 3000)]
      );

      expect(oRes.iGrupos).toBe(1);
      expect(oRes.aGrupos[0].tipCorrespondencia).toBe('AGRUPADA');
      expect(oRes.aGrupos[0].aCodLancamentos.sort()).toEqual(['L1', 'L2', 'L3']);
   });

   it('agrupa um lançamento que soma vários movimentos (1:N)', () => {
      const oRes = executaConciliacaoAutomatica(
         [lanc('L1', '05/10/2026', 1000, false)],
         [mov('M1', '05/10/2026', 400, false), mov('M2', '05/10/2026', 600, false)]
      );

      expect(oRes.iGrupos).toBe(1);
      expect(oRes.aGrupos[0].aCodMovimentos.sort()).toEqual(['M1', 'M2']);
   });

   it('concilia conjuntos dos dois lados (N:N)', () => {
      const oRes = executaConciliacaoAutomatica(
         [lanc('L1', '07/10/2026', 300), lanc('L2', '07/10/2026', 700)],
         [mov('M1', '07/10/2026', 450), mov('M2', '07/10/2026', 550)]
      );

      expect(oRes.iGrupos).toBe(1);
      expect(oRes.aGrupos[0].tipCorrespondencia).toBe('AGRUPADA_NN');
   });

   it('usa cada registro em no máximo um grupo', () => {
      const oRes = executaConciliacaoAutomatica(
         [lanc('L1', '01/10/2026', 100), lanc('L2', '01/10/2026', 100)],
         [mov('M1', '01/10/2026', 100)]
      );

      expect(oRes.iGrupos).toBe(1);
      expect(oRes.iLancamentosConciliados).toBe(1);
      expect(oRes.iMovimentosConciliados).toBe(1);
   });

   it('aceita listas vazias ou nulas', () => {
      expect(executaConciliacaoAutomatica(null, undefined).iGrupos).toBe(0);
   });
});
