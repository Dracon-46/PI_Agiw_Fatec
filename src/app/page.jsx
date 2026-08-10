'use client';
// app/page.jsx - Tela de seleção de banco ou redirecionamento
// Ticket 37060

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useBankContext } from '../contexts/BankContext.jsx';
import { BankSelectorPage } from '../components/bank-selector/BankSelectorPage.jsx';

export default function Page() {
   const { oContaSelecionada, bCarregando } = useBankContext();
   const router = useRouter();

   // Se já tem conta selecionada, redireciona para conciliação
   useEffect(() => {
      if (!bCarregando && oContaSelecionada) {
         router.push('/conciliacao');
      }
   }, [oContaSelecionada, bCarregando, router]);

   if (bCarregando) {
      return null;
   }

   // Mostra a tela de seleção se nenhuma conta está ativa
   if (oContaSelecionada) {
      return null;
   }

   return (
      <BankSelectorPage
         aoSelecionar={() => {
            router.push('/conciliacao');
         }}
      />
   );
}
