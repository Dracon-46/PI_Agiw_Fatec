'use client';
// app/conciliacao/page.jsx - Página de conciliação bancária
// Ticket 37060

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useBankContext } from '../../contexts/BankContext.jsx';
import { ConciliacaoBancariaPage } from '../../components/conciliacao/ConciliacaoBancariaPage.jsx';

export default function ConciliacaoPage() {
   const { oContaSelecionada, bCarregando } = useBankContext();
   const router = useRouter();

   // Se nenhuma conta está selecionada, volta para seleção
   useEffect(() => {
      if (!bCarregando && !oContaSelecionada) {
         router.push('/');
      }
   }, [oContaSelecionada, bCarregando, router]);

   if (bCarregando || !oContaSelecionada) {
      return null;
   }

   return <ConciliacaoBancariaPage />;
}
