'use client';
// ============================================================================
// AppShell.jsx - Moldura da aplicação (menu lateral + barra superior)
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Reproduz a estrutura do protótipo: menu vertical de ações à esquerda e
// barra "Gestão Financeira" no topo, com identificação do usuário, conta
// corrente ativa (troca de banco) e saída.
// ============================================================================

import { ArrowLeftRight, Download, HelpCircle, LayoutList, LogOut, Trash2, Undo2, Wallet } from 'lucide-react';
import { ContaTopbar } from '../comum/ContaTopbar.jsx';

/** Itens do menu lateral do módulo financeiro */
const ITENS_MENU = [
   { sChave: 'baixar', sRotulo: 'Baixar', Icone: Wallet },
   { sChave: 'conciliacao', sRotulo: 'Conciliação Bancária', Icone: LayoutList },
   { sChave: 'excluir', sRotulo: 'Excluir', Icone: Trash2 },
   { sChave: 'estorno', sRotulo: 'Estorno', Icone: Undo2 },
   { sChave: 'transferir', sRotulo: 'Transferir', Icone: ArrowLeftRight },
   { sChave: 'exportar', sRotulo: 'Exportar', Icone: Download },
   { sChave: 'ajuda', sRotulo: 'Ajuda', Icone: HelpCircle },
];

/** Versão exibida no rodapé do menu, no padrão das telas do Satis */
const VERSAO_MODULO = 'Versão 2.0.0';

/**
 * @param {object} oPropriedades
 * @param {string} [oPropriedades.itemAtivo] Chave do item destacado no menu
 * @param {string} [oPropriedades.nomUsuario] Nome exibido na barra superior
 * @param {string} [oPropriedades.desEmpresa] Empresa/filial do usuário
 * @param {object|null} [oPropriedades.oConta] Conta corrente em conciliação
 * @param {() => void} [oPropriedades.aoTrocarConta] Volta à seleção de banco
 * @param {(chave: string) => void} [oPropriedades.aoSelecionarItem] Ação do menu
 * @param {() => void} [oPropriedades.aoSair] Ação do botão "Sair"
 * @param {React.ReactNode} oPropriedades.children Conteúdo da área principal
 */
export function AppShell({
   itemAtivo = 'conciliacao',
   nomUsuario = 'INFTEC',
   desEmpresa = 'AGIW SISTEMAS LTDA — Matriz',
   oConta = null,
   aoTrocarConta,
   aoSelecionarItem,
   aoSair,
   children,
}) {
   return (
      <div className="app-shell">
         <aside className="app-sidebar">
            <div className="sidebar-marca" title="Agiw Sistemas">
               <Wallet size={20} />
            </div>

            <nav className="sidebar-nav" aria-label="Menu do módulo financeiro">
               {ITENS_MENU.map(({ sChave, sRotulo, Icone }) => (
                  <button
                     key={sChave}
                     type="button"
                     className={`sidebar-item ${itemAtivo === sChave ? 'ativo' : ''}`}
                     onClick={() => aoSelecionarItem?.(sChave)}
                     aria-current={itemAtivo === sChave ? 'page' : undefined}
                  >
                     <Icone size={17} />
                     <span className="sidebar-item-rotulo">{sRotulo}</span>
                  </button>
               ))}
            </nav>

            <div className="sidebar-rodape">{VERSAO_MODULO}</div>
         </aside>

         <div className="app-main">
            <header className="app-topbar">
               <h1 className="topbar-titulo">
                  <Wallet size={17} />
                  Gestão Financeira
               </h1>

               <ContaTopbar oConta={oConta} aoTrocarConta={aoTrocarConta} />

               <div className="topbar-usuario">
                  <div>
                     <strong>Olá, {nomUsuario}</strong>
                     <span>{desEmpresa}</span>
                  </div>
               </div>

               <button type="button" className="topbar-btn" onClick={aoSair}>
                  <LogOut size={13} />
                  Sair
               </button>
            </header>

            <main className="app-content">{children}</main>
         </div>
      </div>
   );
} // AppShell
