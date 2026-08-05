'use client';
// BankContext.jsx - Contexto React para gerenciar o banco ativo
// Ticket 37060 - Refatoração Strategy/Factory

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const BankContext = createContext(null);

/**
 * Provider de contexto que gerencia:
 * - Banco selecionado
 * - Lista de bancos disponíveis
 * - Troca de banco
 */
export function BankContextProvider({ children }) {
  const [selectedBank, setSelectedBank] = useState(null);
  const [availableBanks, setAvailableBanks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Carrega a lista de bancos disponíveis ao montar
  useEffect(() => {
    fetch('/api/bank/providers')
      .then((res) => res.json())
      .then((data) => {
        setAvailableBanks(data.providers || []);
        // Se já tem um banco na URL ou localStorage, usa ele
        const stored = typeof window !== 'undefined' ? localStorage.getItem('selectedBank') : null;
        if (stored && data.providers?.some((p) => p.slug === stored)) {
          setSelectedBank(stored);
        }
      })
      .catch((err) => {
        console.error('[BankContext] Erro ao carregar providers:', err);
        // Fallback com lista estática
        setAvailableBanks([
          { slug: 'bradesco', name: 'Bradesco', color: '#cc092f', configured: false },
          { slug: 'itau', name: 'Itaú', color: '#003399', configured: false },
          { slug: 'bb', name: 'Banco do Brasil', color: '#ffef00', configured: false },
        ]);
      })
      .finally(() => setLoading(false));
  }, []);

  const selectBank = useCallback((slug) => {
    setSelectedBank(slug);
    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedBank', slug);
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedBank(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('selectedBank');
    }
  }, []);

  const getBankInfo = useCallback(
    (slug) => {
      return availableBanks.find((b) => b.slug === slug) || null;
    },
    [availableBanks]
  );

  return (
    <BankContext.Provider
      value={{
        selectedBank,
        availableBanks,
        loading,
        selectBank,
        clearSelection,
        getBankInfo,
      }}
    >
      {children}
    </BankContext.Provider>
  );
}

/**
 * Hook para acessar o contexto do banco.
 * @returns {{ selectedBank: string|null, availableBanks: Array, loading: boolean, selectBank: function, clearSelection: function, getBankInfo: function }}
 */
export function useBankContext() {
  const context = useContext(BankContext);
  if (!context) {
    throw new Error('useBankContext deve ser usado dentro de <BankContextProvider>');
  }
  return context;
}
