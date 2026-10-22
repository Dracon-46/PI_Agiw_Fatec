// ============================================================================
// subsetSum.js - Identificação de conjuntos de lançamentos por somatória
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Resolve o problema descrito na ata de 28/04/2026: identificar o conjunto de
// lançamentos de um extrato que, somados, correspondem ao valor de um
// lançamento específico do outro extrato — com até TAMANHO_MAXIMO_CONJUNTO
// (10) lançamentos no mesmo grupo.
//
// Os valores são convertidos para centavos (inteiros) antes do processamento,
// evitando os erros de arredondamento do ponto flutuante em comparações de
// igualdade — requisito da regra "não é permitido conciliar valores divergentes".
//
// Dois algoritmos, escolhidos pela quantidade de candidatos:
//
//   - até LIMITE_BUSCA_EXATA candidatos: "meet in the middle". Os candidatos
//     são divididos em duas metades; cada metade tem todas as suas somas
//     enumeradas (2^18 = 262 mil no máximo), e a resposta é o par de somas,
//     uma de cada metade, que fecha o alvo. A busca é EXATA: se existe um
//     conjunto de até 10 lançamentos, ele é encontrado, em poucos milésimos;
//
//   - acima disso: busca em profundidade por tamanho (1, 2, ... 10 itens),
//     com cortes pelas somas máxima e mínima ainda alcançáveis e dois
//     ponteiros para fechar o último par. Com muitos candidatos o número de
//     combinações de 10 itens passa de trilhões, então essa busca tem prazo
//     (PRAZO_PADRAO_MS) e, se ele vence, informa que foi interrompida — em vez
//     de devolver "não achou" como se tivesse olhado tudo.
//
// Nos dois casos vale o MENOR conjunto: a correspondência 1-para-1 é sempre a
// preferencial, depois a de dois itens, e assim por diante.
// ============================================================================

/** Quantidade máxima de lançamentos agrupados em uma única correspondência */
export const TAMANHO_MAXIMO_CONJUNTO = 10;

/** Até quantos candidatos a busca é exata (meet in the middle) */
export const LIMITE_BUSCA_EXATA = 36;

/** Prazo padrão de uma busca por profundidade, em milissegundos */
export const PRAZO_PADRAO_MS = 500;

/** A cada quantos passos a busca por profundidade confere o relógio */
const PASSOS_ENTRE_CONFERENCIAS = 4096;

/**
 * Converte um valor monetário em centavos inteiros.
 * @param {number} nValor
 * @returns {number}
 */
export function converteParaCentavos(nValor) {
   return Math.round((nValor ?? 0) * 100);
} // converteParaCentavos

/**
 * Prepara a lista de candidatos: descarta valores nulos e os que sozinhos já
 * passam do alvo, e ordena de forma decrescente, o que antecipa os cortes.
 * @param {Array<object>} aItens
 * @param {(item: object) => number} fnObtemValor
 * @param {number} iAlvo Alvo em centavos
 * @returns {Array<{ oItem: object, iValor: number }>}
 */
function preparaCandidatos(aItens, fnObtemValor, iAlvo) {
   return aItens
      .map((oItem) => ({ oItem, iValor: converteParaCentavos(fnObtemValor(oItem)) }))
      .filter((oCandidato) => oCandidato.iValor > 0 && oCandidato.iValor <= iAlvo)
      .sort((oA, oB) => oB.iValor - oA.iValor);
} // preparaCandidatos

/**
 * Enumera todas as somas de uma metade dos candidatos, guardando para cada
 * soma o MENOR subconjunto que a produz (como máscara de bits).
 * @param {Array<{ iValor: number }>} aMetade No máximo 18 itens
 * @param {number} iAlvo Somas acima do alvo são descartadas
 * @param {number} iTamanhoMaximo
 * @returns {Map<number, { iMascara: number, iTamanho: number }>}
 */
function enumeraSomas(aMetade, iAlvo, iTamanhoMaximo) {
   const oSomas = new Map([[0, { iMascara: 0, iTamanho: 0 }]]);

   const percorre = (iPosicao, iSoma, iMascara, iTamanho) => {
      for (let iPos = iPosicao; iPos < aMetade.length; iPos += 1) {
         const iNovaSoma = iSoma + aMetade[iPos].iValor;
         if (iNovaSoma > iAlvo) {
            continue;
         }

         const iNovaMascara = iMascara | (1 << iPos);
         const iNovoTamanho = iTamanho + 1;
         const oAtual = oSomas.get(iNovaSoma);
         if (!oAtual || oAtual.iTamanho > iNovoTamanho) {
            oSomas.set(iNovaSoma, { iMascara: iNovaMascara, iTamanho: iNovoTamanho });
         }

         if (iNovoTamanho < iTamanhoMaximo) {
            percorre(iPos + 1, iNovaSoma, iNovaMascara, iNovoTamanho);
         }
      }
   };

   percorre(0, 0, 0, 0);
   return oSomas;
} // enumeraSomas

