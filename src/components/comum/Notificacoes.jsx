'use client';
// ============================================================================
// Notificacoes.jsx - Mensagens de retorno das operações
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Atende o item "MENSAGENS" do padrão de programação: as mensagens devem ter
// clareza e estar gramaticalmente corretas. Também garante que o retorno de
// uma transação seja exibido somente após a sua conclusão.
// ============================================================================

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

/** Tempo, em milissegundos, que a mensagem permanece visível */
const TEMPO_EXIBICAO = 5000;

/** Ícone correspondente a cada tipo de mensagem */
const ICONES = {
   sucesso: CheckCircle2,
   erro: XCircle,
   alerta: AlertTriangle,
   info: Info,
};

const NotificacoesContext = createContext(null);

/**
 * Provider responsável pela fila de mensagens exibidas na tela.
 * @param {{ children: React.ReactNode }} oPropriedades
 */
export function NotificacoesProvider({ children }) {
   const [aMensagens, setMensagens] = useState([]);

   /**
    * Remove uma mensagem da fila.
    * @param {number} iIdentificador
    */
   const removeMensagem = useCallback((iIdentificador) => {
      setMensagens((aAtuais) => aAtuais.filter((oItem) => oItem.iIdentificador !== iIdentificador));
   }, []);

   /**
    * Enfileira uma nova mensagem.
    * @param {string} sTexto Conteúdo exibido ao usuário
    * @param {'sucesso'|'erro'|'alerta'|'info'} [sTipo] Natureza da mensagem
    */
   const notifica = useCallback(
      (sTexto, sTipo = 'info') => {
         const iIdentificador = Date.now() + Math.random();
         setMensagens((aAtuais) => [...aAtuais, { iIdentificador, sTexto, sTipo }]);
         window.setTimeout(() => removeMensagem(iIdentificador), TEMPO_EXIBICAO);
      },
      [removeMensagem]
   );

   const oValor = useMemo(() => ({ notifica }), [notifica]);

   return (
      <NotificacoesContext.Provider value={oValor}>
         {children}

         <div className="toast-area" role="status" aria-live="polite">
            {aMensagens.map((oMensagem) => {
               const Icone = ICONES[oMensagem.sTipo] ?? Info;
               return (
                  <div key={oMensagem.iIdentificador} className={`toast toast-${oMensagem.sTipo}`}>
                     <Icone size={15} />
                     <span>{oMensagem.sTexto}</span>
                     <button
                        type="button"
                        className="toast-fechar"
                        onClick={() => removeMensagem(oMensagem.iIdentificador)}
                        aria-label="Fechar mensagem"
                     >
                        <X size={13} />
                     </button>
                  </div>
               );
            })}
         </div>
      </NotificacoesContext.Provider>
   );
} // NotificacoesProvider

/**
 * Hook de acesso à fila de mensagens.
 * @returns {{ notifica: (texto: string, tipo?: string) => void }}
 */
export function useNotificacoes() {
   const oContexto = useContext(NotificacoesContext);
   if (!oContexto) {
      throw new Error('useNotificacoes deve ser utilizado dentro de <NotificacoesProvider>.');
   }
   return oContexto;
} // useNotificacoes
