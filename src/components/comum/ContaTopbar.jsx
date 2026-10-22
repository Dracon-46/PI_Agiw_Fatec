'use client';
// ============================================================================
// ContaTopbar.jsx - Conta corrente ativa + troca rápida
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Exibido no canto superior da barra "Gestão Financeira" após a escolha
// da conta (item 6.1.1), permitindo voltar à seleção de banco/agência.
// ============================================================================

import { ChevronDown, RefreshCw } from 'lucide-react';
import { MarcaBanco } from './MarcaBanco.jsx';
import { formataContaCorrente } from '../../utils/formatters.js';

/**
 * @param {object} oPropriedades
 * @param {object|null} oPropriedades.oConta Conta corrente em conciliação
 * @param {() => void} oPropriedades.aoTrocarConta Volta à tela de seleção
 */
export function ContaTopbar({ oConta, aoTrocarConta }) {
   if (!oConta) {
      return null;
   }

   return (
      <button
         type="button"
         className="topbar-conta"
         onClick={aoTrocarConta}
         title="Trocar banco / agência"
         aria-label={`Conta ativa ${oConta.nomBanco}. Clique para trocar.`}
      >
         <MarcaBanco
            codBanco={oConta.codBanco}
            corBanco={oConta.corBanco}
            corTexto={oConta.corTexto}
            nomBanco={oConta.nomBanco}
            tamanho="sm"
         />
         <span className="topbar-conta-texto">
            <strong>{oConta.nomBanco}</strong>
            <span>
               Ag. {oConta.codAgencia} · C.C. {oConta.numContaCorrente}
            </span>
         </span>
         <RefreshCw size={12} className="topbar-conta-icone" aria-hidden="true" />
         <ChevronDown size={13} aria-hidden="true" />
      </button>
   );
} // ContaTopbar