/**
 * Busca exata por "meet in the middle".
 * @param {Array<{ oItem: object, iValor: number }>} aCandidatos
 * @param {number} iAlvo
 * @param {number} iTamanhoMaximo
 * @returns {Array<object>|null} Menor conjunto que fecha o alvo
 */
function buscaExata(aCandidatos, iAlvo, iTamanhoMaximo) {
   const iMeio = Math.ceil(aCandidatos.length / 2);
   const aEsquerda = aCandidatos.slice(0, iMeio);
   const aDireita = aCandidatos.slice(iMeio);

   const oSomasEsquerda = enumeraSomas(aEsquerda, iAlvo, iTamanhoMaximo);
   const oSomasDireita = enumeraSomas(aDireita, iAlvo, iTamanhoMaximo);

   let oMelhor = null;
   for (const [iSomaDireita, oDireita] of oSomasDireita) {
      const oEsquerda = oSomasEsquerda.get(iAlvo - iSomaDireita);
      if (!oEsquerda) {
         continue;
      }

      const iTamanho = oEsquerda.iTamanho + oDireita.iTamanho;
      if (iTamanho === 0 || iTamanho > iTamanhoMaximo) {
         continue;
      }
      if (!oMelhor || iTamanho < oMelhor.iTamanho) {
         oMelhor = { iTamanho, oEsquerda, oDireita };
      }
   }

   if (!oMelhor) {
      return null;
   }

   const aResultado = [];
   aEsquerda.forEach((oCandidato, iPos) => {
      if (oMelhor.oEsquerda.iMascara & (1 << iPos)) {
         aResultado.push(oCandidato.oItem);
      }
   });
   aDireita.forEach((oCandidato, iPos) => {
      if (oMelhor.oDireita.iMascara & (1 << iPos)) {
         aResultado.push(oCandidato.oItem);
      }
   });
   return aResultado;
} // buscaExata

/**
 * Busca por profundidade, tamanho a tamanho, com prazo.
 *
 * Para escolher r itens a partir da posição p (lista decrescente):
 *   - a maior soma possível é a dos r itens seguintes a p;
 *   - a menor soma possível é a dos r últimos itens da lista.
 * Se o que falta para o alvo está fora dessa faixa, o ramo é descartado. O
 * último par é fechado com dois ponteiros, em tempo linear.
 *
 * @param {Array<{ oItem: object, iValor: number }>} aCandidatos Decrescente
 * @param {number} iAlvo
 * @param {number} iTamanhoMaximo
 * @param {number} nPrazo Instante (performance.now) em que a busca desiste
 * @returns {{ aConjunto: Array<object>|null, bTruncado: boolean }}
 */
