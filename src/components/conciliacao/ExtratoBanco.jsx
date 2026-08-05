'use client';
// ExtratoBanco - Projeto Banco - Ticket 37060
// Gustavo Vieira | 04/06/2026

import React from 'react';
import { Search, SlidersHorizontal, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { formataValor } from '../../utils/formatters.js';

export function ExtratoBanco({
  movimentos,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  sDataInicial,
  sDataFinal,
  onChangeDataInicial,
  onChangeDataFinal,
  onAplicarPeriodo,
  bCarregando = false,
  bankName = 'Banco',
}) {
  const [sFiltroTipo, setFiltroTipo] = React.useState('Todas');
  const [sFiltroStatus, setFiltroStatus] = React.useState('Todos');
  const [sBusca, setBusca] = React.useState('');

  const aMovimentosFiltrados = movimentos
    .map((movimento, iIndex) => ({ movimento, iIndex }))
    .filter(({ movimento }) => {
    if (sFiltroTipo === 'Entrada' && !movimento.valEntrada) return false;
    if (sFiltroTipo === 'Saída' && !movimento.valSaida) return false;
    if (sFiltroStatus === 'Conciliado' && !movimento.staConciliado) return false;
    if (sFiltroStatus === 'Não Conciliado' && movimento.staConciliado) return false;
    if (sBusca) {
      const sTermo = sBusca.toLowerCase();
      const bMatch =
        movimento.desHistorico.toLowerCase().includes(sTermo) ||
        movimento.numDocumento.toLowerCase().includes(sTermo) ||
        movimento.datMovimento.includes(sTermo);
      if (!bMatch) return false;
    }
    return true;
  });

  const bTodosSelecionados =
    aMovimentosFiltrados.length > 0 &&
    aMovimentosFiltrados.every(({ iIndex }) => selectedIds.has(iIndex));

  return (
    <div className="extrato-panel">
      <div className="extrato-header">
        <span className="extrato-title">
          EXTRATO BANCÁRIO ({bankName})
          <span className="extrato-badge">
            {bCarregando ? 'Carregando...' : `${movimentos.length} registros`}
          </span>
        </span>
      </div>

      <div className="extrato-filters">
        <div className="filter-group">
          <span className="filter-label">Período</span>
          <input
            type="text"
            className="filter-input"
            value={sDataInicial}
            onChange={(e) => onChangeDataInicial(e.target.value)}
            style={{ width: 88 }}
          />
          <span className="filter-label" style={{ color: '#9ca3af' }}>até</span>
          <input
            type="text"
            className="filter-input"
            value={sDataFinal}
            onChange={(e) => onChangeDataFinal(e.target.value)}
            style={{ width: 88 }}
          />
          <button
            className="btn-icon"
            title={`Buscar período no ${bankName}`}
            onClick={onAplicarPeriodo}
            disabled={bCarregando}
          >
            {bCarregando ? <Loader2 size={14} className="spin-icon" /> : <RefreshCw size={14} />}
          </button>
        </div>

        <div className="filter-group">
          <span className="filter-label">Tipo</span>
          <select
            className="filter-select"
            value={sFiltroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            style={{ width: 80 }}
          >
            <option>Todas</option>
            <option>Entrada</option>
            <option>Saída</option>
          </select>
        </div>

        <div className="filter-group">
          <span className="filter-label">Status</span>
          <select
            className="filter-select"
            value={sFiltroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            style={{ width: 80 }}
          >
            <option>Todos</option>
            <option>Conciliado</option>
            <option>Não Conciliado</option>
          </select>
        </div>

        <div className="search-wrapper" style={{ flex: 1 }}>
          <Search size={13} />
          <input
            type="text"
            className="filter-input"
            placeholder="Buscar no extrato"
            value={sBusca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ width: '100%', paddingLeft: 28 }}
          />
        </div>

        <button className="btn-icon" title="Filtros avançados">
          <SlidersHorizontal size={14} />
        </button>
      </div>

      <div className="extrato-table-wrapper">
        {bCarregando && movimentos.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: 40,
              color: '#6b7280',
              fontSize: 13,
            }}
          >
            <Loader2 size={16} className="spin-icon" />
            Buscando extrato no {bankName}...
          </div>
        ) : (
          <table className="extrato-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    className="custom-checkbox"
                    checked={bTodosSelecionados}
                    onChange={onToggleAll}
                  />
                </th>
                <th>Data</th>
                <th>Histórico</th>
                <th>Documento</th>
                <th style={{ textAlign: 'right' }}>Entrada (R$)</th>
                <th style={{ textAlign: 'right' }}>Saída (R$)</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {aMovimentosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#9ca3af' }}>
                    Nenhum movimento encontrado.
                  </td>
                </tr>
              ) : (
                aMovimentosFiltrados.map(({ movimento, iIndex }) => (
                    <tr
                      key={`${iIndex}-${movimento.datMovimento}-${movimento.numDocumento}`}
                      className={selectedIds.has(iIndex) ? 'selected' : ''}
                      onClick={() => onToggleSelect(iIndex)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <input
                          type="checkbox"
                          className="custom-checkbox"
                          checked={selectedIds.has(iIndex)}
                          onChange={() => onToggleSelect(iIndex)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="col-data">{movimento.datMovimento}</td>
                      <td>{movimento.desHistorico}</td>
                      <td className="col-doc">{movimento.numDocumento}</td>
                      <td className="col-valor">
                        {movimento.valEntrada ? (
                          <span className="valor-entrada">
                            {formataValor(movimento.valEntrada)}
                          </span>
                        ) : (
                          <span className="valor-dash">–</span>
                        )}
                      </td>
                      <td className="col-valor">
                        {movimento.valSaida ? (
                          <span className="valor-saida">
                            {formataValor(movimento.valSaida)}
                          </span>
                        ) : (
                          <span className="valor-dash">–</span>
                        )}
                      </td>
                      <td>
                        {movimento.staConciliado ? (
                          <span className="conciliado-icon">
                            <CheckCircle2 size={11} />
                          </span>
                        ) : (
                          <span
                            className="status-tag"
                            style={{
                              background: '#f3f4f6',
                              color: '#6b7280',
                              fontSize: '10.5px',
                              fontWeight: 600,
                              padding: '3px 8px',
                              borderRadius: 12,
                            }}
                          >
                            Não conciliado
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="pagination-row">
        <span className="pagination-info">
          Exibindo {aMovimentosFiltrados.length} de {movimentos.length} registros
        </span>
      </div>

      <style>{`
        .spin-icon {
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
