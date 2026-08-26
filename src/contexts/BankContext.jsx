'use client';
// ============================================================================
// BankContext.jsx - Contexto da conta corrente em conciliação
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Contas vêm do MySQL via API. Apenas a seleção atual fica no localStorage.
// ============================================================================

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
   atualizaContaCorrenteApi,
   buscaContasCorrentes,
   buscaSessao,
   cadastraContaCorrenteApi,
   removeContaCorrenteApi,
} from '../services/conciliacaoService.js';

const CHAVE_CONTA_SELECIONADA = 'agiw.conciliacao.contaSelecionada';

const BankContext = createContext(null);

/** Usuário sem permissão alguma, usado antes de a sessão chegar */
const SESSAO_VAZIA = { nomUsuario: '', desNome: '', desEmpresa: '', aPermissoes: [] };

/** Catálogos vazios, usados antes de a sessão chegar */
const CATALOGOS_VAZIOS = {
   aTiposDocumento: [],
   aSubgrupos: [],
   aContasContabeis: [],
   aCentrosCusto: [],
};

/**
 * @param {{ children: React.ReactNode }} oPropriedades
 */
export function BankContextProvider({ children }) {
   const [aContas, setContas] = useState([]);
   const [aProviders, setProviders] = useState([]);
   const [sCodContaSelecionada, setCodContaSelecionada] = useState(null);
   const [bCarregando, setCarregando] = useState(true);
   const [sErro, setErro] = useState('');
   const [oUsuario, setUsuario] = useState(SESSAO_VAZIA);
   const [oCatalogos, setCatalogos] = useState(CATALOGOS_VAZIOS);

   const recarregaContas = useCallback(async () => {
      const oRetorno = await buscaContasCorrentes();
      // Conta sem integração configurada não vai para a tela: sem credencial
      // não há extrato, e exibi-la só levaria o usuário a um erro de 503.
      const aConfiguradas = (oRetorno.contas ?? []).filter(
         (oConta) => oConta.bIntegracaoConfigurada
      );
      setContas(aConfiguradas);
      setProviders(oRetorno.providers ?? []);
      return aConfiguradas;
   }, []);

   useEffect(() => {
      let bAtivo = true;

      async function carregaContas() {
         try {
            // Sessão e contas chegam juntas: as duas são necessárias antes de
            // a tela desenhar, e encadeá-las só somaria latência
            const [aLista, oSessao] = await Promise.all([
               recarregaContas(),
               buscaSessao().catch((oErro) => {
                  console.error('[BankContext] Falha ao carregar a sessão:', oErro);
                  return null;
               }),
            ]);
            if (!bAtivo) {
               return;
            }

            if (oSessao) {
               setUsuario(oSessao.usuario ?? SESSAO_VAZIA);
               setCatalogos(oSessao.catalogos ?? CATALOGOS_VAZIOS);
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

   /**
    * Altera uma conta já cadastrada.
    *
    * Mudar banco, agência ou C.C. muda o código lógico da conta; quando a
    * conta alterada é a que está aberta, a seleção acompanha o novo código
    * para a tela não ficar apontando para um cadastro que deixou de existir.
    *
    * @param {string} sCodConta Código atual
    * @param {object} oDados Novos dados
    * @returns {Promise<{ ok: boolean, erro?: string, conta?: object }>}
    */
   const atualizaConta = useCallback(
      async (sCodConta, oDados) => {
         try {
            const oRetorno = await atualizaContaCorrenteApi(sCodConta, oDados);
            await recarregaContas();

            const sNovoCodigo = oRetorno.conta?.codConta;
            if (sNovoCodigo && sCodContaSelecionada === sCodConta && sNovoCodigo !== sCodConta) {
               setCodContaSelecionada(sNovoCodigo);
               window.localStorage.setItem(CHAVE_CONTA_SELECIONADA, sNovoCodigo);
            }

            return { ok: true, conta: oRetorno.conta };
         } catch (oErro) {
            return { ok: false, erro: oErro.message };
         }
      },
      [recarregaContas, sCodContaSelecionada]
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

   /**
    * Indica se o usuário corrente possui a permissão informada.
    * Serve apenas para a tela desabilitar botões e explicar o motivo: quem
    * autoriza de fato é a rota que grava.
    * @param {string} sCodPermissao
    * @returns {boolean}
    */
   const temPermissao = useCallback(
      (sCodPermissao) => oUsuario.aPermissoes.includes(sCodPermissao),
      [oUsuario]
   );

   const oValor = useMemo(
      () => ({
         aContas,
         aProviders,
         oContaSelecionada,
         sCodContaSelecionada,
         bCarregando,
         sErro,
         oUsuario,
         oCatalogos,
         temPermissao,
         selecionaConta,
         limpaSelecao,
         cadastraConta,
         atualizaConta,
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
         oUsuario,
         oCatalogos,
         temPermissao,
         selecionaConta,
         limpaSelecao,
         cadastraConta,
         atualizaConta,
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
