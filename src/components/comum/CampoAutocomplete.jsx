'use client';
// ============================================================================
// CampoAutocomplete.jsx - Campo de pesquisa com sugestões
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Ata de 24/09/2026: "permitir pesquisa de documentos com autocomplete".
//
// A ata pede para verificar se o PrimeNG já oferece o componente. O PrimeNG é
// biblioteca do Angular e este módulo é React (Next.js); o equivalente seria o
// PrimeReact, que não faz parte do projeto. Trazer uma biblioteca de
// componentes inteira por dois controles (este e a ordenação da grade) não
// compensa, então o campo é próprio e segue o visual dos demais.
//
// Teclado: setas percorrem as sugestões, Enter escolhe, Esc fecha.
// ============================================================================

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { normalizaTexto } from '../../utils/formatters.js';

/** Máximo de sugestões exibidas de uma vez */
const MAX_SUGESTOES = 50;

/**
 * @param {object} oPropriedades
 * @param {string} [oPropriedades.rotulo] Texto exibido acima do campo
 * @param {boolean} [oPropriedades.obrigatorio] Marca o rótulo com asterisco
 * @param {Array<{ sValor: string, sRotulo: string }>} oPropriedades.aOpcoes
 * @param {string} oPropriedades.valor Valor selecionado (sValor da opção)
 * @param {(sValor: string) => void} oPropriedades.aoAlterar
 * @param {string} [oPropriedades.placeholder]
 * @param {boolean} [oPropriedades.desabilitado]
 * @param {string} [oPropriedades.titulo] Dica exibida ao passar o mouse
 */
export function CampoAutocomplete({
   rotulo,
   obrigatorio = false,
   aOpcoes,
   valor,
   aoAlterar,
   placeholder = 'Digite para pesquisar',
   desabilitado = false,
   titulo,
}) {
   const sIdLista = useId();
   const oCampoRef = useRef(null);
   const oSelecionada = useMemo(
      () => (aOpcoes ?? []).find((oOpcao) => oOpcao.sValor === valor) ?? null,
      [aOpcoes, valor]
   );

   const [sTexto, setTexto] = useState(oSelecionada?.sRotulo ?? '');
   const [bAberto, setAberto] = useState(false);
   const [iDestaque, setDestaque] = useState(0);

   // Valor trocado por fora (abertura da caixa, movimento base) reflete no texto
   useEffect(() => {
      setTexto(oSelecionada?.sRotulo ?? '');
   }, [oSelecionada]);

   const aSugestoes = useMemo(() => {
      const sBusca = normalizaTexto(sTexto);
      // Com a opção já escolhida no campo, mostra a lista inteira ao abrir
      if (!sBusca || sTexto === oSelecionada?.sRotulo) {
         return (aOpcoes ?? []).slice(0, MAX_SUGESTOES);
      }
      return (aOpcoes ?? [])
         .filter((oOpcao) => normalizaTexto(oOpcao.sRotulo).includes(sBusca))
         .slice(0, MAX_SUGESTOES);
   }, [aOpcoes, sTexto, oSelecionada]);

   // Clique fora fecha a lista e devolve o texto da opção escolhida
   useEffect(() => {
      if (!bAberto) {
         return undefined;
      }
      function trataCliqueFora(oEvento) {
         if (oCampoRef.current && !oCampoRef.current.contains(oEvento.target)) {
            setAberto(false);
            setTexto(oSelecionada?.sRotulo ?? '');
         }
      } // trataCliqueFora
      document.addEventListener('mousedown', trataCliqueFora);
      return () => document.removeEventListener('mousedown', trataCliqueFora);
   }, [bAberto, oSelecionada]);

   /**
    * Confirma uma sugestão.
    * @param {{ sValor: string, sRotulo: string }} oOpcao
    */
   function escolhe(oOpcao) {
      setTexto(oOpcao.sRotulo);
      setAberto(false);
      aoAlterar(oOpcao.sValor);
   } // escolhe

   /** Limpa a escolha. */
   function limpa() {
      setTexto('');
      setAberto(false);
      aoAlterar('');
   } // limpa

   /**
    * Navegação pelo teclado.
    * @param {import('react').KeyboardEvent<HTMLInputElement>} oEvento
    */
   function trataTecla(oEvento) {
      if (oEvento.key === 'ArrowDown') {
         oEvento.preventDefault();
         setAberto(true);
         setDestaque((iAtual) => Math.min(iAtual + 1, aSugestoes.length - 1));
      } else if (oEvento.key === 'ArrowUp') {
         oEvento.preventDefault();
         setDestaque((iAtual) => Math.max(iAtual - 1, 0));
      } else if (oEvento.key === 'Enter' && bAberto && aSugestoes[iDestaque]) {
         oEvento.preventDefault();
         escolhe(aSugestoes[iDestaque]);
      } else if (oEvento.key === 'Escape') {
         setAberto(false);
         setTexto(oSelecionada?.sRotulo ?? '');
      }
   } // trataTecla

   return (
      <div className="campo campo-autocomplete" ref={oCampoRef}>
         {rotulo ? (
            <span className="campo-rotulo">
               {obrigatorio ? <span className="obrigatorio">*</span> : null}
               {rotulo}
            </span>
         ) : null}

         <span className="campo-autocomplete-controle">
            <Search className="campo-autocomplete-icone" size={13} aria-hidden="true" />
            <input
               type="text"
               className="campo-controle"
               role="combobox"
               aria-expanded={bAberto}
               aria-controls={sIdLista}
               aria-autocomplete="list"
               placeholder={placeholder}
               value={sTexto}
               disabled={desabilitado}
               title={titulo}
               onFocus={() => setAberto(true)}
               onChange={(oEvento) => {
                  setTexto(oEvento.target.value);
                  setDestaque(0);
                  setAberto(true);
               }}
               onKeyDown={trataTecla}
            />
            {valor && !desabilitado ? (
               <button
                  type="button"
                  className="campo-autocomplete-limpar"
                  onClick={limpa}
                  aria-label="Limpar"
                  title="Limpar"
               >
                  <X size={12} />
               </button>
            ) : null}
         </span>

         {bAberto && !desabilitado ? (
            <ul className="campo-autocomplete-lista" id={sIdLista} role="listbox">
               {aSugestoes.length === 0 ? (
                  <li className="campo-autocomplete-vazio">Nenhum resultado para &quot;{sTexto}&quot;.</li>
               ) : (
                  aSugestoes.map((oOpcao, iPos) => (
                     <li
                        key={oOpcao.sValor}
                        role="option"
                        aria-selected={oOpcao.sValor === valor}
                        className={`${iPos === iDestaque ? 'destaque' : ''} ${
                           oOpcao.sValor === valor ? 'selecionada' : ''
                        }`}
                        // mousedown, e não click: o click chega depois do blur
                        onMouseDown={(oEvento) => {
                           oEvento.preventDefault();
                           escolhe(oOpcao);
                        }}
                        onMouseEnter={() => setDestaque(iPos)}
                     >
                        {oOpcao.sRotulo}
                     </li>
                  ))
               )}
            </ul>
         ) : null}
      </div>
   );
} // CampoAutocomplete
