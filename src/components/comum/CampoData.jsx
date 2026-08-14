'use client';
// ============================================================================
// CampoData.jsx - Campo de data com calendário
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Todas as datas do módulo trafegam em DD/MM/AAAA (padrão das grades, dos
// relatórios e das APIs bancárias). Este campo mantém esse contrato para fora
// e, por dentro, usa o seletor nativo do navegador — que abre o calendário e
// impede a digitação de datas inexistentes.
//
// Substitui os antigos <input type="text" placeholder="DD/MM/AAAA">, onde o
// usuário precisava digitar as barras e nada impedia "31/02/2026".
// ============================================================================

import { useId } from 'react';
import { CalendarDays } from 'lucide-react';
import { converteDataBrParaIso, converteIsoParaDataBr } from '../../utils/formatters.js';

/**
 * Campo de data no padrão brasileiro, apresentado com calendário.
 *
 * @param {object} oPropriedades
 * @param {string} [oPropriedades.rotulo] Texto exibido acima do campo
 * @param {string} oPropriedades.valor Data corrente em DD/MM/AAAA (ou vazio)
 * @param {(sDataBr: string) => void} oPropriedades.aoAlterar Recebe DD/MM/AAAA
 * @param {boolean} [oPropriedades.obrigatorio] Marca o rótulo com asterisco
 * @param {string} [oPropriedades.datMinima] Menor data aceita (DD/MM/AAAA)
 * @param {string} [oPropriedades.datMaxima] Maior data aceita (DD/MM/AAAA)
 * @param {boolean} [oPropriedades.desabilitado]
 * @param {string} [oPropriedades.titulo] Dica exibida ao passar o mouse
 * @param {string} [oPropriedades.classe] Classe extra do contêiner
 */
export function CampoData({
   rotulo,
   valor,
   aoAlterar,
   obrigatorio = false,
   datMinima,
   datMaxima,
   desabilitado = false,
   titulo,
   classe = '',
}) {
   const sIdCampo = useId();

   /**
    * Converte o valor do seletor nativo (AAAA-MM-DD) de volta para DD/MM/AAAA.
    * @param {import('react').ChangeEvent<HTMLInputElement>} oEvento
    */
   function trataAlteracao(oEvento) {
      const sIso = oEvento.target.value;
      // Campo limpo pelo usuário devolve string vazia, não uma data inválida
      aoAlterar(sIso ? converteIsoParaDataBr(sIso) : '');
   } // trataAlteracao

   return (
      <label className={`campo campo-data ${classe}`} htmlFor={sIdCampo}>
         {rotulo ? (
            <span className="campo-rotulo">
               {obrigatorio ? <span className="obrigatorio">*</span> : null}
               {rotulo}
            </span>
         ) : null}

         <span className="campo-data-controle">
            <input
               id={sIdCampo}
               type="date"
               className="campo-controle"
               value={converteDataBrParaIso(valor)}
               onChange={trataAlteracao}
               min={datMinima ? converteDataBrParaIso(datMinima) : undefined}
               max={datMaxima ? converteDataBrParaIso(datMaxima) : undefined}
               disabled={desabilitado}
               title={titulo}
            />
            <CalendarDays className="campo-data-icone" size={14} aria-hidden="true" />
         </span>
      </label>
   );
} // CampoData
