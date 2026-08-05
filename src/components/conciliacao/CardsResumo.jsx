'use client';
// CardsResumo - Projeto Banco - Ticket 37060
// Gustavo Vieira | 04/06/2026

import React from 'react';
import { Monitor, Landmark, CheckCircle2, Clock } from 'lucide-react';
import { formataMoeda } from '../../utils/formatters.js';

export function CardsResumo({ dadosResumo }) {
  return (
    <div className="cards-resumo">
      {/* Saldo Inicial ERP */}
      <div className="card-resumo">
        <div className="card-resumo-icon erp">
          <Monitor />
        </div>
        <div className="card-resumo-info">
          <div className="card-resumo-label">Selecionado (ERP)</div>
          <div className="card-resumo-valor">
            {formataMoeda(dadosResumo.valSelecionadoERP)}
          </div>
          <div className="card-resumo-sub">
            {dadosResumo.qtdSelecionadoERP} selecionados
          </div>
        </div>
      </div>

      {/* Saldo Inicial Banco */}
      <div className="card-resumo">
        <div className="card-resumo-icon banco">
          <Landmark />
        </div>
        <div className="card-resumo-info">
          <div className="card-resumo-label">Selecionado (Banco)</div>
          <div className="card-resumo-valor">
            {formataMoeda(dadosResumo.valSelecionadoBanco)}
          </div>
          <div className="card-resumo-sub">
            {dadosResumo.qtdSelecionadoBanco} selecionados
          </div>
        </div>
      </div>

      {/* Conciliado */}
      <div className="card-resumo">
        <div className="card-resumo-icon conciliado">
          <CheckCircle2 />
        </div>
        <div className="card-resumo-info">
          <div className="card-resumo-label">Conciliado</div>
          <div className="card-resumo-valor conciliado">
            {formataMoeda(dadosResumo.valTotalConciliado)}
          </div>
          <div className="card-resumo-sub">
            {dadosResumo.numLancConciliados} lançamentos
          </div>
        </div>
      </div>

      {/* Pendente */}
      <div className="card-resumo">
        <div className="card-resumo-icon pendente">
          <Clock />
        </div>
        <div className="card-resumo-info">
          <div className="card-resumo-label">Pendente</div>
          <div className="card-resumo-valor pendente">
            {formataMoeda(dadosResumo.valTotalPendente)}
          </div>
          <div className="card-resumo-sub">
            {dadosResumo.numLancPendentes} lançamentos
          </div>
        </div>
      </div>
    </div>
  );
}
