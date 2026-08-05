'use client';
// ExtratoERP - Projeto Banco - Ticket 37060
// Gustavo Vieira | 04/06/2026

import React, { useState } from 'react';
import { Search, SlidersHorizontal, CheckCircle2, Plus, X, Save } from 'lucide-react';
import { formataValor, retornaClasseSituacao } from '../../utils/formatters.js';

export function ExtratoERP({
  lancamentos,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onAdicionarLancamento,
}) {
  const [sFiltroTipo, setFiltroTipo] = useState('Todas');
  const [sFiltroStatus, setFiltroStatus] = useState('Todos');
  const [sDataInicial, setDataInicial] = useState('');
  const [sDataFinal, setDataFinal] = useState('');

  const [bMostrandoForm, setMostrandoForm] = useState(false);
  const [novoLanc, setNovoLanc] = useState({
    datBaixa: '',
    numDocumento: '',
    desDocumento: '',
    valEntrada: '',
    valSaida: '',
  });

  const bTodosSelecionados =
    lancamentos.length > 0 && selectedIds.size === lancamentos.length;

  const handleSalvarNovo = () => {
    if (!novoLanc.datBaixa || !novoLanc.desDocumento) return;
    
    const valIn = novoLanc.valEntrada ? parseFloat(novoLanc.valEntrada.replace(',', '.')) : null;
    const valOut = novoLanc.valSaida ? parseFloat(novoLanc.valSaida.replace(',', '.')) : null;

    onAdicionarLancamento({
      numDocumento: novoLanc.numDocumento || '-',
      datBaixa: novoLanc.datBaixa,
      desDocumento: novoLanc.desDocumento,
      valEntrada: valIn,
      valSaida: valOut,
      tipOrigem: 'Conciliação',
      staConciliado: false,
      tipSituacao: valIn ? 'A Receber' : 'A Pagar',
    });

    setNovoLanc({ datBaixa: '', numDocumento: '', desDocumento: '', valEntrada: '', valSaida: '' });
    setMostrandoForm(false);
  };

  return (
    <div className="extrato-panel">
      {/* Header */}
      <div className="extrato-header">
        <span className="extrato-title">
          EXTRATO ERP (Sistema)
          <span className="extrato-badge">{lancamentos.length} registros</span>
        </span>
        <button 
          className="btn-icon" 
          onClick={() => setMostrandoForm(!bMostrandoForm)} 
          title="Novo Lançamento Manual"
          style={{ background: '#f3f4f6', borderRadius: 4, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #e5e7eb' }}
        >
          <Plus size={14} /> <span style={{ fontSize: 12, fontWeight: 500 }}>Novo</span>
        </button>
      </div>

      {/* Filters */}
      <div className="extrato-filters">
        <div className="filter-group">
          <span className="filter-label">Período</span>
          <input
            type="text"
            className="filter-input"
            value={sDataInicial}
            onChange={(e) => setDataInicial(e.target.value)}
            style={{ width: 88 }}
          />
          <span className="filter-label" style={{ color: '#9ca3af' }}>até</span>
          <input
            type="text"
            className="filter-input"
            value={sDataFinal}
            onChange={(e) => setDataFinal(e.target.value)}
            style={{ width: 88 }}
          />
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
            placeholder="Buscar lançamento"
            style={{ width: '100%', paddingLeft: 28 }}
          />
        </div>

        <button className="btn-icon" title="Filtros avançados">
          <SlidersHorizontal size={14} />
        </button>
      </div>

      {/* Table */}
      <div className="extrato-table-wrapper">
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
              <th>Documento</th>
              <th>Descrição</th>
              <th style={{ textAlign: 'right' }}>Entrada (R$)</th>
              <th style={{ textAlign: 'right' }}>Saída (R$)</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {bMostrandoForm && (
              <tr style={{ background: '#fefce8' }}>
                <td></td>
                <td><input type="text" placeholder="DD/MM/AAAA" value={novoLanc.datBaixa} onChange={e => setNovoLanc({...novoLanc, datBaixa: e.target.value})} style={{ width: 80, padding: 4, border: '1px solid #d1d5db', borderRadius: 4 }} /></td>
                <td><input type="text" placeholder="Doc" value={novoLanc.numDocumento} onChange={e => setNovoLanc({...novoLanc, numDocumento: e.target.value})} style={{ width: 80, padding: 4, border: '1px solid #d1d5db', borderRadius: 4 }} /></td>
                <td><input type="text" placeholder="Descrição" value={novoLanc.desDocumento} onChange={e => setNovoLanc({...novoLanc, desDocumento: e.target.value})} style={{ width: '100%', padding: 4, border: '1px solid #d1d5db', borderRadius: 4 }} /></td>
                <td><input type="text" placeholder="0.00" value={novoLanc.valEntrada} onChange={e => setNovoLanc({...novoLanc, valEntrada: e.target.value})} style={{ width: 70, padding: 4, border: '1px solid #d1d5db', borderRadius: 4, textAlign: 'right' }} /></td>
                <td><input type="text" placeholder="0.00" value={novoLanc.valSaida} onChange={e => setNovoLanc({...novoLanc, valSaida: e.target.value})} style={{ width: 70, padding: 4, border: '1px solid #d1d5db', borderRadius: 4, textAlign: 'right' }} /></td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={handleSalvarNovo} style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 4, padding: 4, cursor: 'pointer' }} title="Salvar"><Save size={14} /></button>
                    <button onClick={() => setMostrandoForm(false)} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: 4, cursor: 'pointer' }} title="Cancelar"><X size={14} /></button>
                  </div>
                </td>
              </tr>
            )}
            {lancamentos.length === 0 && !bMostrandoForm ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#9ca3af' }}>
                  Nenhum lançamento no sistema. Clique em "Novo" para adicionar.
                </td>
              </tr>
            ) : lancamentos.map((lancamento, iIndex) => (
              <tr
                key={iIndex}
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
                <td className="col-data">{lancamento.datBaixa}</td>
                <td className="col-doc">{lancamento.numDocumento}</td>
                <td>{lancamento.desDocumento}</td>
                <td className="col-valor">
                  {lancamento.valEntrada ? (
                    <span className="valor-entrada">
                      {formataValor(lancamento.valEntrada)}
                    </span>
                  ) : (
                    <span className="valor-dash">–</span>
                  )}
                </td>
                <td className="col-valor">
                  {lancamento.valSaida ? (
                    <span className="valor-saida">
                      {formataValor(lancamento.valSaida)}
                    </span>
                  ) : (
                    <span className="valor-dash">–</span>
                  )}
                </td>
                <td>
                  {lancamento.staConciliado ? (
                    <span className="conciliado-icon">
                      <CheckCircle2 size={11} />
                    </span>
                  ) : (
                    <span className={`status-tag ${retornaClasseSituacao(lancamento.tipSituacao)}`}>
                      {lancamento.tipSituacao}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="pagination-row">
        <span className="pagination-info">
          Exibindo {lancamentos.length} registros
        </span>
      </div>
    </div>
  );
}
