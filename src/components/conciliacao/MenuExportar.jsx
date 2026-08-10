'use client';
// ============================================================================
// MenuExportar.jsx - Exportação dos relatórios de conciliação
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Atende o item 6.2 do documento de visão: "existirá botão para exportar os
// extratos (bancário ou Satis) tanto para formatos de arquivos comuns como
// Excel ou pdf. Serão impressos os registros exibidos nas grades, sempre
// contendo saldo inicial, movimentos e saldo final; também deverá ser impresso
// total de entradas, saídas, total conciliado e total não conciliado".
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { montaUrlRelatorio } from '../../services/conciliacaoService.js';

/** Formatos oferecidos no menu */
const FORMATOS = [
   {
      sChave: 'xlsx',
      sRotulo: 'Excel (.xlsx)',
      sDescricao: 'Planilha com abas do sistema e do banco',
      Icone: FileSpreadsheet,
      bNovaAba: false,
   },
   {
      sChave: 'csv',
      sRotulo: 'CSV (.csv)',
      sDescricao: 'Texto separado por ponto-e-vírgula',
      Icone: FileText,
      bNovaAba: false,
   },
   {
      sChave: 'pdf',
      sRotulo: 'PDF (impressão)',
      sDescricao: 'Abre a página pronta para salvar em PDF',
      Icone: Printer,
      bNovaAba: true,
   },
];

/**
 * @param {object} oPropriedades
 * @param {string} oPropriedades.sCodConta Conta corrente conciliada
 * @param {string} oPropriedades.sDataInicio
 * @param {string} oPropriedades.sDataFim
 * @param {boolean} [oPropriedades.desabilitado]
 * @param {(texto: string, tipo?: string) => void} oPropriedades.notifica
 */
export function MenuExportar({ sCodConta, sDataInicio, sDataFim, desabilitado = false, notifica }) {
   const [bAberto, setAberto] = useState(false);
   const oContainer = useRef(null);

   // Fecha o menu ao clicar fora ou pressionar ESC
   useEffect(() => {
      if (!bAberto) {
         return undefined;
      }

      function trataClique(oEvento) {
         if (oContainer.current && !oContainer.current.contains(oEvento.target)) {
            setAberto(false);
         }
      } // trataClique

      function trataTecla(oEvento) {
         if (oEvento.key === 'Escape') {
            setAberto(false);
         }
      } // trataTecla

      document.addEventListener('mousedown', trataClique);
      document.addEventListener('keydown', trataTecla);
      return () => {
         document.removeEventListener('mousedown', trataClique);
         document.removeEventListener('keydown', trataTecla);
      };
   }, [bAberto]);

   /**
    * Dispara o download (ou a página de impressão) do formato escolhido.
    * @param {object} oFormato Item de FORMATOS
    */
   function exporta(oFormato) {
      if (!sCodConta) {
         notifica('Selecione a conta corrente antes de exportar.', 'alerta');
         return;
      }

      const sUrl = montaUrlRelatorio(sCodConta, sDataInicio, sDataFim, oFormato.sChave);

      if (oFormato.bNovaAba) {
         window.open(sUrl, '_blank', 'noopener');
      } else {
         // O atributo download deixa o navegador salvar o arquivo direto
         const oLink = document.createElement('a');
         oLink.href = sUrl;
         oLink.download = '';
         document.body.appendChild(oLink);
         oLink.click();
         document.body.removeChild(oLink);
      }

      setAberto(false);
      notifica(`Relatório em ${oFormato.sRotulo} gerado.`, 'sucesso');
   } // exporta

   return (
      <div className="menu-exportar" ref={oContainer}>
         <button
            type="button"
            className="btn btn-secundario btn-pequeno"
            onClick={() => setAberto((bAtual) => !bAtual)}
            disabled={desabilitado}
            aria-haspopup="menu"
            aria-expanded={bAberto}
         >
            <Download size={13} />
            Exportar
            <ChevronDown size={13} />
         </button>

         {bAberto ? (
            <div className="menu-exportar-lista" role="menu">
               {FORMATOS.map((oFormato) => (
                  <button
                     key={oFormato.sChave}
                     type="button"
                     className="menu-contexto-item"
                     role="menuitem"
                     onClick={() => exporta(oFormato)}
                  >
                     <oFormato.Icone size={14} />
                     <span className="menu-exportar-texto">
                        <strong>{oFormato.sRotulo}</strong>
                        <small>{oFormato.sDescricao}</small>
                     </span>
                  </button>
               ))}
            </div>
         ) : null}
      </div>
   );
} // MenuExportar
