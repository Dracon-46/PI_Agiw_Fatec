'use client';
// MovimentacoesPeriodo - Projeto Banco - Ticket 37060
// Gustavo Vieira | 04/06/2026

import React from 'react';
import { Eye, MoreVertical } from 'lucide-react';
import { formataValor, retornaClasseSituacao } from '../../utils/formatters.js';

export function MovimentacoesPeriodo({ movimentos }) {
  return (
    <div className="movimentacoes-panel">
      {/* Header */}
      <div className="movimentacoes-header">
        <h2>MOVIMENTAÇÕES DO PERÍODO</h2>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table className="movimentacoes-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Documento</th>
              <th>Descrição</th>
              <th>Tipo</th>
              <th style={{ textAlign: 'right' }}>Entrada (R$)</th>
              <th style={{ textAlign: 'right' }}>Saída (R$)</th>
              <th style={{ textAlign: 'right' }}>Saldo (R$)</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}></th>
            </tr>
          </thead>
          <tbody>
            {movimentos.map((mov, iIndex) => (
              <tr key={iIndex}>
                <td style={{ whiteSpace: 'nowrap' }}>{mov.datMovimento}</td>
                <td
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {mov.numDocumento}
                </td>
                <td>{mov.desDocumento}</td>
                <td>
                  <span
                    className={`status-tag ${retornaClasseSituacao(mov.tipMovimento)}`}
                  >
                    {mov.tipMovimento}
                  </span>
                </td>
                <td className="col-valor">
                  {mov.valEntrada ? (
                    <span className="valor-entrada">
                      {formataValor(mov.valEntrada)}
                    </span>
                  ) : (
                    <span className="valor-dash">–</span>
                  )}
                </td>
                <td className="col-valor">
                  {mov.valSaida ? (
                    <span className="valor-saida">
                      {formataValor(mov.valSaida)}
                    </span>
                  ) : (
                    <span className="valor-dash">–</span>
                  )}
                </td>
                <td
                  className="col-valor"
                  style={{
                    color: mov.valSaldo < 0 ? '#dc2626' : '#111827',
                    fontWeight: 600,
                  }}
                >
                  {formataValor(mov.valSaldo)}
                </td>
                <td>
                  <span
                    className={`status-tag ${
                      mov.staStatus === 'Conciliado'
                        ? 'tag-conciliado'
                        : 'tag-pendente'
                    }`}
                  >
                    {mov.staStatus}
                  </span>
                </td>
                <td>
                  <div className="row-actions">
                    <button className="btn-icon" title="Visualizar">
                      <Eye size={13} />
                    </button>
                    <button className="btn-icon" title="Mais opções">
                      <MoreVertical size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="table-footer">
        <span className="pagination-info">
          Exibindo {movimentos.length} registros
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="per-page-select">
            <span>10 por página</span>
            <select>
              <option>10</option>
              <option>25</option>
              <option>50</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
