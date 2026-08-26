'use client';
// ============================================================================
// FiltroGrade.jsx - Filtro por todos os campos de uma grade
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Item 6.1.3.4, segundo parágrafo: "Botão que abre opção de filtro por todos
// os campos da grade, sendo possível combinar filtros. Deixar visível
// (quantidade) ao usuário quando tem filtros aplicados."
//
// Os filtros são combinados com E: uma linha só aparece quando atende a todos
// os campos preenchidos. Texto compara sem acento e sem caixa; valor aceita
// intervalo (de / até), que é como se procura um lançamento na conferência.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { Filter, X } from 'lucide-react';
import { converteTextoParaValor, normalizaTexto } from '../../utils/formatters.js';

/**
 * Conta quantos filtros estão efetivamente preenchidos.
 * @param {object} oFiltros
 * @returns {number}
 */
export function contaFiltrosAtivos(oFiltros) {
   return Object.values(oFiltros ?? {}).filter((sValor) => String(sValor ?? '').trim() !== '')
      .length;
} // contaFiltrosAtivos

/**
 * Aplica os filtros de campo sobre as linhas da grade.
 *
 * @param {Array<object>} aLinhas Registros já filtrados por situação
 * @param {object} oFiltros Valores informados pelo usuário
 * @param {Array<object>} aCampos Definição das colunas filtráveis
 * @returns {Array<object>}
 */
export function aplicaFiltrosGrade(aLinhas, oFiltros, aCampos) {
   if (contaFiltrosAtivos(oFiltros) === 0) {
      return aLinhas;
   }

   return aLinhas.filter((oLinha) =>
      aCampos.every((oCampo) => {
         if (oCampo.sTipo === 'valor') {
            const nDe = converteTextoParaValor(oFiltros[`${oCampo.sChave}De`] ?? '');
            const nAte = converteTextoParaValor(oFiltros[`${oCampo.sChave}Ate`] ?? '');
            const nValor = Number(oLinha[oCampo.sChave] ?? 0);

            if (nDe > 0 && nValor < nDe) {
               return false;
            }
            if (nAte > 0 && nValor > nAte) {
               return false;
            }
            return true;
         }

         const sTermo = normalizaTexto(String(oFiltros[oCampo.sChave] ?? '').trim());
         if (!sTermo) {
            return true;
         }
         return normalizaTexto(String(oLinha[oCampo.sChave] ?? '')).includes(sTermo);
      })
   );
} // aplicaFiltrosGrade

/**
 * @param {object} oPropriedades
 * @param {Array<object>} oPropriedades.aCampos Colunas filtráveis
 * @param {object} oPropriedades.oFiltros Valores correntes
 * @param {(filtros: object) => void} oPropriedades.aoAlterar
 * @param {string} oPropriedades.sTitulo Nome da grade, usado no rótulo acessível
 */
export function FiltroGrade({ aCampos, oFiltros, aoAlterar, sTitulo }) {
   const [bAberto, setAberto] = useState(false);
   const oCaixa = useRef(null);
   const iAtivos = contaFiltrosAtivos(oFiltros);

   // Fecha ao clicar fora ou pressionar Esc, como os demais menus da tela
   useEffect(() => {
      if (!bAberto) {
         return;
      }

      function trataClique(oEvento) {
         if (oCaixa.current && !oCaixa.current.contains(oEvento.target)) {
            setAberto(false);
         }
      }
      function trataTecla(oEvento) {
         if (oEvento.key === 'Escape') {
            setAberto(false);
         }
      }

      document.addEventListener('mousedown', trataClique);
      document.addEventListener('keydown', trataTecla);
      return () => {
         document.removeEventListener('mousedown', trataClique);
         document.removeEventListener('keydown', trataTecla);
      };
   }, [bAberto]);

   /**
    * Altera um campo do filtro.
    * @param {string} sChave
    * @param {string} sValor
    */
   function alteraCampo(sChave, sValor) {
      aoAlterar({ ...oFiltros, [sChave]: sValor });
   } // alteraCampo

   /** Zera todos os campos de uma vez. */
   function limpa() {
      aoAlterar({});
   } // limpa

   return (
      <div className="filtro-grade" ref={oCaixa}>
         <button
            type="button"
            className={`chip-toggle ${iAtivos > 0 ? 'ligado' : ''}`}
            onClick={() => setAberto((bAtual) => !bAtual)}
            aria-expanded={bAberto}
            title={`Filtrar ${sTitulo} por qualquer campo da grade`}
         >
            <Filter size={11} />
            Filtros
            {iAtivos > 0 ? <span className="badge-filtros">{iAtivos}</span> : null}
         </button>

         {bAberto ? (
            <div className="filtro-grade-caixa" role="dialog" aria-label={`Filtros de ${sTitulo}`}>
               <header className="filtro-grade-cabecalho">
                  <span>Filtrar por campo</span>
                  <button
                     type="button"
                     className="btn-icone"
                     onClick={() => setAberto(false)}
                     title="Fechar"
                  >
                     <X size={13} />
                  </button>
               </header>

               <div className="filtro-grade-corpo">
                  {aCampos.map((oCampo) =>
                     oCampo.sTipo === 'valor' ? (
                        <div className="campo" key={oCampo.sChave}>
                           <span className="campo-rotulo">{oCampo.sRotulo}</span>
                           <div className="filtro-grade-intervalo">
                              <input
                                 type="text"
                                 className="campo-controle campo-controle-valor"
                                 placeholder="De"
                                 value={oFiltros[`${oCampo.sChave}De`] ?? ''}
                                 onChange={(oEvento) =>
                                    alteraCampo(`${oCampo.sChave}De`, oEvento.target.value)
                                 }
                              />
                              <input
                                 type="text"
                                 className="campo-controle campo-controle-valor"
                                 placeholder="Até"
                                 value={oFiltros[`${oCampo.sChave}Ate`] ?? ''}
                                 onChange={(oEvento) =>
                                    alteraCampo(`${oCampo.sChave}Ate`, oEvento.target.value)
                                 }
                              />
                           </div>
                        </div>
                     ) : (
                        <label className="campo" key={oCampo.sChave}>
                           <span className="campo-rotulo">{oCampo.sRotulo}</span>
                           <input
                              type="text"
                              className="campo-controle"
                              placeholder={oCampo.sExemplo ?? 'Contém...'}
                              value={oFiltros[oCampo.sChave] ?? ''}
                              onChange={(oEvento) => alteraCampo(oCampo.sChave, oEvento.target.value)}
                           />
                        </label>
                     )
                  )}
               </div>

               <footer className="filtro-grade-rodape">
                  <span className="filtro-grade-resumo">
                     {iAtivos === 0
                        ? 'Nenhum filtro aplicado'
                        : `${iAtivos} filtro(s) combinado(s)`}
                  </span>
                  <button
                     type="button"
                     className="btn btn-neutro btn-pequeno"
                     onClick={limpa}
                     disabled={iAtivos === 0}
                  >
                     Limpar
                  </button>
               </footer>
            </div>
         ) : null}
      </div>
   );
} // FiltroGrade
