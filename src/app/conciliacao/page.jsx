'use client';
// app/conciliacao/page.jsx - Página de conciliação bancária
// Ticket 37060

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useBankContext } from '../../contexts/BankContext.jsx';
import { ConciliacaoBancariaPage } from '../../components/conciliacao/ConciliacaoBancariaPage.jsx';

export default function ConciliacaoPage() {
  const { selectedBank, loading } = useBankContext();
  const router = useRouter();

  // Se nenhum banco está selecionado, volta para seleção
  useEffect(() => {
    if (!loading && !selectedBank) {
      router.push('/');
    }
  }, [selectedBank, loading, router]);

  if (loading || !selectedBank) {
    return null;
  }

  return <ConciliacaoBancariaPage />;
}
