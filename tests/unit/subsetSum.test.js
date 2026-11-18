import { describe, expect, it } from 'vitest';
import {
   LIMITE_BUSCA_EXATA,
   TAMANHO_MAXIMO_CONJUNTO,
   buscaConjuntoPorSoma,
   calculaDiferenca,
   converteParaCentavos,
} from '../../src/utils/subsetSum.js';

const obtemValor = (oItem) => oItem.v;
const soma = (aItens) => aItens.reduce((iSoma, oItem) => iSoma + converteParaCentavos(oItem.v), 0);

/** Gerador pseudoaleatório determinístico, para o teste ser reproduzível */
function geradorAleatorio(iSemente) {
   let iEstado = iSemente;
   return () => {
      iEstado = (iEstado * 1103515245 + 12345) % 2147483648;
      return iEstado / 2147483648;
   };
}

describe('converteParaCentavos', () => {
   it('evita o erro de arredondamento do ponto flutuante', () => {
      expect(0.1 + 0.2).not.toBe(0.3);
      expect(converteParaCentavos(0.1) + converteParaCentavos(0.2)).toBe(converteParaCentavos(0.3));
   });

   it('trata valores nulos como zero', () => {
      expect(converteParaCentavos(null)).toBe(0);
      expect(converteParaCentavos(undefined)).toBe(0);
   });
});

describe('calculaDiferenca', () => {
   it('é zero quando as somatórias são iguais em centavos', () => {
      expect(calculaDiferenca(100.1 + 200.2, 300.3)).toBe(0);
   });

   it('devolve a diferença em reais', () => {
      expect(calculaDiferenca(150, 100.25)).toBe(49.75);
   });
});

describe('buscaConjuntoPorSoma', () => {
   it('encontra o exemplo do referencial teórico (alvo de R$ 300,00)', () => {
      const aItens = [{ v: 120 }, { v: 75.5 }, { v: 180 }, { v: 44.5 }, { v: 999 }];
      const { aConjunto, bTruncado } = buscaConjuntoPorSoma(aItens, 300, { obtemValor });

      expect(bTruncado).toBe(false);
      expect(soma(aConjunto)).toBe(30000);
   });

   it('prefere o menor conjunto possível', () => {
      const aItens = [{ v: 100 }, { v: 50 }, { v: 50 }, { v: 300 }];
      const { aConjunto } = buscaConjuntoPorSoma(aItens, 300, { obtemValor });

      expect(aConjunto).toHaveLength(1);
   });

   it('devolve null quando nenhuma combinação fecha o alvo', () => {
      const aItens = [{ v: 10 }, { v: 20 }, { v: 40 }];
      const { aConjunto } = buscaConjuntoPorSoma(aItens, 15, { obtemValor });

      expect(aConjunto).toBeNull();
   });

   it('não aceita diferença de um centavo', () => {
      const aItens = [{ v: 100.01 }, { v: 199.98 }];
      const { aConjunto } = buscaConjuntoPorSoma(aItens, 300, { obtemValor });

      expect(aConjunto).toBeNull();
   });

   it('ignora entradas inválidas', () => {
      expect(buscaConjuntoPorSoma([], 100).aConjunto).toBeNull();
      expect(buscaConjuntoPorSoma(null, 100).aConjunto).toBeNull();
      expect(buscaConjuntoPorSoma([{ v: 10 }], 0, { obtemValor }).aConjunto).toBeNull();
   });

   it(`respeita o limite de ${TAMANHO_MAXIMO_CONJUNTO} itens por conjunto`, () => {
      const aItens = Array.from({ length: 12 }, () => ({ v: 1 }));
      const { aConjunto } = buscaConjuntoPorSoma(aItens, 12, { obtemValor });

      expect(aConjunto).toBeNull();
   });

   it(`acha um conjunto de 10 itens entre ${LIMITE_BUSCA_EXATA} candidatos com alvo perto de R$ 1 milhão`, () => {
      const fnAleatorio = geradorAleatorio(2026);
      const aItens = Array.from({ length: LIMITE_BUSCA_EXATA }, (_, iPos) => ({
         id: iPos,
         v: Math.round(50 + fnAleatorio() * 250_000_00) / 100,
      }));
      const aEscolhidos = aItens.slice(0, 10);
      const nAlvo = soma(aEscolhidos) / 100;

      const { aConjunto, bTruncado } = buscaConjuntoPorSoma(aItens, nAlvo, { obtemValor });

      expect(bTruncado).toBe(false);
      expect(soma(aConjunto)).toBe(converteParaCentavos(nAlvo));
      expect(aConjunto.length).toBeLessThanOrEqual(TAMANHO_MAXIMO_CONJUNTO);
   });

   it('usa a busca com prazo acima do limite da busca exata e encontra a soma', () => {
      const fnAleatorio = geradorAleatorio(7);
      const aItens = Array.from({ length: 120 }, () => ({ v: Math.round(100 + fnAleatorio() * 500_000) / 100 }));
      const nAlvo = soma(aItens.slice(10, 15)) / 100;

      const { aConjunto } = buscaConjuntoPorSoma(aItens, nAlvo, { obtemValor });

      expect(soma(aConjunto)).toBe(converteParaCentavos(nAlvo));
   });

   it('informa quando o prazo vence antes de olhar todas as combinações', () => {
      // Só valores pares e alvo ímpar: não existe solução, e a busca precisaria
      // percorrer bilhões de combinações para concluir isso
      const aItens = Array.from({ length: 80 }, (_, iPos) => ({ v: 2 + iPos * 2 }));
      const { aConjunto, bTruncado } = buscaConjuntoPorSoma(aItens, 501, {
         obtemValor,
         nPrazo: performance.now() + 20,
      });

      expect(aConjunto).toBeNull();
      expect(bTruncado).toBe(true);
   });
});
