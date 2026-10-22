'use client';
// ============================================================================
// RateioCentroCusto.jsx - Rateio do valor por centro de custo
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Ata de 24/09/2026: "Implementar rateio de valor por Centro de Custo" e "Uma
// transferência pode ter mais de um Centro de Custo". Usado na caixa de
// lançamento e na de transferência.
//
// As linhas guardam o valor como texto (o que o usuário digitou); a conversão
// para número acontece na soma e na gravação, como nos demais campos de valor.
// ============================================================================

import { Plus, Scale, Trash2 } from 'lucide-react';
import { converteTextoParaValor, formataMoeda, formataValor } from '../../utils/formatters.js';
import { converteParaCentavos } from '../../utils/subsetSum.js';

/**
 * Converte as linhas da tela no rateio que a API recebe.
 * @param {Array<{ codCentroCusto: string, sValor: string }>} aLinhas
 * @returns {Array<{ codCentroCusto: string, valRateio: number }>}
 */
export function linhasParaRateio(aLinhas) {
   return (aLinhas ?? [])
      .map((oLinha) => ({
         codCentroCusto: oLinha.codCentroCusto,
         valRateio: converteTextoParaValor(oLinha.sValor),
      }))
      .filter((oLinha) => oLinha.codCentroCusto || oLinha.valRateio !== 0);
} // linhasParaRateio

/**
 * Converte o rateio gravado nas linhas editáveis da tela.
 * @param {Array<{ codCentroCusto: string, valRateio: number }>} aRateio
 * @returns {Array<{ codCentroCusto: string, sValor: string }>}
 */
export function rateioParaLinhas(aRateio) {
   return (aRateio ?? []).map((oLinha) => ({
      codCentroCusto: oLinha.codCentroCusto,
      sValor: formataValor(oLinha.valRateio),
   }));
} // rateioParaLinhas

/**
 * @param {object} oPropriedades
 * @param {Array<{ codCentroCusto: string, sValor: string }>} oPropriedades.aLinhas
 * @param {(aLinhas: Array<object>) => void} oPropriedades.aoAlterar
 * @param {number} oPropriedades.nValorTotal Valor do lançamento
 * @param {Array<{ codCentroCusto: string, desCentroCusto: string }>} oPropriedades.aCentrosCusto
 * @param {boolean} [oPropriedades.somenteLeitura]
 */
