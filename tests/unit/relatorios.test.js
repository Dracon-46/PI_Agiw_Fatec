import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
   ESCOPO_BANCO,
   ESCOPO_SISTEMA,
   calculaTotais,
   descreveFiltroStatus,
   filtraPorStatus,
   geraCsv,
   geraExcel,
   geraOfx,
   montaBlocos,
} from '../../src/lib/relatorios/relatorioConciliacao.js';

const oConta = {
   codBanco: '341',
   nomBanco: 'Itaú',
   codAgencia: '1500',
   numContaCorrente: '12345-6',
   tipConta: 'cc',
   datUltimoBloqueio: '30/09/2026',
};
const aLancamentos = [
   { codLancamento: 'L1', datMovimento: '01/10/2026', numDocumento: 'NF1', desHistorico: 'Cliente A', valMovimento: 1000, bEntrada: true, staConciliado: true },
   { codLancamento: 'L2', datMovimento: '02/10/2026', numDocumento: 'CP1', desHistorico: 'Fornecedor B', valMovimento: 250.5, bEntrada: false, staConciliado: false },
];
const aMovimentos = [
   { codMovimento: 'M1', datMovimento: '01/10/2026', numDocumento: '100', desHistorico: 'LIQUIDACAO & BOLETO', valMovimento: 1000, bEntrada: true, staConciliado: true },
];
const oDados = {
   oConta,
   sDataInicio: '01/10/2026',
   sDataFim: '31/10/2026',
   aLancamentos,
   aMovimentos,
   nSaldoAnterior: 500,
   oFiltros: { sDescricaoEscopo: 'os dois extratos', sDescricaoStatus: 'conciliados e não conciliados' },
};

describe('totais do relatório (item 6.2)', () => {
   it('calcula saldo final, entradas, saídas, conciliado e não conciliado', () => {
      expect(calculaTotais(aLancamentos, 500)).toEqual({
         valSaldoAnterior: 500,
         valEntradas: 1000,
         valSaidas: 250.5,
         valSaldoFinal: 1249.5,
         valConciliado: 1000,
         valNaoConciliado: -250.5,
         iRegistros: 2,
         iConciliados: 1,
         iNaoConciliados: 1,
      });
   });

   it('aplica os filtros de situação das grades', () => {
      expect(filtraPorStatus(aLancamentos, true, false)).toHaveLength(1);
      expect(filtraPorStatus(aLancamentos, false, false)).toHaveLength(0);
      expect(descreveFiltroStatus({ bConciliados: false, bNaoConciliados: true })).toBe('somente não conciliados');
   });

   it('monta um bloco por extrato conforme o escopo', () => {
      expect(montaBlocos(oDados)).toHaveLength(2);
      expect(montaBlocos({ ...oDados, sEscopo: ESCOPO_SISTEMA })[0].sAba).toBe('Extrato do Sistema');
      expect(montaBlocos({ ...oDados, sEscopo: ESCOPO_BANCO })[0].sAba).toBe('Extrato do Banco');
   });
});

describe('formatos de exportação', () => {
   it('gera CSV com BOM, cabeçalho de filtros e totais', () => {
      const sCsv = geraCsv(oDados);

      expect(sCsv.charCodeAt(0)).toBe(0xfeff);
      expect(sCsv).toContain('Período de 01/10/2026 até 31/10/2026');
      expect(sCsv).toContain('Total conciliado');
   });

   it('gera OFX válido com débito negativo e caracteres escapados', () => {
      const sOfx = geraOfx({ ...oDados, sEscopo: ESCOPO_SISTEMA });

      expect(sOfx.startsWith('OFXHEADER:100')).toBe(true);
      expect(sOfx).toContain('<TRNTYPE>DEBIT');
      expect(sOfx).toContain('<TRNAMT>-250.50');
      expect(sOfx).toContain('<BANKID>341');

      const sOfxBanco = geraOfx({ ...oDados, sEscopo: ESCOPO_BANCO });
      expect(sOfxBanco).not.toContain('LIQUIDACAO & BOLETO');
   });

   it('gera planilha Excel com uma aba por extrato', async () => {
      const oBuffer = await geraExcel(oDados);
      const oPlanilha = new ExcelJS.Workbook();
      await oPlanilha.xlsx.load(oBuffer);

      expect(oPlanilha.worksheets.map((oAba) => oAba.name)).toEqual(['Extrato do Sistema', 'Extrato do Banco']);
   });
});
