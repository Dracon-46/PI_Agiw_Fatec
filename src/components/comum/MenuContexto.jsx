'use client';
// ============================================================================
// MenuContexto.jsx - Menu do botão direito das grades
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Item 6.1.3.8 do documento de visão: "quando foco dentro de uma das grades,
// botão direito abre menu de ações: 1-Novo Lançamento, 2-Nova Transferência
// entre Contas, 3-Baixar Título, 4-Excluir Registro".
//
// O menu é posicionado no ponto do clique e se fecha ao clicar fora, ao rolar
// a página ou com ESC. Itens indisponíveis aparecem desabilitados com o motivo
// no "title", em vez de sumirem — assim o usuário entende por que não pode.
// ============================================================================

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Margem mínima entre o menu e a borda da janela */
const MARGEM_JANELA = 8;

/**
 * @param {object} oPropriedades
 * @param {{ nX: number, nY: number }|null} oPropriedades.oPosicao Ponto do clique
 * @param {Array<{ sChave: string, sRotulo: string, Icone?: Function, bDesabilitado?: boolean, sMotivo?: string, bPerigo?: boolean, bSeparadorAntes?: boolean }>} oPropriedades.aItens
 * @param {(sChave: string) => void} oPropriedades.aoEscolher
 * @param {() => void} oPropriedades.aoFechar
 */
export function MenuContexto({ oPosicao, aItens, aoEscolher, aoFechar }) {
   const oMenu = useRef(null);
   const [oAjuste, setAjuste] = useState({ nX: 0, nY: 0 });

   // Reposiciona o menu quando ele estouraria a borda da janela
   useLayoutEffect(() => {
      if (!oPosicao || !oMenu.current) {
         return;
      }

      const oCaixa = oMenu.current.getBoundingClientRect();
      const nX =
         oPosicao.nX + oCaixa.width > window.innerWidth - MARGEM_JANELA
            ? Math.max(MARGEM_JANELA, window.innerWidth - oCaixa.width - MARGEM_JANELA)
            : oPosicao.nX;
      const nY =
         oPosicao.nY + oCaixa.height > window.innerHeight - MARGEM_JANELA
            ? Math.max(MARGEM_JANELA, window.innerHeight - oCaixa.height - MARGEM_JANELA)
            : oPosicao.nY;

      setAjuste({ nX, nY });
   }, [oPosicao]);

   useEffect(() => {
      if (!oPosicao) {
         return undefined;
      }

      function trataClique(oEvento) {
         if (oMenu.current && !oMenu.current.contains(oEvento.target)) {
            aoFechar();
         }
      } // trataClique

      function trataTecla(oEvento) {
         if (oEvento.key === 'Escape') {
            aoFechar();
         }
      } // trataTecla

      document.addEventListener('mousedown', trataClique);
      document.addEventListener('keydown', trataTecla);
      // Rolar com o menu aberto o deixaria "solto" longe da linha de origem
      window.addEventListener('scroll', aoFechar, true);
      window.addEventListener('resize', aoFechar);

      return () => {
         document.removeEventListener('mousedown', trataClique);
         document.removeEventListener('keydown', trataTecla);
         window.removeEventListener('scroll', aoFechar, true);
         window.removeEventListener('resize', aoFechar);
      };
   }, [oPosicao, aoFechar]);

   if (!oPosicao) {
      return null;
   }

   return (
      <div
         className="menu-contexto"
         role="menu"
         ref={oMenu}
         style={{ left: oAjuste.nX || oPosicao.nX, top: oAjuste.nY || oPosicao.nY }}
      >
         {aItens.map((oItem) => (
            <div key={oItem.sChave}>
               {oItem.bSeparadorAntes ? <div className="menu-contexto-separador" /> : null}
               <button
                  type="button"
                  role="menuitem"
                  className={`menu-contexto-item ${oItem.bPerigo ? 'perigo' : ''}`}
                  disabled={oItem.bDesabilitado}
                  title={oItem.bDesabilitado ? oItem.sMotivo : undefined}
                  onClick={() => {
                     aoEscolher(oItem.sChave);
                     aoFechar();
                  }}
               >
                  {oItem.Icone ? <oItem.Icone size={14} /> : null}
                  {oItem.sRotulo}
               </button>
            </div>
         ))}
      </div>
   );
} // MenuContexto
