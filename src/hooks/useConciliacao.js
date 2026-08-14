'use client';
// ============================================================================
// useConciliacao.js - Regras da tela de conciliação bancária
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Concentra o estado e as validações descritas no item 6.1.3 do documento
// de visão: filtro inicial, seleção de registros, conciliação, estorno,
// bloqueio de período e exclusão de registros.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
   baixaTitulosApi,
   buscaLancamentosSistema,
   criaTransferenciaApi,
   excluiLancamentoApi,
   excluiMovimentoApi,
   executaConciliacaoAutomatica,
   gravaBloqueioApi,
   gravaConciliacaoApi,
   importaExtratoBanco,
   incluiLancamentoApi,
} from '../services/conciliacaoService.js';
import { calculaDiferenca } from '../utils/subsetSum.js';
import { comparaDatas, formataDataBr, somaDiasData } from '../utils/formatters.js';
import {
   PERIODO_PADRAO_FIM,
   PERIODO_PADRAO_INICIO,
   temPeriodoPadraoFixo,
} from '../utils/configPeriodo.js';
import { ORIGEM_CONCILIACAO } from '../utils/mockData.js';

/** Situações possíveis da seleção corrente nas grades */
export const SELECAO_VAZIA = null;
export const SELECAO_CONCILIADA = true;
export const SELECAO_NAO_CONCILIADA = false;

/**
 * Calcula o período inicial da tela: data inicial é a data de bloqueio + 1
 * e a data final é a data do dia - 1 (item 6.1.3.2 do documento de visão).
 * Sem bloqueio cadastrado, usa os últimos 30 dias para não abrir a tela vazia.
 *
 * Quando há um período fixo configurado no .env, ele tem precedência: os
 * ambientes de homologação só respondem para janelas específicas de datas, e
 * abrir a tela na data corrente deixaria as grades vazias sem erro aparente.
 *
 * @param {string} sDatUltimoBloqueio Data do último bloqueio (DD/MM/AAAA)
 * @returns {{ sDataInicio: string, sDataFim: string }}
 */
export function calculaPeriodoInicial(sDatUltimoBloqueio) {
   if (temPeriodoPadraoFixo()) {
      return { sDataInicio: PERIODO_PADRAO_INICIO, sDataFim: PERIODO_PADRAO_FIM };
   }

   const sDataFim = somaDiasData(formataDataBr(new Date()), -1);
   const sDataInicio = sDatUltimoBloqueio
      ? somaDiasData(sDatUltimoBloqueio, 1)
      : somaDiasData(sDataFim, -30);

   // Protege contra cadastros com bloqueio à frente da data corrente
   if (!sDataInicio || comparaDatas(sDataInicio, sDataFim) > 0) {
      return { sDataInicio: sDataFim, sDataFim };
   }
   return { sDataInicio, sDataFim };
} // calculaPeriodoInicial

/**
 * Soma os valores de uma lista, separando entradas e saídas.
 * @param {Array<object>} aItens
 * @returns {{ valEntradas: number, valSaidas: number, valLiquido: number }}
 */
function somaMovimentos(aItens) {
   let nEntradas = 0;
   let nSaidas = 0;

   for (const oItem of aItens) {
      if (oItem.bEntrada) {
         nEntradas += oItem.valMovimento;
      } else {
         nSaidas += oItem.valMovimento;
      }
   }

   return { valEntradas: nEntradas, valSaidas: nSaidas, valLiquido: nEntradas - nSaidas };
} // somaMovimentos

/**
 * Hook principal da tela de conciliação.
 * @param {object|null} oConta Conta corrente selecionada
 * @param {(texto: string, tipo?: string) => void} notifica Emissor de mensagens
 */
