import { afterEach, describe, expect, it } from 'vitest';
import { BankProvider } from '../../src/providers/BankProvider.js';
import { BankProviderFactory } from '../../src/providers/BankProviderFactory.js';
import {
   BancoBrasilProvider,
   ehLancamento,
   formataDataBB,
   leDataBB,
   leValorBB,
   semZerosAEsquerda,
} from '../../src/providers/BancoBrasilProvider.js';
import { BradescoProvider } from '../../src/providers/BradescoProvider.js';

describe('BankProvider (Template Method)', () => {
   it('não pode ser instanciado diretamente', () => {
      expect(() => new BankProvider()).toThrow('classe abstrata');
   });
});

describe('BankProviderFactory (Factory + Singleton por banco)', () => {
   afterEach(() => BankProviderFactory.clearCache());

   it('registra os quatro bancos', () => {
      expect(BankProviderFactory.getRegisteredSlugs().sort()).toEqual(['bb', 'bradesco', 'itau', 'safra']);
   });

   it('devolve sempre a mesma instância por banco, para preservar o token', () => {
      const oA = BankProviderFactory.createProvider('itau');
      const oB = BankProviderFactory.createProvider(' ITAU ');

      expect(oA).toBe(oB);
      expect(oA).toBeInstanceOf(BankProvider);
   });

   it('recusa banco não registrado', () => {
      expect(() => BankProviderFactory.createProvider('caixa')).toThrow('não encontrado');
   });

   it('todo provider implementa o contrato da classe base', () => {
      for (const sSlug of BankProviderFactory.getRegisteredSlugs()) {
         const oProvider = BankProviderFactory.createProvider(sSlug);
         expect(typeof oProvider.authenticate).toBe('function');
         expect(typeof oProvider.fetchExtrato).toBe('function');
         expect(oProvider.getSlug()).toBe(sSlug);
      }
   });
});

describe('Banco do Brasil (Adapter)', () => {
   it('converte datas e valores no formato da API', () => {
      expect(formataDataBB('06/11/2024')).toBe('6112024');
      expect(leDataBB(6112024)).toBe('06/11/2024');
      expect(leDataBB(0)).toBe('');
      expect(leValorBB('128847.13')).toBe(128847.13);
      expect(leValorBB(null)).toBe(0);
      expect(semZerosAEsquerda('0297')).toBe('297');
   });

   it('descarta saldos e limites que vêm misturados aos lançamentos', () => {
      expect(ehLancamento({ indicadorTipoLancamento: '1' })).toBe(true);
      expect(ehLancamento({ indicadorTipoLancamento: 'S' })).toBe(false);

      const aMov = new BancoBrasilProvider()._normalizaMovimentos([
         { indicadorTipoLancamento: '1', dataLancamento: 6112024, valorLancamento: 150.25, indicadorSinalLancamento: 'C', textoDescricaoHistorico: 'Pix - Recebido', textoInformacaoComplementar: 'CLIENTE X', numeroDocumento: 77, TextoIdentificadorUnicoTransacao: 'ABC' },
         { indicadorTipoLancamento: '1', dataLancamento: 7112024, valorLancamento: 30, indicadorSinalLancamento: 'D', textoDescricaoHistorico: 'Tarifa' },
         { indicadorTipoLancamento: 'S', dataLancamento: 7112024, valorLancamento: 9999, indicadorSinalLancamento: 'C', textoDescricaoHistorico: 'Saldo do dia' },
      ]);

      expect(aMov).toHaveLength(2);
      expect(aMov[0]).toMatchObject({ datMovimento: '06/11/2024', valEntrada: 150.25, valSaida: null, desHistorico: 'Pix - Recebido - CLIENTE X', idTransacao: 'ABC' });
      expect(aMov[1]).toMatchObject({ valEntrada: null, valSaida: 30 });
   });
});

describe('Bradesco (Adapter)', () => {
   it('converte valores pt-BR, sinal e ignora a linha de saldo anterior', () => {
      const aMov = new BradescoProvider()._normalizaMovimentos([
         { dataLancamento: '06112024', valor: '6.759,00', sinalLancamento: 'C', descritivoLancamentoCompleto: 'TED RECEBIDA', numeroDocumento: '123' },
         { dataLancamento: '07112024', valor: '-18,90', descritivoLancamentoCompleto: 'TARIFA' },
         { dataLancamento: '05112024', valor: '0,00', descritivoLancamentoCompleto: 'SALDO ANTERIOR' },
      ]);

      expect(aMov).toHaveLength(2);
      expect(aMov[0]).toMatchObject({ datMovimento: '06/11/2024', valEntrada: 6759, valSaida: null, numDocumento: '123' });
      expect(aMov[1]).toMatchObject({ datMovimento: '07/11/2024', valEntrada: null, valSaida: 18.9 });
   });
});
