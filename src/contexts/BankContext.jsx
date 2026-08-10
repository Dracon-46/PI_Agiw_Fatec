'use client';
// ============================================================================
// BankContext.jsx - Contexto da conta corrente em conciliação
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Contas vêm do MySQL via API. Apenas a seleção atual fica no localStorage.
// ============================================================================

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
   buscaContasCorrentes,
   cadastraContaCorrenteApi,
   removeContaCorrenteApi,
} from '../services/conciliacaoService.js';

const CHAVE_CONTA_SELECIONADA = 'agiw.conciliacao.contaSelecionada';

const BankContext = createContext(null);

/**
 * @param {{ children: React.ReactNode }} oPropriedades
 */
export function BankContextProvider({ children }) {
   const [aContas, setContas] = useState([]);
   const [aProviders, setProviders] = useState([]);
   const [sCodContaSelecionada, setCodContaSelecionada] = useState(null);
   const [bCarregando, setCarregando] = useState(true);
   const [sErro, setErro] = useState('');

   const recarregaContas = useCallback(async () => {
      const oRetorno = await buscaContasCorrentes();
      setContas(oRetorno.contas ?? []);
      setProviders(oRetorno.providers ?? []);
      return oRetorno.contas ?? [];
   }, []);

   useEffect(() => {
      let bAtivo = true;

      async function carregaContas() {
         try {
            const aLista = await recarregaContas();
            if (!bAtivo) {
               return;
            }

            const sArmazenada = window.localStorage.getItem(CHAVE_CONTA_SELECIONADA);
            const bValida = aLista.some((oConta) => oConta.codConta === sArmazenada);
            if (sArmazenada && bValida) {
               setCodContaSelecionada(sArmazenada);
            } else if (sArmazenada && !bValida) {
               window.localStorage.removeItem(CHAVE_CONTA_SELECIONADA);
            }
         } catch (oErro) {
            if (bAtivo) {
               console.error('[BankContext] Falha ao carregar contas:', oErro);
               setErro(oErro.message);
               setContas([]);
            }
         } finally {
            if (bAtivo) {
               setCarregando(false);
            }
         }
      } // carregaContas

      carregaContas();
      return () => {
         bAtivo = false;
      };
   }, [recarregaContas]);

   const selecionaConta = useCallback((sCodConta) => {
      setCodContaSelecionada(sCodConta);
      window.localStorage.setItem(CHAVE_CONTA_SELECIONADA, sCodConta);
   }, []);

   const limpaSelecao = useCallback(() => {
      setCodContaSelecionada(null);
      window.localStorage.removeItem(CHAVE_CONTA_SELECIONADA);
   }, []);

   /**
    * Cadastra conta no MySQL.
    * @param {object} oDados
    * @returns {Promise<{ ok: boolean, erro?: string, conta?: object }>}
    */
   const cadastraConta = useCallback(
      async (oDados) => {
         try {
            const oRetorno = await cadastraContaCorrenteApi(oDados);
            await recarregaContas();
            return { ok: true, conta: oRetorno.conta };
         } catch (oErro) {
            return { ok: false, erro: oErro.message };
         }
      },
      [recarregaContas]
   );

   const removeContaCadastrada = useCallback(
      async (sCodConta) => {
         try {
            await removeContaCorrenteApi(sCodConta);
            await recarregaContas();
            if (sCodContaSelecionada === sCodConta) {
               limpaSelecao();
            }
            return true;
         } catch {
            return false;
         }
      },
      [recarregaContas, sCodContaSelecionada, limpaSelecao]
   );

   const oContaSelecionada = useMemo(
      () => aContas.find((oConta) => oConta.codConta === sCodContaSelecionada) ?? null,
      [aContas, sCodContaSelecionada]
   );

   const oValor = useMemo(
      () => ({
         aContas,
         aProviders,
         oContaSelecionada,
         sCodContaSelecionada,
         bCarregando,
         sErro,
         selecionaConta,
         limpaSelecao,
         cadastraConta,
         removeContaCadastrada,
         recarregaContas,
      }),
      [
         aContas,
         aProviders,
         oContaSelecionada,
         sCodContaSelecionada,
         bCarregando,
         sErro,
         selecionaConta,
         limpaSelecao,
         cadastraConta,
         removeContaCadastrada,
         recarregaContas,
      ]
   );

   return <BankContext.Provider value={oValor}>{children}</BankContext.Provider>;
} // BankContextProvider

export function useBankContext() {
   const oContexto = useContext(BankContext);
   if (!oContexto) {
      throw new Error('useBankContext deve ser utilizado dentro de <BankContextProvider>.');
   }
   return oContexto;
} // useBankContext
