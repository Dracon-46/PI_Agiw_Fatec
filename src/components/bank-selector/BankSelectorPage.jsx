'use client';
// BankSelectorPage - Tela de seleção de banco
// Ticket 37060 - Refatoração Strategy/Factory

import React from 'react';
import { useRouter } from 'next/navigation';
import { useBankContext } from '../../contexts/BankContext.jsx';
import { Landmark, ArrowRight, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

const BANK_ICONS = {
  bradesco: (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="12" fill="#cc092f"/>
      <path d="M12 34 L24 14 L36 34 Z" fill="white" fillOpacity="0.95"/>
    </svg>
  ),
  itau: (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="12" fill="#003399"/>
      <rect x="14" y="14" width="20" height="20" rx="10" fill="#ff6600"/>
      <rect x="20" y="20" width="8" height="8" rx="4" fill="white"/>
    </svg>
  ),
  bb: (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="12" fill="#003882"/>
      <path d="M14 24 L24 14 L34 24 L24 34 Z" fill="#ffef00"/>
    </svg>
  ),
};

export function BankSelectorPage() {
  const { availableBanks, selectBank, loading } = useBankContext();
  const router = useRouter();

  const handleSelectBank = (slug) => {
    selectBank(slug);
    router.push('/conciliacao');
  };

  if (loading) {
    return (
      <div className="bank-selector-page">
        <div className="bank-selector-loading">
          <Loader2 size={32} className="spin-icon" />
          <p>Carregando bancos disponíveis...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bank-selector-page">
      <div className="bank-selector-container">
        {/* Header */}
        <div className="bank-selector-header">
          <div className="bank-selector-logo">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect width="40" height="40" rx="8" fill="#1a6fdb" />
              <path d="M8 28L16 12L24 22L29 16L34 28H8Z" fill="white" fillOpacity="0.95" />
            </svg>
            <span className="bank-selector-brand">AGIW</span>
          </div>
          <h1 className="bank-selector-title">Conciliação Bancária</h1>
          <p className="bank-selector-subtitle">
            Selecione o banco para iniciar a conciliação
          </p>
        </div>

        {/* Bank Cards */}
        <div className="bank-cards-grid">
          {availableBanks.map((bank) => (
            <button
              key={bank.slug}
              className={`bank-card ${bank.configured ? 'bank-card-configured' : 'bank-card-disabled'}`}
              onClick={() => handleSelectBank(bank.slug)}
              style={{ '--bank-color': bank.color }}
            >
              <div className="bank-card-icon">
                {BANK_ICONS[bank.slug] || (
                  <div className="bank-card-icon-fallback">
                    <Landmark size={28} />
                  </div>
                )}
              </div>

              <div className="bank-card-info">
                <span className="bank-card-name">{bank.name}</span>
                <span className={`bank-card-status ${bank.configured ? 'status-configured' : 'status-pending'}`}>
                  {bank.configured ? (
                    <>
                      <CheckCircle2 size={12} />
                      Configurado
                    </>
                  ) : (
                    <>
                      <AlertCircle size={12} />
                      Não configurado
                    </>
                  )}
                </span>
              </div>

              <div className="bank-card-arrow">
                <ArrowRight size={18} />
              </div>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="bank-selector-footer">
          <p>Configure as credenciais no arquivo <code>.env</code> para ativar cada banco.</p>
        </div>
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