export function useConciliacao(oConta, notifica) {
   const [sDataInicio, setDataInicio] = useState('');
   const [sDataFim, setDataFim] = useState('');
   const [datBloqueio, setDatBloqueio] = useState('');

   const [aLancamentos, setLancamentos] = useState([]);
   const [aMovimentos, setMovimentos] = useState([]);
   const [aTitulos, setTitulos] = useState([]);
   const [oSaldos, setSaldos] = useState({ valSaldoAnterior: 0, valSaldoFinal: 0 });

   const [aSelLancamentos, setSelLancamentos] = useState([]);
   const [aSelMovimentos, setSelMovimentos] = useState([]);
   const [staSelecao, setStaSelecao] = useState(SELECAO_VAZIA);

   const [bCarregando, setCarregando] = useState(false);
   const [bImportando, setImportando] = useState(false);

   // Filtros on/off do topo das grades (item 6.1.3.4) — todos ligados por padrão
   const [oFiltrosGrade, setFiltrosGrade] = useState({
      bLancConciliados: true,
      bLancNaoConciliados: true,
      bMovConciliados: true,
      bMovNaoConciliados: true,
   });

   // Preenche o período automaticamente ao abrir a tela e carrega sistema + extrato
   useEffect(() => {
      if (!oConta) {
         return;
      }
      const oPeriodo = calculaPeriodoInicial(oConta.datUltimoBloqueio);
      setDataInicio(oPeriodo.sDataInicio);
      setDataFim(oPeriodo.sDataFim);
      setDatBloqueio(oConta.datUltimoBloqueio ?? '');

      let bAtivo = true;
      (async () => {
         setCarregando(true);
         setImportando(true);
         try {
            const [oSistema, oExtrato] = await Promise.all([
               buscaLancamentosSistema(oConta.codConta, oPeriodo.sDataInicio, oPeriodo.sDataFim),
               importaExtratoBanco(oConta.slugProvider, oConta.codConta, oPeriodo.sDataInicio, oPeriodo.sDataFim),
            ]);
            if (!bAtivo) {
               return;
            }
            setLancamentos(oSistema.lancamentos ?? []);
            setTitulos(oSistema.titulos ?? []);
            setSaldos(oSistema.saldos ?? { valSaldoAnterior: 0, valSaldoFinal: 0 });
            setMovimentos(oExtrato.movimentos ?? []);
            setSelLancamentos([]);
            setSelMovimentos([]);
            setStaSelecao(SELECAO_VAZIA);

            if (oSistema.aviso) {
               notifica(oSistema.aviso, 'info');
            }
            if (oExtrato.aviso) {
               notifica(oExtrato.aviso, 'alerta');
            }
         } catch (oErro) {
            if (bAtivo) {
               notifica(oErro.message, 'erro');
            }
         } finally {
            if (bAtivo) {
               setCarregando(false);
               setImportando(false);
            }
         }
      })();

      return () => {
         bAtivo = false;
      };
   }, [oConta, notifica]);

   /** Limpa a seleção de ambas as grades. */
   const limpaSelecao = useCallback(() => {
      setSelLancamentos([]);
      setSelMovimentos([]);
      setStaSelecao(SELECAO_VAZIA);
   }, []);

   /**
    * Busca os lançamentos do sistema e o extrato já registrado no período.
    * Corresponde ao botão "Buscar" da caixa Período (item 6.1.3.2).
    */
   const buscaMovimentos = useCallback(async () => {
      if (!oConta) {
         return;
      }
      if (comparaDatas(sDataInicio, sDataFim) > 0) {
         notifica('A data inicial não pode ser posterior à data final.', 'alerta');
         return;
      }

      setCarregando(true);
      try {
         const oRetorno = await buscaLancamentosSistema(oConta.codConta, sDataInicio, sDataFim);
         setLancamentos(oRetorno.lancamentos ?? []);
         // Repovoa a grade do banco com o extrato já importado no período
         setMovimentos(oRetorno.movimentos ?? []);
         setTitulos(oRetorno.titulos ?? []);
         setSaldos(oRetorno.saldos ?? { valSaldoAnterior: 0, valSaldoFinal: 0 });
         // O bloqueio pode ter sido alterado em outra sessão; a busca é o
         // momento natural de trazer o valor corrente da base
         setDatBloqueio(oRetorno.conta?.datUltimoBloqueio ?? '');
         limpaSelecao();

         const iTotal = (oRetorno.lancamentos?.length ?? 0) + (oRetorno.movimentos?.length ?? 0);
         if (iTotal === 0) {
            notifica(
               'Nenhum lançamento ou movimento no período. Use "Importar Extrato" para buscar no banco.',
               'info'
            );
         }
      } catch (oErro) {
         notifica(oErro.message, 'erro');
      } finally {
         setCarregando(false);
      }
   }, [oConta, sDataInicio, sDataFim, notifica, limpaSelecao]);

   /**
    * Importa o extrato bancário do período (item 6.1.3.3).
    * Movimentos idênticos aos já existentes na base são ignorados.
    */
   const importaExtrato = useCallback(async () => {
      if (!oConta) {
         return;
      }

      setImportando(true);
      try {
         const oRetorno = await importaExtratoBanco(oConta.slugProvider, oConta.codConta, sDataInicio, sDataFim);
         const aImportados = oRetorno.movimentos ?? [];

         setMovimentos((aAtuais) => {
            // Chave de unicidade: data + histórico + valor + sentido
            const oExistentes = new Set(
               aAtuais.map((oItem) => `${oItem.datMovimento}|${oItem.desHistorico}|${oItem.valMovimento}|${oItem.bEntrada}`)
            );
            const aNovos = aImportados.filter(
               (oItem) => !oExistentes.has(`${oItem.datMovimento}|${oItem.desHistorico}|${oItem.valMovimento}|${oItem.bEntrada}`)
            );
            return [...aAtuais, ...aNovos];
         });

         if (oRetorno.aviso) {
            notifica(oRetorno.aviso, 'alerta');
         }
         notifica(`Extrato importado: ${aImportados.length} movimento(s) no período.`, 'sucesso');
      } catch (oErro) {
         notifica(oErro.message, 'erro');
      } finally {
         setImportando(false);
      }
   }, [oConta, sDataInicio, sDataFim, notifica]);

   /**
    * Alterna a seleção de uma linha, impedindo a mistura de status
    * conciliado/não conciliado (item 6.1.3.5).
    * @param {object} oRegistro Linha da grade
    * @param {'lancamento'|'movimento'} sGrade Grade de origem
    */
   const alternaSelecao = useCallback(
      (oRegistro, sGrade) => {
         const sCodigo = sGrade === 'lancamento' ? oRegistro.codLancamento : oRegistro.codMovimento;
         const aSelecionados = sGrade === 'lancamento' ? aSelLancamentos : aSelMovimentos;
         const fnAtualiza = sGrade === 'lancamento' ? setSelLancamentos : setSelMovimentos;
         const bJaSelecionado = aSelecionados.includes(sCodigo);

         if (bJaSelecionado) {
            const aRestantes = aSelecionados.filter((sItem) => sItem !== sCodigo);
            fnAtualiza(aRestantes);

            // Zera o status quando nenhuma linha permanece marcada
            const iTotalOutraGrade = sGrade === 'lancamento' ? aSelMovimentos.length : aSelLancamentos.length;
            if (aRestantes.length === 0 && iTotalOutraGrade === 0) {
               setStaSelecao(SELECAO_VAZIA);
            }
            return;
         }

         const bStatusRegistro = Boolean(oRegistro.staConciliado);
         if (staSelecao !== SELECAO_VAZIA && staSelecao !== bStatusRegistro) {
            notifica(
               'Não é permitido misturar registros conciliados e não conciliados na mesma seleção.',
               'alerta'
            );
            return;
         }

         setStaSelecao(bStatusRegistro);
         fnAtualiza([...aSelecionados, sCodigo]);
      },
      [aSelLancamentos, aSelMovimentos, staSelecao, notifica]
   );

   /**
    * Marca ou desmarca todos os registros visíveis de uma grade que
    * compartilham o status da seleção corrente (item 6.1.3.5).
    * @param {Array<object>} aVisiveis Registros exibidos na grade
    * @param {'lancamento'|'movimento'} sGrade
    */
   const alternaSelecaoTotal = useCallback(
      (aVisiveis, sGrade) => {
         const fnObtemCodigo = (oItem) => (sGrade === 'lancamento' ? oItem.codLancamento : oItem.codMovimento);
         const aSelecionados = sGrade === 'lancamento' ? aSelLancamentos : aSelMovimentos;
         const fnAtualiza = sGrade === 'lancamento' ? setSelLancamentos : setSelMovimentos;

         if (aSelecionados.length > 0) {
            fnAtualiza([]);
            const iTotalOutraGrade = sGrade === 'lancamento' ? aSelMovimentos.length : aSelLancamentos.length;
            if (iTotalOutraGrade === 0) {
               setStaSelecao(SELECAO_VAZIA);
            }
            return;
         }

         // Sem seleção prévia, o status é definido pela primeira linha da grade
         const bStatusAlvo = staSelecao !== SELECAO_VAZIA ? staSelecao : Boolean(aVisiveis[0]?.staConciliado);
         const aCompativeis = aVisiveis.filter((oItem) => Boolean(oItem.staConciliado) === bStatusAlvo);

         if (aCompativeis.length === 0) {
            notifica('Não há registros com o mesmo status da seleção atual.', 'alerta');
            return;
         }

         setStaSelecao(bStatusAlvo);
         fnAtualiza(aCompativeis.map(fnObtemCodigo));
      },
      [aSelLancamentos, aSelMovimentos, staSelecao, notifica]
   );

   // ---------- Registros selecionados e totalizadores ----------

   const aLancSelecionados = useMemo(
      () => aLancamentos.filter((oItem) => aSelLancamentos.includes(oItem.codLancamento)),
      [aLancamentos, aSelLancamentos]
   );

   const aMovSelecionados = useMemo(
      () => aMovimentos.filter((oItem) => aSelMovimentos.includes(oItem.codMovimento)),
      [aMovimentos, aSelMovimentos]
   );

   const oTotais = useMemo(() => {
      const oSistema = somaMovimentos(aLancSelecionados);
      const oBanco = somaMovimentos(aMovSelecionados);
      return {
         oSistema,
         oBanco,
         valDiferenca: calculaDiferenca(oSistema.valLiquido, oBanco.valLiquido),
      };
   }, [aLancSelecionados, aMovSelecionados]);

   /** Totalizadores gerais do período, exibidos no rodapé das grades */
   const oTotaisPeriodo = useMemo(() => {
      const oGeral = somaMovimentos(aLancamentos);
      const oConciliado = somaMovimentos(aLancamentos.filter((oItem) => oItem.staConciliado));
      return {
         valEntradas: oGeral.valEntradas,
         valSaidas: oGeral.valSaidas,
         valEntradasConciliadas: oConciliado.valEntradas,
         valSaidasConciliadas: oConciliado.valSaidas,
         valEntradasAConciliar: oGeral.valEntradas - oConciliado.valEntradas,
         valSaidasAConciliar: oGeral.valSaidas - oConciliado.valSaidas,
      };
   }, [aLancamentos]);

   // ---------- Conciliação e estorno ----------

   /**
    * Aplica um novo status de conciliação aos registros selecionados.
    * @param {boolean} bConciliado Status gravado nos registros
    */
   const aplicaStatusSelecao = useCallback(
      (bConciliado) => {
         setLancamentos((aAtuais) =>
            aAtuais.map((oItem) =>
               aSelLancamentos.includes(oItem.codLancamento) ? { ...oItem, staConciliado: bConciliado } : oItem
            )
         );
         setMovimentos((aAtuais) =>
            aAtuais.map((oItem) =>
               aSelMovimentos.includes(oItem.codMovimento) ? { ...oItem, staConciliado: bConciliado } : oItem
            )
         );
         limpaSelecao();
      },
      [aSelLancamentos, aSelMovimentos, limpaSelecao]
   );

   /**
    * Botão "Conciliar" (item 6.1.3.6): exige diferença zero entre as
    * somatórias dos registros não conciliados selecionados.
    */
   const concilia = useCallback(async () => {
      // Todas as validações ocorrem antes de gravar, conforme padrão de transações
      if (aSelLancamentos.length === 0 || aSelMovimentos.length === 0) {
         notifica('Selecione ao menos um lançamento do sistema e um movimento do banco.', 'alerta');
         return;
      }
      if (staSelecao === SELECAO_CONCILIADA) {
         notifica('Os registros selecionados já estão conciliados.', 'alerta');
         return;
      }
      if (oTotais.valDiferenca !== 0) {
         notifica('A diferença entre as somatórias deve ser zero para conciliar.', 'erro');
         return;
      }

      try {
         // Persiste no banco antes de refletir a mudança na tela
         const oRetorno = await gravaConciliacaoApi(
            oConta.codConta,
            aLancSelecionados,
            aMovSelecionados,
            true
         );
         aplicaStatusSelecao(true);
         notifica(oRetorno.mensagem, 'sucesso');
      } catch (oErro) {
         notifica(oErro.message, 'erro');
      }
   }, [
      oConta,
      aSelLancamentos,
      aSelMovimentos,
      aLancSelecionados,
      aMovSelecionados,
      staSelecao,
      oTotais,
      aplicaStatusSelecao,
      notifica,
   ]);

   /**
    * Botão "Desfazer Conciliação" (item 6.1.3.7): estorna os registros
    * conciliados selecionados, exigindo diferença zero.
    */
   const desfazConciliacao = useCallback(async () => {
      if (aSelLancamentos.length === 0 && aSelMovimentos.length === 0) {
         notifica('Selecione os registros conciliados que deseja estornar.', 'alerta');
         return;
      }
      if (staSelecao !== SELECAO_CONCILIADA) {
         notifica('Somente registros já conciliados podem ser estornados.', 'alerta');
         return;
      }
      if (oTotais.valDiferenca !== 0) {
         notifica('A diferença entre as somatórias deve ser zero para estornar.', 'erro');
         return;
      }

      try {
         const oRetorno = await gravaConciliacaoApi(
            oConta.codConta,
            aLancSelecionados,
            aMovSelecionados,
            false
         );
         aplicaStatusSelecao(false);
         notifica(oRetorno.mensagem, 'sucesso');
      } catch (oErro) {
         notifica(oErro.message, 'erro');
      }
   }, [
      oConta,
      aSelLancamentos,
      aSelMovimentos,
      aLancSelecionados,
      aMovSelecionados,
      staSelecao,
      oTotais,
      aplicaStatusSelecao,
      notifica,
   ]);

   /**
    * Conciliação automática (item 6.1.3.3): concilia os pares idênticos
    * e os agrupamentos cuja somatória corresponde a um movimento do banco.
    */
   const conciliaAutomaticamente = useCallback(async () => {
      setCarregando(true);
      try {
         const oRetorno = await executaConciliacaoAutomatica(aLancamentos, aMovimentos);
         const aGrupos = oRetorno.aGrupos ?? [];

         if (aGrupos.length === 0) {
            notifica(oRetorno.mensagem ?? 'Nenhuma correspondência automática localizada.', 'alerta');
            return;
         }

         const oLancConciliados = new Set(aGrupos.flatMap((oGrupo) => oGrupo.aCodLancamentos));
         const oMovConciliados = new Set(aGrupos.flatMap((oGrupo) => oGrupo.aCodMovimentos));

         // Grava o resultado no banco antes de atualizar as grades
         await gravaConciliacaoApi(
            oConta.codConta,
            aLancamentos.filter((oItem) => oLancConciliados.has(oItem.codLancamento)),
            aMovimentos.filter((oItem) => oMovConciliados.has(oItem.codMovimento)),
            true,
            true
         );

         setLancamentos((aAtuais) =>
            aAtuais.map((oItem) =>
               oLancConciliados.has(oItem.codLancamento) ? { ...oItem, staConciliado: true } : oItem
            )
         );
         setMovimentos((aAtuais) =>
            aAtuais.map((oItem) => (oMovConciliados.has(oItem.codMovimento) ? { ...oItem, staConciliado: true } : oItem))
         );
         limpaSelecao();

         notifica(
            `${aGrupos.length} correspondência(s) conciliada(s) automaticamente.`,
            'sucesso'
         );
      } catch (oErro) {
         notifica(oErro.message, 'erro');
      } finally {
         setCarregando(false);
      }
   }, [oConta, aLancamentos, aMovimentos, notifica, limpaSelecao]);

   // ---------- Bloqueio de período ----------

   /**
    * Grava a data de bloqueio da conta (item 6.1.3.1).
    *
    * A data informada deve ser anterior à data do dia. A gravação é
    * persistida em conta_corrente: antes o bloqueio existia só no estado da
    * tela e se perdia ao recarregar, deixando passar lançamentos em período
    * já fechado.
    *
    * @param {string} sNovaData Data de bloqueio (DD/MM/AAAA)
    * @returns {Promise<boolean>} true quando o bloqueio é aplicado
    */
   const aplicaBloqueio = useCallback(
      async (sNovaData) => {
         if (!oConta) {
            notifica('Selecione a conta corrente antes de bloquear o período.', 'alerta');
            return false;
         }
         if (!sNovaData) {
            notifica('Informe a data de bloqueio.', 'alerta');
            return false;
         }
         if (comparaDatas(sNovaData, formataDataBr(new Date())) >= 0) {
            notifica('A data de bloqueio deve ser anterior à data do dia.', 'erro');
            return false;
         }

         try {
            const oRetorno = await gravaBloqueioApi(oConta.codConta, sNovaData);
            setDatBloqueio(oRetorno.datUltimoBloqueio);
            notifica(oRetorno.mensagem, 'sucesso');
            return true;
         } catch (oErro) {
            notifica(oErro.message, 'erro');
            return false;
         }
      },
      [oConta, notifica]
   );

   /** Remove o bloqueio da conta (item 6.1.3.1). */
   const removeBloqueio = useCallback(async () => {
      if (!oConta) {
         return false;
      }

      try {
         const oRetorno = await gravaBloqueioApi(oConta.codConta, '');
         setDatBloqueio('');
         notifica(oRetorno.mensagem, 'sucesso');
         return true;
      } catch (oErro) {
         notifica(oErro.message, 'erro');
         return false;
      }
   }, [oConta, notifica]);

   /**
    * Indica se uma data está dentro do período bloqueado.
    * @param {string} sData
    * @returns {boolean}
    */
   const estaBloqueada = useCallback(
      (sData) => Boolean(datBloqueio) && comparaDatas(sData, datBloqueio) <= 0,
      [datBloqueio]
   );

   // ---------- Inclusão e exclusão de registros ----------

   /**
    * Inclui um lançamento gerado pela própria conciliação
    * (ações 1 e 2 do menu do botão direito).
    * @param {object} oLancamento Registro já normalizado
    */
   const incluiLancamento = useCallback(
      async (oLancamento) => {
         if (!oConta) {
            notifica('Selecione a conta corrente antes de lançar.', 'alerta');
            return false;
         }

         try {
            const oRetorno = await incluiLancamentoApi(oConta.codConta, oLancamento);
            setLancamentos((aAtuais) => [...aAtuais, oRetorno.lancamento]);
            notifica(oRetorno.mensagem, 'sucesso');
            return true;
         } catch (oErro) {
            notifica(oErro.message, 'erro');
            return false;
         }
      },
      [oConta, notifica]
   );

   /**
    * Exclui um registro das grades (ação 4 do menu do botão direito).
    * Registros conciliados não podem ser excluídos; na grade de lançamentos
    * somente os originados na própria conciliação são elimináveis.
    * @param {object} oRegistro
    * @param {'lancamento'|'movimento'} sGrade
    */
   const excluiRegistro = useCallback(
      async (oRegistro, sGrade) => {
         // Validações locais antes de acionar o servidor
         if (oRegistro.staConciliado) {
            notifica('Registro conciliado não pode ser excluído. Estorne a conciliação antes.', 'erro');
            return;
         }
         if (estaBloqueada(oRegistro.datMovimento)) {
            notifica('O período do registro está bloqueado para alterações.', 'erro');
            return;
         }
         if (sGrade === 'lancamento' && oRegistro.tipOrigem !== ORIGEM_CONCILIACAO) {
            notifica(
               `Somente lançamentos com origem "${ORIGEM_CONCILIACAO}" podem ser excluídos (origem atual: ${oRegistro.tipOrigem}).`,
               'erro'
            );
            return;
         }

         // Movimentos do banco também são excluídos no MySQL: antes a remoção
         // valia só na sessão e o registro voltava ao clicar em Buscar
         if (sGrade !== 'lancamento') {
            try {
               const oRetorno = await excluiMovimentoApi(oConta.codConta, oRegistro.codMovimento);
               setMovimentos((aAtuais) =>
                  aAtuais.filter((oItem) => oItem.codMovimento !== oRegistro.codMovimento)
               );
               limpaSelecao();
               notifica(oRetorno.mensagem, 'sucesso');
            } catch (oErro) {
               notifica(oErro.message, 'erro');
            }
            return;
         }

         try {
            const oRetorno = await excluiLancamentoApi(oConta.codConta, oRegistro.codLancamento);

            setLancamentos((aAtuais) =>
               // Excluir uma perna de transferência remove o par inteiro
               oRetorno.codTransferencia
                  ? aAtuais.filter((oItem) => oItem.codTransferencia !== oRetorno.codTransferencia)
                  : aAtuais.filter((oItem) => oItem.codLancamento !== oRegistro.codLancamento)
            );
            limpaSelecao();
            notifica(oRetorno.mensagem, 'sucesso');
         } catch (oErro) {
            notifica(oErro.message, 'erro');
         }
      },
      [oConta, estaBloqueada, limpaSelecao, notifica]
   );

   /**
    * Gera uma transferência entre contas (item 6.1.3.8 — ação 2).
    * @param {object} oTransferencia Dados informados na caixa
    * @returns {Promise<boolean>} true quando a transferência é gravada
    */
   const criaTransferencia = useCallback(
      async (oTransferencia) => {
         try {
            const oRetorno = await criaTransferenciaApi(oTransferencia);

            // Só a perna da conta aberta entra na grade; a contrapartida
            // aparece quando a outra conta for selecionada
            const oPernaLocal =
               oRetorno.lancamentoSaida.codConta === oConta?.codConta
                  ? oRetorno.lancamentoSaida
                  : oRetorno.lancamentoEntrada.codConta === oConta?.codConta
                    ? oRetorno.lancamentoEntrada
                    : null;

            if (oPernaLocal) {
               setLancamentos((aAtuais) => [...aAtuais, oPernaLocal]);
            }

            notifica(oRetorno.mensagem, 'sucesso');
            return true;
         } catch (oErro) {
            notifica(oErro.message, 'erro');
            return false;
         }
      },
      [oConta, notifica]
   );

   /**
    * Baixa um ou mais títulos, gerando os lançamentos no extrato do sistema
    * (item 6.1.3.8 — ação 3).
    * @param {Array<object>} aBaixas Títulos com data e valores informados
    * @returns {Promise<boolean>} true quando as baixas são gravadas
    */
   const baixaTitulos = useCallback(
      async (aBaixas) => {
         if (!oConta) {
            notifica('Selecione a conta corrente antes de baixar títulos.', 'alerta');
            return false;
         }

         try {
            const oRetorno = await baixaTitulosApi(oConta.codConta, aBaixas);
            setLancamentos((aAtuais) => [...aAtuais, ...(oRetorno.lancamentos ?? [])]);

            // Os títulos baixados saem da relação de títulos em aberto
            const oBaixados = new Set(aBaixas.map((oItem) => oItem.codTitulo));
            setTitulos((aAtuais) => aAtuais.filter((oItem) => !oBaixados.has(oItem.codTitulo)));

            limpaSelecao();
            notifica(oRetorno.mensagem, 'sucesso');
            return true;
         } catch (oErro) {
            notifica(oErro.message, 'erro');
            return false;
         }
      },
      [oConta, limpaSelecao, notifica]
   );

   /**
    * Marca lançamentos e movimentos como conciliados após a associação
    * manual de títulos (2ª parte da conciliação).
    * @param {object} oMovimento Movimento do banco associado
    * @param {object} oLancamentoGerado Lançamento criado a partir dos títulos
    */
   const associaLancamento = useCallback(
      (oMovimento, oLancamentoGerado) => {
         setLancamentos((aAtuais) => [...aAtuais, { ...oLancamentoGerado, staConciliado: true }]);
         setMovimentos((aAtuais) =>
            aAtuais.map((oItem) =>
               oItem.codMovimento === oMovimento.codMovimento ? { ...oItem, staConciliado: true } : oItem
            )
         );
         limpaSelecao();
         notifica('Lançamento associado e conciliado com sucesso.', 'sucesso');
      },
      [limpaSelecao, notifica]
   );

   return {
      // Período e bloqueio
      sDataInicio,
      sDataFim,
      datBloqueio,
      setDataInicio,
      setDataFim,
      aplicaBloqueio,
      removeBloqueio,
      estaBloqueada,

      // Dados
      aLancamentos,
      aMovimentos,
      aTitulos,
      oSaldos,
      bCarregando,
      bImportando,

      // Seleção
      aSelLancamentos,
      aSelMovimentos,
      aLancSelecionados,
      aMovSelecionados,
      staSelecao,
      alternaSelecao,
      alternaSelecaoTotal,
      limpaSelecao,

      // Totalizadores
      oTotais,
      oTotaisPeriodo,

      // Filtros das grades
      oFiltrosGrade,
      setFiltrosGrade,

      // Ações
      buscaMovimentos,
      importaExtrato,
      concilia,
      desfazConciliacao,
      conciliaAutomaticamente,
      incluiLancamento,
      criaTransferencia,
      baixaTitulos,
      excluiRegistro,
      associaLancamento,
   };
} // useConciliacao
