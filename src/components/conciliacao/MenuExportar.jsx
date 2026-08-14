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
//
// Duas escolhas compõem a exportação: QUAL extrato ("bancário ou Satis") e em
// QUE formato. Os chips de situação das grades viajam junto, para que o
// arquivo contenha exatamente as linhas exibidas na tela.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import {
   ChevronDown,
   Download,
   FileSpreadsheet,
   FileText,
   Landmark,
   Layers,
   Monitor,
   Printer,
} from 'lucide-react';
import { montaUrlRelatorio } from '../../services/conciliacaoService.js';

/** Escopos oferecidos — "bancário ou Satis", conforme o item 6.2 */
const ESCOPOS = [
   { sChave: 'ambos', sRotulo: 'Os dois extratos', Icone: Layers },
   { sChave: 'sistema', sRotulo: 'Extrato do sistema (Satis)', Icone: Monitor },
   { sChave: 'banco', sRotulo: 'Extrato do banco', Icone: Landmark },
];

/** Formatos oferecidos no menu */
const FORMATOS = [
   {
      sChave: 'xlsx',
      sRotulo: 'Excel (.xlsx)',
      sDescricao: 'Uma aba por extrato, com totais',
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
 * @param {object} [oPropriedades.oFiltrosGrade] Chips de situação das grades
 * @param {boolean} [oPropriedades.desabilitado]
 * @param {(texto: string, tipo?: string) => void} oPropriedades.notifica
 */
export function MenuExportar({
   sCodConta,
   sDataInicio,
   sDataFim,
   oFiltrosGrade,
   desabilitado = false,
   aberto,
   aoAlterarAberto,
   notifica,
}) {
   const [sEscopo, setEscopo] = useState('ambos');
   const [oAncora, setAncora] = useState(null);
   const oContainer = useRef(null);
   const oBotao = useRef(null);

   const bAberto = Boolean(aberto);

   /**
    * Calcula a posição da lista a partir do botão.
    *
    * A lista é posicionada com "fixed" e coordenadas absolutas na janela
    * porque o painel que a contém usa overflow: hidden — com position
    * absolute o menu era recortado e não aparecia.
    */
   const ancora = useCallback(() => {
      if (!oBotao.current) {
         return;
      }
      const oRect = oBotao.current.getBoundingClientRect();
      setAncora({ nTopo: oRect.bottom + 4, nDireita: window.innerWidth - oRect.right });
   }, []);

   // Reposiciona sempre que abrir (inclusive quando aberto pelo menu lateral)
   useEffect(() => {
      if (bAberto) {
         ancora();
      }
   }, [bAberto, ancora]);

   // Fecha ao clicar fora, ao pressionar ESC, ao rolar ou ao redimensionar
   useEffect(() => {
      if (!bAberto) {
         return undefined;
      }

      function fecha() {
         aoAlterarAberto(false);
      } // fecha

      function trataClique(oEvento) {
         if (oContainer.current && !oContainer.current.contains(oEvento.target)) {
            fecha();
         }
      } // trataClique

      function trataTecla(oEvento) {
         if (oEvento.key === 'Escape') {
            fecha();
         }
      } // trataTecla

      document.addEventListener('mousedown', trataClique);
      document.addEventListener('keydown', trataTecla);
      // Com posição fixa, rolar a página deixaria o menu "solto" na tela
      window.addEventListener('scroll', fecha, true);
      window.addEventListener('resize', fecha);

      return () => {
         document.removeEventListener('mousedown', trataClique);
         document.removeEventListener('keydown', trataTecla);
         window.removeEventListener('scroll', fecha, true);
         window.removeEventListener('resize', fecha);
      };
   }, [bAberto, aoAlterarAberto]);

   /**
    * Dispara o download (ou a página de impressão) do formato escolhido.
    * @param {object} oFormato Item de FORMATOS
    */
   function exporta(oFormato) {
      if (!sCodConta) {
         notifica('Selecione a conta corrente antes de exportar.', 'alerta');
         return;
      }

      const sUrl = montaUrlRelatorio({
         sCodConta,
         sDataInicio,
         sDataFim,
         sFormato: oFormato.sChave,
         sEscopo,
         oFiltrosGrade,
      });

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

      aoAlterarAberto(false);

      const sEscopoRotulo = ESCOPOS.find((oItem) => oItem.sChave === sEscopo)?.sRotulo ?? '';
      notifica(`Relatório em ${oFormato.sRotulo} gerado — ${sEscopoRotulo}.`, 'sucesso');
   } // exporta

   return (
      <div className="menu-exportar" ref={oContainer}>
         <button
            type="button"
            className="btn btn-secundario btn-pequeno"
            ref={oBotao}
            onClick={() => aoAlterarAberto(!bAberto)}
            disabled={desabilitado}
            aria-haspopup="menu"
            aria-expanded={bAberto}
         >
            <Download size={13} />
            Exportar
            <ChevronDown size={13} />
         </button>

         {bAberto ? (
            <div
               className="menu-exportar-lista"
               role="menu"
               style={{ top: oAncora?.nTopo ?? 0, right: oAncora?.nDireita ?? 0 }}
            >
               <div className="menu-exportar-grupo">O que exportar</div>
               {ESCOPOS.map((oEscopo) => (
                  <button
                     key={oEscopo.sChave}
                     type="button"
                     className={`menu-contexto-item ${sEscopo === oEscopo.sChave ? 'menu-exportar-item-ativo' : ''}`}
                     role="menuitemradio"
                     aria-checked={sEscopo === oEscopo.sChave}
                     onClick={() => setEscopo(oEscopo.sChave)}
                  >
                     <oEscopo.Icone size={14} />
                     {oEscopo.sRotulo}
                  </button>
               ))}

               <div className="menu-contexto-separador" />

               <div className="menu-exportar-grupo">Formato do arquivo</div>
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
