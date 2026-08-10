'use client';
// ============================================================================
// Modal.jsx - Caixa de diálogo padrão do módulo
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Estrutura reaproveitada por todas as caixas abertas pelo menu do botão
// direito (item 6.1.3.8 do documento de visão) e pelas ações da tela.
// ============================================================================

import { useEffect } from 'react';
import { X } from 'lucide-react';

/** Larguras disponíveis, mapeadas para as classes do tema */
const LARGURAS = {
   p: 'modal-p',
   m: 'modal-m',
   g: 'modal-g',
   gg: 'modal-gg',
};

/**
 * @param {object} oPropriedades
 * @param {boolean} oPropriedades.aberto Controla a exibição da caixa
 * @param {string} oPropriedades.titulo Texto do cabeçalho
 * @param {React.ReactNode} [oPropriedades.icone] Ícone exibido antes do título
 * @param {'p'|'m'|'g'|'gg'} [oPropriedades.largura] Largura máxima
 * @param {() => void} oPropriedades.aoFechar Callback de fechamento
 * @param {React.ReactNode} oPropriedades.children Conteúdo do corpo
 * @param {React.ReactNode} [oPropriedades.rodape] Conteúdo do rodapé
 * @param {boolean} [oPropriedades.rodapeEspacado] Distribui o rodapé nas extremidades
 */
export function Modal({ aberto, titulo, icone, largura = 'm', aoFechar, children, rodape, rodapeEspacado = false }) {
   // Fecha a caixa com a tecla ESC, comportamento esperado nas telas do Satis
   useEffect(() => {
      if (!aberto) {
         return undefined;
      }

      function trataTecla(oEvento) {
         if (oEvento.key === 'Escape') {
            aoFechar();
         }
      } // trataTecla

      window.addEventListener('keydown', trataTecla);
      return () => window.removeEventListener('keydown', trataTecla);
   }, [aberto, aoFechar]);

   if (!aberto) {
      return null;
   }

   return (
      <div
         className="modal-overlay"
         role="presentation"
         onMouseDown={(oEvento) => {
            // Fecha somente quando o clique nasce fora da caixa
            if (oEvento.target === oEvento.currentTarget) {
               aoFechar();
            }
         }}
      >
         <div className={`modal ${LARGURAS[largura] ?? LARGURAS.m}`} role="dialog" aria-modal="true" aria-label={titulo}>
            <header className="modal-cabecalho">
               {icone}
               <span>{titulo}</span>
               <button type="button" className="modal-fechar" onClick={aoFechar} aria-label="Fechar">
                  <X size={16} />
               </button>
            </header>

            <div className="modal-corpo">{children}</div>

            {rodape ? (
               <footer className={`modal-rodape ${rodapeEspacado ? 'rodape-espacado' : ''}`}>{rodape}</footer>
            ) : null}
         </div>
      </div>
   );
} // Modal
