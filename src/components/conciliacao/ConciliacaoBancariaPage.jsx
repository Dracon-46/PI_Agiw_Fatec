'use client';
// ConciliacaoBancariaPage - Projeto Banco - Ticket 37060
// Gustavo Vieira | 04/06/2026 — Refatorado para multi-banco

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Upload,
  ArrowLeftRight,
  Download,
  Lock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowLeft,
} from 'lucide-react';

import { Sidebar } from './Sidebar.jsx';
import { TopBar } from './TopBar.jsx';
import { CardsResumo } from './CardsResumo.jsx';
import { ExtratoERP } from './ExtratoERP.jsx';
import { ExtratoBanco } from './ExtratoBanco.jsx';
import { PainelConciliar } from './PainelConciliar.jsx';
import { MovimentacoesPeriodo } from './MovimentacoesPeriodo.jsx';

import { lancamentosERP, movimentosPeriodo } from '../../utils/mockData.js';
import {
  buscaExtratoBanco,
  executaAutoMatch,
} from '../../services/conciliacaoService.js';
import { useBankContext } from '../../contexts/BankContext.jsx';

export function ConciliacaoBancariaPage() {
  const { selectedBank, getBankInfo, clearSelection } = useBankContext();
  const bankInfo = getBankInfo(selectedBank);
  const bankName = bankInfo?.name || selectedBank || 'Banco';

  const [selectedERP, setSelectedERP] = useState(new Set());
  const [selectedBanco, setSelectedBanco] = useState(new Set());
  const [lancamentos, setLancamentos] = useState([]);
  const [movimentos, setMovimentos] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [bCarregandoExtrato, setCarregandoExtrato] = useState(false);
  const [bAutoConciliando, setAutoConciliando] = useState(false);
  const [sDataInicio, setDataInicio] = useState('');
  const [sDataFim, setDataFim] = useState('');
  const [sErroExtrato, setErroExtrato] = useState(null);

  const numConciliados = lancamentos.filter((l) => l.staConciliado).length;
  const numPendentes = lancamentos.filter((l) => !l.staConciliado).length;
  const calcValorSelecionadoERP = useCallback(() => {
    let valEntrada = 0;
    let valSaida = 0;
    selectedERP.forEach((iIdx) => {
      const l = lancamentos[iIdx];
      if (l) {
        valEntrada += l.valEntrada ?? 0;
        valSaida += l.valSaida ?? 0;
      }
    });
    return valEntrada - valSaida;
  }, [selectedERP, lancamentos]);

  const calcValorSelecionadoBanco = useCallback(() => {
    let valEntrada = 0;
    let valSaida = 0;
    selectedBanco.forEach((iIdx) => {
      const m = movimentos[iIdx];
      if (m) {
        valEntrada += m.valEntrada ?? 0;
        valSaida += m.valSaida ?? 0;
      }
    });
    return valEntrada - valSaida;
  }, [selectedBanco, movimentos]);
  const dadosResumo = useMemo(() => {
    const valConciliadoERP = lancamentos
      .filter((l) => l.staConciliado)
      .reduce((n, l) => n + (l.valEntrada ?? 0) - (l.valSaida ?? 0), 0);
    const valPendenteERP = lancamentos
      .filter((l) => !l.staConciliado)
      .reduce((n, l) => n + Math.abs((l.valEntrada ?? 0) - (l.valSaida ?? 0)), 0);

    const valSelecionadoERP = calcValorSelecionadoERP();
    const valSelecionadoBanco = calcValorSelecionadoBanco();

    return {
      valSelecionadoERP: valSelecionadoERP,
      qtdSelecionadoERP: selectedERP.size,
      valSelecionadoBanco: valSelecionadoBanco,
      qtdSelecionadoBanco: selectedBanco.size,
      valTotalConciliado: Math.abs(valConciliadoERP),
      numLancConciliados: numConciliados,
      valTotalPendente: valPendenteERP,
      numLancPendentes: numPendentes,
    };
  }, [lancamentos, numConciliados, numPendentes, selectedERP, selectedBanco, movimentos]);

  const adicionaToast = useCallback(
    (tipToast, desMsg) => {
      const idNovo = Date.now();
      setToasts((prev) => [...prev, { id: idNovo, tipo: tipToast, mensagem: desMsg }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== idNovo));
      }, 3500);
    },
    []
  );

  const carregaExtrato = useCallback(async () => {
    if (!selectedBank || !sDataInicio || !sDataFim) return;
    setCarregandoExtrato(true);
    setErroExtrato(null);
    try {
      const oResposta = await buscaExtratoBanco(selectedBank, sDataInicio, sDataFim);
      setMovimentos(oResposta.movimentos);
      if (oResposta.movimentos.length === 0) {
        adicionaToast('info', `Nenhum movimento retornado do ${bankName} para o período.`);
      } else {
        adicionaToast('sucesso', `${oResposta.movimentos.length} movimento(s) importado(s) do ${bankName}.`);
      }
    } catch (oErro) {
      const sMsg = oErro instanceof Error ? oErro.message : 'Erro ao buscar extrato';
      setErroExtrato(sMsg);
      adicionaToast('erro', sMsg);
    } finally {
      setCarregandoExtrato(false);
    }
  }, [selectedBank, sDataInicio, sDataFim, adicionaToast, bankName]);

  useEffect(() => {
    carregaExtrato();
  }, [carregaExtrato]);

  const onToggleSelectERP = useCallback((iIndex) => {
    setSelectedERP((prev) => {
      const next = new Set(prev);
      if (next.has(iIndex)) next.delete(iIndex);
      else next.add(iIndex);
      return next;
    });
  }, []);

  const onToggleAllERP = useCallback(() => {
    setSelectedERP((prev) => {
      if (prev.size === lancamentos.length) return new Set();
      return new Set(lancamentos.map((_, i) => i));
    });
  }, [lancamentos]);

  const onToggleSelectBanco = useCallback((iIndex) => {
    setSelectedBanco((prev) => {
      const next = new Set(prev);
      if (next.has(iIndex)) next.delete(iIndex);
      else next.add(iIndex);
      return next;
    });
  }, []);

  const onToggleAllBanco = useCallback(() => {
    setSelectedBanco((prev) => {
      if (prev.size === movimentos.length) return new Set();
      return new Set(movimentos.map((_, i) => i));
    });
  }, [movimentos]);


  const onConciliar = useCallback(() => {
    if (selectedERP.size === 0 || selectedBanco.size === 0) {
      adicionaToast('erro', 'Selecione lançamentos em ambos os extratos para conciliar.');
      return;
    }

    const valDiferenca = calcValorSelecionadoERP() - calcValorSelecionadoBanco();

    if (Math.abs(valDiferenca) > 0.01) {
      adicionaToast(
        'erro',
        `Diferença de R$ ${Math.abs(valDiferenca).toFixed(2).replace('.', ',')} impede a conciliação.`
      );
      return;
    }

    const nQtd = selectedERP.size + selectedBanco.size;

    setLancamentos((prev) =>
      prev.map((l, i) =>
        selectedERP.has(i) ? { ...l, staConciliado: true, tipSituacao: 'Conciliado' } : l
      )
    );
    setMovimentos((prev) =>
      prev.map((m, i) => (selectedBanco.has(i) ? { ...m, staConciliado: true } : m))
    );

    setSelectedERP(new Set());
    setSelectedBanco(new Set());
    adicionaToast('sucesso', `${nQtd} lançamento(s) conciliado(s) com sucesso!`);
  }, [selectedERP, selectedBanco, lancamentos, movimentos, adicionaToast]);

  const onDesfazerConciliacao = useCallback(() => {
    const temConciliadoERP = Array.from(selectedERP).some((i) => lancamentos[i]?.staConciliado);
    const temConciliadoBanco = Array.from(selectedBanco).some((i) => movimentos[i]?.staConciliado);

    if (!temConciliadoERP && !temConciliadoBanco) {
      adicionaToast('info', 'Selecione lançamentos já conciliados para desfazer.');
      return;
    }

    setLancamentos((prev) =>
      prev.map((l, i) =>
        selectedERP.has(i) && l.staConciliado
          ? { ...l, staConciliado: false, tipSituacao: l.valEntrada ? 'A Receber' : 'A Pagar' }
          : l
      )
    );
    setMovimentos((prev) =>
      prev.map((m, i) =>
        selectedBanco.has(i) && m.staConciliado ? { ...m, staConciliado: false } : m
      )
    );

    setSelectedERP(new Set());
    setSelectedBanco(new Set());
    adicionaToast('info', 'Conciliação desfeita.');
  }, [selectedERP, selectedBanco, lancamentos, movimentos, adicionaToast]);

  const onAutoConciliar = useCallback(async () => {
    setAutoConciliando(true);
    try {
      const oResposta = await executaAutoMatch(lancamentos, movimentos);

      if (oResposta.grupos.length === 0) {
        adicionaToast('info', 'Nenhum match por subconjunto de soma encontrado.');
        return;
      }

      const oSetERP = new Set();
      const oSetBanco = new Set();
      oResposta.grupos.forEach((g) => {
        g.aIndicesERP.forEach((i) => oSetERP.add(i));
        oSetBanco.add(g.iIndexBanco);
      });

      setLancamentos((prev) =>
        prev.map((l, i) =>
          oSetERP.has(i) ? { ...l, staConciliado: true, tipSituacao: 'Conciliado' } : l
        )
      );
      setMovimentos((prev) =>
        prev.map((m, i) => (oSetBanco.has(i) ? { ...m, staConciliado: true } : m))
      );

      adicionaToast(
        'sucesso',
        `Auto conciliação: ${oResposta.numGrupos} grupo(s) conciliado(s) via matchReg.`
      );
    } catch (oErro) {
      adicionaToast(
        'erro',
        oErro instanceof Error ? oErro.message : 'Erro na auto conciliação'
      );
    } finally {
      setAutoConciliando(false);
    }
  }, [lancamentos, movimentos, adicionaToast]);

  const bTemSelecao = selectedERP.size > 0 || selectedBanco.size > 0;

  const onAdicionarLancamento = useCallback((novoLancamento) => {
    setLancamentos((prev) => [...prev, novoLancamento]);
  }, []);

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="app-main">
        <TopBar />

        <main className="app-content">
          <div className="page-header">
            <div className="page-title-group">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => clearSelection()}
                  style={{ padding: '4px 8px', height: 30 }}
                  title="Voltar para seleção de banco"
                >
                  <ArrowLeft size={16} />
                </button>
                <h1>Conciliação Bancária</h1>
                {bankInfo && (
                  <span
                    className="extrato-badge"
                    style={{
                      background: bankInfo.color + '18',
                      color: bankInfo.color === '#ffef00' ? '#003882' : bankInfo.color,
                      fontSize: 12,
                      padding: '4px 12px',
                    }}
                  >
                    {bankName}
                  </span>
                )}
              </div>
              <p>Concilie os lançamentos do ERP com os extratos do {bankName}.</p>
            </div>

            <div className="page-actions" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#4b5563' }}>Período:</span>
                <input
                  type="text"
                  value={sDataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  placeholder="DD/MM/AAAA"
                  style={{ width: 85, fontSize: 13, border: 'none', outline: 'none' }}
                />
                <span style={{ color: '#9ca3af', fontSize: 13 }}>até</span>
                <input
                  type="text"
                  value={sDataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                  placeholder="DD/MM/AAAA"
                  style={{ width: 85, fontSize: 13, border: 'none', outline: 'none' }}
                />
              </div>

              <button
                className="btn btn-primary"
                onClick={carregaExtrato}
                disabled={bCarregandoExtrato}
              >
                {bCarregandoExtrato ? (
                  <Loader2 size={14} className="spin-icon" />
                ) : (
                  <Upload size={14} />
                )}
                Buscar Extrato
              </button>
              <button className="btn btn-outline">
                <ArrowLeftRight size={14} />
                Transferir
              </button>
              <button className="btn btn-outline">
                <Download size={14} />
                Exportar
              </button>
              <button className="btn btn-outline">
                <Lock size={14} />
                Bloquear Período
              </button>
            </div>
          </div>

          {sErroExtrato && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fca5a5',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 16,
                fontSize: 13,
                color: '#b91c1c',
              }}
            >
              {sErroExtrato}
            </div>
          )}

          <CardsResumo dadosResumo={dadosResumo} />

          <div className="painel-conciliacao">
            <ExtratoERP
              lancamentos={lancamentos}
              selectedIds={selectedERP}
              onToggleSelect={onToggleSelectERP}
              onToggleAll={onToggleAllERP}
              onAdicionarLancamento={onAdicionarLancamento}
            />

            <PainelConciliar
              numConciliados={numConciliados}
              numPendentes={numPendentes}
              onConciliar={onConciliar}
              onDesfazer={onDesfazerConciliacao}
              onAutoConciliar={onAutoConciliar}
              bTemSelecao={bTemSelecao}
              bAutoConciliando={bAutoConciliando}
            />

            <ExtratoBanco
              movimentos={movimentos}
              selectedIds={selectedBanco}
              onToggleSelect={onToggleSelectBanco}
              onToggleAll={onToggleAllBanco}
              bCarregando={bCarregandoExtrato}
              bankName={bankName}
            />
          </div>
        </main>
      </div>

      <div className="toast-container">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: '#fff',
              border: `1px solid ${
                toast.tipo === 'sucesso'
                  ? '#bbf7d0'
                  : toast.tipo === 'erro'
                  ? '#fca5a5'
                  : '#bfdbfe'
              }`,
              borderRadius: 8,
              padding: '10px 16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
              minWidth: 280,
              maxWidth: 360,
              fontSize: 13,
              color:
                toast.tipo === 'sucesso'
                  ? '#15803d'
                  : toast.tipo === 'erro'
                  ? '#b91c1c'
                  : '#1d4ed8',
              animation: 'fadeInRight 0.2s ease',
            }}
          >
            {toast.tipo === 'sucesso' ? (
              <CheckCircle2 size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            {toast.mensagem}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes fadeInRight {
          from { opacity: 0; transform: translateX(12px); }
          to { opacity: 1; transform: translateX(0); }
        }
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