function buscaPorProfundidade(aCandidatos, iAlvo, iTamanhoMaximo, nPrazo) {
   const iTotal = aCandidatos.length;
   const aSomaAcumulada = new Array(iTotal + 1).fill(0);
   for (let iPos = 0; iPos < iTotal; iPos += 1) {
      aSomaAcumulada[iPos + 1] = aSomaAcumulada[iPos] + aCandidatos[iPos].iValor;
   }
   const somaDosMenores = (iQuantidade) => aSomaAcumulada[iTotal] - aSomaAcumulada[iTotal - iQuantidade];

   let iPassos = 0;
   let bTruncado = false;
   const aSelecionados = [];

   const fechaPar = (iPosicao, iFalta) => {
      let iInicio = iPosicao;
      let iFim = iTotal - 1;
      while (iInicio < iFim) {
         const iSoma = aCandidatos[iInicio].iValor + aCandidatos[iFim].iValor;
         if (iSoma === iFalta) {
            aSelecionados.push(iInicio, iFim);
            return true;
         }
         if (iSoma > iFalta) {
            iInicio += 1;
         } else {
            iFim -= 1;
         }
      }
      return false;
   };

   const percorre = (iPosicao, iRestantes, iFalta) => {
      iPassos += 1;
      if (iPassos % PASSOS_ENTRE_CONFERENCIAS === 0 && performance.now() > nPrazo) {
         bTruncado = true;
      }
      if (bTruncado) {
         return false;
      }

      if (iRestantes === 1) {
         for (let iPos = iPosicao; iPos < iTotal && aCandidatos[iPos].iValor >= iFalta; iPos += 1) {
            if (aCandidatos[iPos].iValor === iFalta) {
               aSelecionados.push(iPos);
               return true;
            }
         }
         return false;
      }
      if (iRestantes === 2) {
         return fechaPar(iPosicao, iFalta);
      }
      if (iFalta < somaDosMenores(iRestantes)) {
         return false;
      }

      const iMenoresDepois = somaDosMenores(iRestantes - 1);
      for (let iPos = iPosicao; iPos <= iTotal - iRestantes; iPos += 1) {
         // Nem os maiores itens restantes alcançam o alvo: daqui para frente
         // os valores só diminuem
         if (aSomaAcumulada[iPos + iRestantes] - aSomaAcumulada[iPos] < iFalta) {
            break;
         }
         // Item grande demais: sobra menos do que os menores conseguem somar
         if (aCandidatos[iPos].iValor + iMenoresDepois > iFalta) {
            continue;
         }
         // Valor repetido gera exatamente os mesmos ramos do anterior
         if (iPos > iPosicao && aCandidatos[iPos].iValor === aCandidatos[iPos - 1].iValor) {
            continue;
         }

         aSelecionados.push(iPos);
         if (percorre(iPos + 1, iRestantes - 1, iFalta - aCandidatos[iPos].iValor)) {
            return true;
         }
         aSelecionados.pop();
      }
      return false;
   };

   for (let iTamanho = 1; iTamanho <= Math.min(iTamanhoMaximo, iTotal); iTamanho += 1) {
      aSelecionados.length = 0;
      if (percorre(0, iTamanho, iAlvo)) {
         return { aConjunto: aSelecionados.map((iPos) => aCandidatos[iPos].oItem), bTruncado: false };
      }
      if (bTruncado) {
         break;
      }
   }

   return { aConjunto: null, bTruncado };
} // buscaPorProfundidade

/**
 * Localiza o menor conjunto de itens cuja soma corresponde ao valor alvo,
 * informando se a busca foi completa.
 *
 * @param {Array<object>} aItens Lista de candidatos
 * @param {number} nValorAlvo Valor que deve ser atingido pela soma
 * @param {object} [oOpcoes]
 * @param {(item: object) => number} [oOpcoes.obtemValor] Extrator do valor do item
 * @param {number} [oOpcoes.iTamanhoMaximo] Máximo de itens no conjunto
 * @param {number} [oOpcoes.nPrazo] Instante (performance.now) limite da busca
 * @returns {{ aConjunto: Array<object>|null, bTruncado: boolean }}
 *          bTruncado indica que o prazo venceu antes de olhar todas as combinações
 */
export function buscaConjuntoPorSoma(aItens, nValorAlvo, oOpcoes = {}) {
   const fnObtemValor = oOpcoes.obtemValor ?? ((oItem) => oItem.valor);
   const iTamanhoMaximo = oOpcoes.iTamanhoMaximo ?? TAMANHO_MAXIMO_CONJUNTO;
   const nPrazo = oOpcoes.nPrazo ?? performance.now() + PRAZO_PADRAO_MS;
   const iAlvo = converteParaCentavos(nValorAlvo);

   if (!Array.isArray(aItens) || aItens.length === 0 || iAlvo <= 0) {
      return { aConjunto: null, bTruncado: false };
   }

   const aCandidatos = preparaCandidatos(aItens, fnObtemValor, iAlvo);
   if (aCandidatos.length === 0) {
      return { aConjunto: null, bTruncado: false };
   }

   if (aCandidatos.length <= LIMITE_BUSCA_EXATA) {
      return { aConjunto: buscaExata(aCandidatos, iAlvo, iTamanhoMaximo), bTruncado: false };
   }

   return buscaPorProfundidade(aCandidatos, iAlvo, iTamanhoMaximo, nPrazo);
} // buscaConjuntoPorSoma

/**
 * Calcula a diferença, em reais, entre duas somatórias de seleção.
 * Alimenta o campo "Diferença" da tela — a conciliação só é permitida
 * quando o resultado é zero (item 6.1.3.6 do documento de visão).
 * @param {number} nTotalSistema
 * @param {number} nTotalBanco
 * @returns {number}
 */
export function calculaDiferenca(nTotalSistema, nTotalBanco) {
   const iDiferenca = converteParaCentavos(nTotalSistema) - converteParaCentavos(nTotalBanco);
   return iDiferenca / 100;
} // calculaDiferenca