export function RateioCentroCusto({ aLinhas, aoAlterar, nValorTotal, aCentrosCusto, somenteLeitura = false }) {
   const iTotalCentavos = converteParaCentavos(nValorTotal);
   const iRateadoCentavos = aLinhas.reduce(
      (iSoma, oLinha) => iSoma + converteParaCentavos(converteTextoParaValor(oLinha.sValor)),
      0
   );
   const iRestanteCentavos = iTotalCentavos - iRateadoCentavos;

   /**
    * Altera um campo de uma linha.
    * @param {number} iPos
    * @param {string} sCampo
    * @param {string} sValor
    */
   function alteraLinha(iPos, sCampo, sValor) {
      aoAlterar(aLinhas.map((oLinha, iItem) => (iItem === iPos ? { ...oLinha, [sCampo]: sValor } : oLinha)));
   } // alteraLinha

   /** Inclui uma linha já com o valor que falta ratear. */
   function incluiLinha() {
      aoAlterar([
         ...aLinhas,
         { codCentroCusto: '', sValor: iRestanteCentavos > 0 ? formataValor(iRestanteCentavos / 100) : '' },
      ]);
   } // incluiLinha

   /**
    * Remove uma linha.
    * @param {number} iPos
    */
   function removeLinha(iPos) {
      aoAlterar(aLinhas.filter((_, iItem) => iItem !== iPos));
   } // removeLinha

   /**
    * Distribui o valor do lançamento em partes iguais entre as linhas. Os
    * centavos que sobram da divisão vão para a primeira linha, para a soma
    * fechar exatamente no total.
    */
   function distribuiIgual() {
      if (aLinhas.length === 0 || iTotalCentavos <= 0) {
         return;
      }
      const iParte = Math.floor(iTotalCentavos / aLinhas.length);
      const iSobra = iTotalCentavos - iParte * aLinhas.length;
      aoAlterar(
         aLinhas.map((oLinha, iPos) => ({
            ...oLinha,
            sValor: formataValor((iParte + (iPos === 0 ? iSobra : 0)) / 100),
         }))
      );
   } // distribuiIgual

   return (
      <div className="rateio">
         <div className="rateio-cabecalho">
            <span className="grupo-titulo">Rateio por centro de custo</span>
            {!somenteLeitura ? (
               <span className="rateio-acoes">
                  <button
                     type="button"
                     className="btn btn-neutro btn-pequeno"
                     onClick={distribuiIgual}
                     disabled={aLinhas.length < 2}
                     title="Divide o valor do lançamento em partes iguais entre os centros de custo"
                  >
                     <Scale size={12} />
                     Dividir igualmente
                  </button>
                  <button type="button" className="btn btn-secundario btn-pequeno" onClick={incluiLinha}>
                     <Plus size={12} />
                     Centro de custo
                  </button>
               </span>
            ) : null}
         </div>

         {aLinhas.length === 0 ? (
            <div className="rateio-vazio">
               Sem rateio: o lançamento não é distribuído por centro de custo.
            </div>
         ) : (
            <table className="rateio-tabela">
               <thead>
                  <tr>
                     <th>
                        <span className="obrigatorio">*</span>Centro de custo
                     </th>
                     <th className="col-valor">
                        <span className="obrigatorio">*</span>Valor
                     </th>
                     <th className="col-valor">%</th>
                     {!somenteLeitura ? <th aria-label="Ações" /> : null}
                  </tr>
               </thead>
               <tbody>
                  {aLinhas.map((oLinha, iPos) => {
                     const nValorLinha = converteTextoParaValor(oLinha.sValor);
                     const nPercentual = nValorTotal > 0 ? (nValorLinha / nValorTotal) * 100 : 0;
                     return (
                        // eslint-disable-next-line react/no-array-index-key
                        <tr key={iPos}>
                           <td>
                              <select
                                 className="campo-controle"
                                 value={oLinha.codCentroCusto}
                                 disabled={somenteLeitura}
                                 onChange={(oEvento) => alteraLinha(iPos, 'codCentroCusto', oEvento.target.value)}
                              >
                                 <option value="">Selecione</option>
                                 {aCentrosCusto.map((oCentro) => (
                                    <option key={oCentro.codCentroCusto} value={oCentro.codCentroCusto}>
                                       {oCentro.codCentroCusto} — {oCentro.desCentroCusto}
                                    </option>
                                 ))}
                              </select>
                           </td>
                           <td className="col-valor">
                              <input
                                 type="text"
                                 className="campo-controle campo-controle-valor"
                                 placeholder="0,00"
                                 value={oLinha.sValor}
                                 readOnly={somenteLeitura}
                                 onChange={(oEvento) => alteraLinha(iPos, 'sValor', oEvento.target.value)}
                              />
                           </td>
                           <td className="col-valor rateio-percentual">{nPercentual.toFixed(2)}%</td>
                           {!somenteLeitura ? (
                              <td className="rateio-remover">
                                 <button
                                    type="button"
                                    className="btn-icone"
                                    onClick={() => removeLinha(iPos)}
                                    title="Remover centro de custo"
                                    aria-label="Remover centro de custo"
                                 >
                                    <Trash2 size={13} />
                                 </button>
                              </td>
                           ) : null}
                        </tr>
                     );
                  })}
               </tbody>
            </table>
         )}

         {aLinhas.length > 0 ? (
            <div className="rateio-rodape">
               <span>
                  Rateado <strong>{formataMoeda(iRateadoCentavos / 100)}</strong> de{' '}
                  <strong>{formataMoeda(iTotalCentavos / 100)}</strong>
               </span>
               <span className={iRestanteCentavos === 0 ? 'diferenca-zero' : 'diferenca-aberta'}>
                  {iRestanteCentavos === 0
                     ? 'Rateio fechado'
                     : `${iRestanteCentavos > 0 ? 'Falta ratear' : 'Excede em'} ${formataMoeda(
                          Math.abs(iRestanteCentavos) / 100
                       )}`}
               </span>
            </div>
         ) : null}
      </div>
   );
} // RateioCentroCusto
