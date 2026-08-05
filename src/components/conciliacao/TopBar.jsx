'use client';
// TopBar - Projeto Banco - Ticket 37060
// Gustavo Vieira | 04/06/2026

import React from 'react';
import { Bell, HelpCircle, User } from 'lucide-react';

export function TopBar() {
  return (
    <header className="app-topbar">
      {/* Logo / Brand */}
      <div className="topbar-logo-area">
        <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="8" fill="#1a6fdb" />
          <path
            d="M8 28L16 12L24 22L29 16L34 28H8Z"
            fill="white"
            fillOpacity="0.95"
          />
        </svg>
        <span className="topbar-logo-text">AGIW</span>
      </div>

      {/* Right Actions */}
      <div className="topbar-actions">
        <button className="topbar-icon-btn" title="Notificações">
          <Bell size={18} />
          <span className="topbar-badge">3</span>
        </button>
        <button className="topbar-icon-btn" title="Ajuda">
          <HelpCircle size={18} />
        </button>
        <button className="topbar-icon-btn" title="Perfil">
          <User size={18} />
        </button>
      </div>
    </header>
  );
}
