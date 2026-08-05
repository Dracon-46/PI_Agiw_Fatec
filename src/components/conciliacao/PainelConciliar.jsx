'use client';
// PainelConciliar - Projeto Banco - Ticket 37060
// Gustavo Vieira | 04/06/2026

import React from 'react';
import {
  ArrowLeftRight,
  CheckCircle2,
  Clock,
  Zap,
  RotateCcw,
} from 'lucide-react';

export function PainelConciliar({
  numConciliados,
  numPendentes,
  onConciliar,
  onDesfazer,
  onAutoConciliar,
  bTemSelecao,
  bAutoConciliando = false,
}) {
  return (
    <div className="conciliar-center">
      {/* Main action button */}
      <button
        className="conciliar-swap-btn"
        title="Conciliar selecionados"
        onClick={onConciliar}
      >
        <ArrowLeftRight size={22} />
      </button>

      {/* Conciliar Button */}
      <button
        className="btn btn-primary btn-auto-conciliar"
        onClick={onConciliar}
        disabled={!bTemSelecao}
        style={{
          opacity: bTemSelecao ? 1 : 0.5,
          cursor: bTemSelecao ? 'pointer' : 'not-allowed',
          fontSize: '12px',
          height: 34,
        }}
      >
        <CheckCircle2 size={14} />
        Conciliar
      </button>

      {/* Count - Conciliados */}
      <div className="conciliar-count-card count-card-conciliado">
        <div className="count-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
          <CheckCircle2 size={14} />
        </div>
        <div className="count-number" style={{ color: '#16a34a' }}>
          {numConciliados}
        </div>
        <div className="count-label">Conciliados</div>
      </div>

      {/* Count - Pendentes */}
      <div className="conciliar-count-card count-card-pendente">
        <div className="count-icon" style={{ background: '#fffbeb', color: '#d97706' }}>
          <Clock size={14} />
        </div>
        <div className="count-number" style={{ color: '#d97706' }}>
          {numPendentes}
        </div>
        <div className="count-label">Pendentes</div>
      </div>

      {/* Desfazer */}
      <button
        className="btn btn-outline btn-auto-conciliar"
        onClick={onDesfazer}
        style={{ fontSize: '12px', height: 34, color: '#dc2626', borderColor: '#fca5a5' }}
      >
        <RotateCcw size={13} />
        Desfazer
      </button>

      {/* Auto Conciliar */}
      <button
        className="btn btn-ghost btn-auto-conciliar"
        onClick={onAutoConciliar}
        disabled={bAutoConciliando}
        style={{ fontSize: '12px', height: 34, opacity: bAutoConciliando ? 0.6 : 1 }}
      >
        <Zap size={13} />
        {bAutoConciliando ? 'Conciliando...' : 'Auto conciliar'}
      </button>
    </div>
  );
}
