'use client';
// app/page.jsx - Tela de seleção de banco ou redirecionamento
// Ticket 37060

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useBankContext } from '../contexts/BankContext.jsx';
import { BankSelectorPage } from '../components/bank-selector/BankSelectorPage.jsx';

export default function Page() {
  const { selectedBank } = useBankContext();
  const router = useRouter();

  // Se já tem banco selecionado, redireciona para conciliação
  useEffect(() => {
    if (selectedBank) {
      router.push('/conciliacao');
    }
  }, [selectedBank, router]);

  // Mostra a tela de seleção se nenhum banco está ativo
  if (selectedBank) {
    return null; // Será redirecionado
  }

  return <BankSelectorPage />;
}
