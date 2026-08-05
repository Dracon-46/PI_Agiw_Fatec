'use client';
// Sidebar - Projeto Banco - Ticket 37060
// Gustavo Vieira | 04/06/2026

import React from 'react';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Upload,
  Landmark,
  Lock,
  BarChart3,
  Settings,
  PanelLeftClose,
} from 'lucide-react';

const sidebarItems = [
  { icon: <LayoutDashboard size={18} />, label: 'Dashboard', bAtivo: false },
  { icon: <ArrowLeftRight size={18} />, label: 'Conciliação', bAtivo: true },
  { icon: <Upload size={18} />, label: 'Importação', bAtivo: false },
  { icon: <Landmark size={18} />, label: 'Contas Bancárias', bAtivo: false },
  { icon: <Lock size={18} />, label: 'Períodos Bloqueados', bAtivo: false },
  { icon: <BarChart3 size={18} />, label: 'Relatórios', bAtivo: false },
];

export function Sidebar() {
  return (
    <aside className="app-sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="8" fill="#1a6fdb" />
          <path
            d="M8 28L16 12L24 22L29 16L34 28H8Z"
            fill="white"
            fillOpacity="0.95"
          />
        </svg>
      </div>

      <div className="sidebar-divider" />

      {/* Navigation Items */}
      <nav className="sidebar-nav">
        {sidebarItems.map((item, iIndex) => (
          <a
            key={iIndex}
            href="#"
            className={`sidebar-item ${item.bAtivo ? 'active' : ''}`}
            title={item.label}
          >
            {item.icon}
            <span className="item-label">{item.label.split(' ')[0]}</span>
          </a>
        ))}
      </nav>

      <div className="sidebar-divider" />

      {/* Bottom Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 8px', width: '100%' }}>
        <a href="#" className="sidebar-item" title="Configurações">
          <Settings size={18} />
          <span className="item-label">Config</span>
        </a>
        <a href="#" className="sidebar-item" title="Recolher">
          <PanelLeftClose size={18} />
        </a>
      </div>
    </aside>
  );
}
