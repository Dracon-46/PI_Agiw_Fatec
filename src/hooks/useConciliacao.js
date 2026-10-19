'use client';
// ============================================================================
// useConciliacao.js - Regras da tela de conciliação bancária
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Concentra o estado e as validações descritas no item 6.1.3 do documento
// de visão: filtro inicial, seleção de registros, conciliação, estorno,
// bloqueio de período e exclusão de registros.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
   alteraLancamentoApi,
   buscaLancamentosSistema,
   criaTransferenciaApi,
   excluiLancamentoApi,
   executaConciliacaoAutomatica,
   gravaBloqueioApi,
   gravaConciliacaoApi,
   buscaExtratoBanco,
   incluiLancamentoApi,
} from '../services/conciliacaoService.js';
import { calculaDiferenca } from '../utils/subsetSum.js';
import { comparaDatas, formataDataBr, somaDiasData } from '../utils/formatters.js';
import {
   PERIODO_PADRAO_FIM,
   PERIODO_PADRAO_INICIO,
   temPeriodoPadraoFixo,
} from '../utils/configPeriodo.js';
import { ORIGEM_CONCILIACAO, ORIGEM_TRANSFERENCIA } from '../utils/origens.js';

/**
 * Origens que a tela pode alterar e excluir: as nascidas na própria
 * conciliação. A transferência entra aqui — excluí-la remove as duas pontas.
 */
const ORIGENS_EDITAVEIS = [ORIGEM_CONCILIACAO, ORIGEM_TRANSFERENCIA];

/**
 * Período máximo, em dias, aceito na busca da conciliação.
 *
 * Conferir mais de dois meses de extrato de uma vez não é operação de
 * conciliação, é relatório — e o custo cai no gateway do banco, que cobra por
 * janela consultada e impõe os próprios limites (31 dias no BB).
 */
export const MAX_DIAS_PERIODO = 60;

/**
 * Indica se o intervalo ultrapassa o período máximo permitido.
 * @param {string} sDataInicio DD/MM/AAAA
 * @param {string} sDataFim DD/MM/AAAA
 * @returns {boolean}
 */
export function excedePeriodoMaximo(sDataInicio, sDataFim) {
   const iMilissegundos = comparaDatas(sDataFim, sDataInicio);
   if (!Number.isFinite(iMilissegundos)) {
      return false;
   }
   // +1 porque o intervalo inclui as duas pontas
   return Math.floor(iMilissegundos / 86400000) + 1 > MAX_DIAS_PERIODO;
} // excedePeriodoMaximo

/** Situações possíveis da seleção corrente nas grades */
export const SELECAO_VAZIA = null;
export const SELECAO_CONCILIADA = true;
export const SELECAO_NAO_CONCILIADA = false;
/** Seleção com registros conciliados e não conciliados ao mesmo tempo */
export const SELECAO_MISTA = 'mista';

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
 * Monta uma linha de somatória: sistema, banco e a diferença entre eles.
 *
 * O item 6.1.2 pede duas linhas — uma para os selecionados conciliados e
 * outra para os não conciliados —, "incluindo a diferença" em cada uma.
 *
 * @param {Array<object>} aLancamentos Lançamentos selecionados da linha
 * @param {Array<object>} aMovimentos Movimentos selecionados da linha
 * @returns {{ oSistema: object, oBanco: object, valDiferenca: number, iQuantidade: number }}
 */
function montaLinhaSomatoria(aLancamentos, aMovimentos) {
   const oSistema = somaMovimentos(aLancamentos);
   const oBanco = somaMovimentos(aMovimentos);

   return {
      oSistema,
      oBanco,
      valDiferenca: calculaDiferenca(oSistema.valLiquido, oBanco.valLiquido),
      iQuantidade: aLancamentos.length + aMovimentos.length,
   };
} // montaLinhaSomatoria

/**
 * Chave de correspondência entre um lançamento e um movimento do banco:
 * data, valor e sentido, como pede o item 6.1.3.3.
 * @param {object} oRegistro
 * @returns {string}
 */
function chaveCorrespondencia(oRegistro) {
   return `${oRegistro.datMovimento}|${oRegistro.valMovimento}|${oRegistro.bEntrada ? 'E' : 'S'}`;
} // chaveCorrespondencia

/**
 * Casa movimentos e lançamentos não conciliados que tenham data e valor
 * idênticos, um para um.
 *
 * Item 6.1.3.3: "Ao concluir a importação, realizar a seleção automática de
 * movimentos e lançamentos que possuam data e valor idênticos."
 *
 * Só entram registros NÃO conciliados: o item 6.1.3.5 proíbe misturar status
 * na mesma seleção, e conciliar de novo o que já está conciliado não faz
 * sentido. O pareamento é um-para-um — dois lançamentos de mesmo valor não
 * podem casar com o mesmo movimento.
 *
 * @param {Array<object>} aLancamentos
 * @param {Array<object>} aMovimentos
 * @returns {{ aCodLancamentos: string[], aCodMovimentos: string[] }}
 */
function casaPorDataEValor(aLancamentos, aMovimentos) {
   const oDisponiveis = new Map();

   for (const oLancamento of aLancamentos) {
      if (oLancamento.staConciliado) {
         continue;
      }
      const sChave = chaveCorrespondencia(oLancamento);
      if (!oDisponiveis.has(sChave)) {
         oDisponiveis.set(sChave, []);
      }
      oDisponiveis.get(sChave).push(oLancamento.codLancamento);
   }

   const aCodLancamentos = [];
   const aCodMovimentos = [];

   for (const oMovimento of aMovimentos) {
      if (oMovimento.staConciliado) {
         continue;
      }
      const aFila = oDisponiveis.get(chaveCorrespondencia(oMovimento));
      if (!aFila || aFila.length === 0) {
         continue;
      }

      aCodLancamentos.push(aFila.shift());
      aCodMovimentos.push(oMovimento.codMovimento);
   }

   return { aCodLancamentos, aCodMovimentos };
} // casaPorDataEValor

/**
 * Hook principal da tela de conciliação.
 * @param {object|null} oConta Conta corrente selecionada
 * @param {(texto: string, tipo?: string) => void} notifica Emissor de mensagens
 * @param {(sCodConta: string, oAlteracao: object) => void} [atualizaContaLocal]
 *        Reflete na lista de contas o que foi gravado (bloqueio de período)
 */
export function useConciliacao(oConta, notifica, atualizaContaLocal) {
   const [sDataInicio, setDataInicio] = useState('');
   const [sDataFim, setDataFim] = useState('');
   const [datBloqueio, setDatBloqueio] = useState('');

   const [aLancamentos, setLancamentos] = useState([]);
   const [aMovimentos, setMovimentos] = useState([]);
   const [oSaldos, setSaldos] = useState({ valSaldoAnterior: 0, valSaldoFinal: 0 });

   const [aSelLancamentos, setSelLancamentos] = useState([]);
   const [aSelMovimentos, setSelMovimentos] = useState([]);

   const [bCarregando, setCarregando] = useState(false);
   const [bImportando, setImportando] = useState(false);

   // Filtros on/off do topo das grades (item 6.1.3.4) — todos ligados por padrão
   const [oFiltrosGrade, setFiltrosGrade] = useState({
      bLancConciliados: true,
      bLancNaoConciliados: true,
      bMovConciliados: true,
      bMovNaoConciliados: true,
   });

   // A carga inicial acompanha a TROCA de conta, não cada atualização do
   // objeto: gravar o bloqueio atualiza a conta na lista, e isso não pode
   // recarregar as grades nem devolver o período ao padrão
   const oContaRef = useRef(oConta);
   oContaRef.current = oConta;
   const sCodContaAtual = oConta?.codConta ?? '';

   // Preenche o período automaticamente ao abrir a tela e carrega sistema + extrato
   useEffect(() => {
      const oConta = oContaRef.current;
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
               // Só o que já está gravado: abrir a tela ou trocar de conta não
               // pode esperar a instituição responder. Um período ainda não
               // consultado leva mais de um segundo por conta, e o usuário
               // paga isso a cada troca. A ida à API fica no botão Buscar.
               buscaExtratoBanco(
                  oConta.slugProvider,
                  oConta.codConta,
                  oPeriodo.sDataInicio,
                  oPeriodo.sDataFim,
                  true
               ),
            ]);
            if (!bAtivo) {
               return;
            }
            const aLancamentosLidos = oSistema.lancamentos ?? [];
            const aMovimentosLidos = oExtrato.movimentos ?? [];

            setLancamentos(aLancamentosLidos);
            setSaldos(oSistema.saldos ?? { valSaldoAnterior: 0, valSaldoFinal: 0 });
            setMovimentos(aMovimentosLidos);

            // Item 6.1.3.3: os pares de mesma data e valor já entram marcados
            const oPares = casaPorDataEValor(aLancamentosLidos, aMovimentosLidos);
            setSelLancamentos(oPares.aCodLancamentos);
            setSelMovimentos(oPares.aCodMovimentos);

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
   }, [sCodContaAtual, notifica]);

   /** Limpa a seleção de ambas as grades. */
   const limpaSelecao = useCallback(() => {
      setSelLancamentos([]);
      setSelMovimentos([]);
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
      if (excedePeriodoMaximo(sDataInicio, sDataFim)) {
         notifica(
            `O período da conciliação é limitado a ${MAX_DIAS_PERIODO} dias. ` +
               'Reduza o intervalo e busque novamente.',
            'alerta'
         );
         return;
      }

      setCarregando(true);
      try {
         // Os lançamentos vêm da nossa base; o extrato, sempre da API do banco
         const [oRetorno, oExtrato] = await Promise.all([
            buscaLancamentosSistema(oConta.codConta, sDataInicio, sDataFim),
            buscaExtratoBanco(oConta.slugProvider, oConta.codConta, sDataInicio, sDataFim).catch(
               (oErro) => {
                  notifica(oErro.message, 'alerta');
                  return { movimentos: [] };
               }
            ),
         ]);

         const aLancamentosLidos = oRetorno.lancamentos ?? [];
         const aMovimentosLidos = oExtrato.movimentos ?? [];

         setLancamentos(aLancamentosLidos);
         setMovimentos(aMovimentosLidos);
         setSaldos(oRetorno.saldos ?? { valSaldoAnterior: 0, valSaldoFinal: 0 });
         // O bloqueio pode ter sido alterado em outra sessão; a busca é o
         // momento natural de trazer o valor corrente da base
         setDatBloqueio(oRetorno.conta?.datUltimoBloqueio ?? '');

         const oPares = casaPorDataEValor(aLancamentosLidos, aMovimentosLidos);
         setSelLancamentos(oPares.aCodLancamentos);
         setSelMovimentos(oPares.aCodMovimentos);

         if (aLancamentosLidos.length + aMovimentosLidos.length === 0) {
            notifica(
               'Nenhum lançamento ou movimento no período.',
               'info'
            );
         }
      } catch (oErro) {
         notifica(oErro.message, 'erro');
      } finally {
         setCarregando(false);
      }
   }, [oConta, sDataInicio, sDataFim, notifica]);

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
         const oRetorno = await buscaExtratoBanco(oConta.slugProvider, oConta.codConta, sDataInicio, sDataFim);
         const aImportados = oRetorno.movimentos ?? [];

         // O extrato é o retorno vivo da API: a grade passa a ser exatamente
         // o que o banco devolveu, sem acumular leituras anteriores
         setMovimentos(aImportados);

         // Item 6.1.3.3: concluída a importação, seleciona automaticamente os
         // pares de movimento e lançamento com data e valor idênticos
         const { aCodLancamentos, aCodMovimentos } = casaPorDataEValor(aLancamentos, aImportados);

         if (aCodMovimentos.length > 0) {
            setSelLancamentos(aCodLancamentos);
            setSelMovimentos(aCodMovimentos);
         } else {
            limpaSelecao();
         }

         if (oRetorno.aviso) {
            notifica(oRetorno.aviso, 'alerta');
         }
         notifica(
            `Extrato importado: ${aImportados.length} movimento(s).` +
               (aCodMovimentos.length > 0
                  ? ` ${aCodMovimentos.length} par(es) de mesma data e valor já vieram selecionados.`
                  : ''),
            'sucesso'
         );
      } catch (oErro) {
         notifica(oErro.message, 'erro');
      } finally {
         setImportando(false);
      }
   }, [oConta, sDataInicio, sDataFim, aLancamentos, notifica, limpaSelecao]);

   /**
    * Alterna a seleção de uma linha.
    *
    * Ata de 24/09/2026: conciliados e não conciliados podem ser selecionados
    * ao mesmo tempo. As duas linhas de somatória (item 6.1.2) separam cada
    * grupo com a sua diferença; "Conciliar" age só sobre os não conciliados
    * da seleção e "Estorno" só sobre os conciliados.
    *
    * @param {object} oRegistro Linha da grade
    * @param {'lancamento'|'movimento'} sGrade Grade de origem
    */
   const alternaSelecao = useCallback((oRegistro, sGrade) => {
      const sCodigo = sGrade === 'lancamento' ? oRegistro.codLancamento : oRegistro.codMovimento;
      const fnAtualiza = sGrade === 'lancamento' ? setSelLancamentos : setSelMovimentos;

      fnAtualiza((aAtuais) =>
         aAtuais.includes(sCodigo) ? aAtuais.filter((sItem) => sItem !== sCodigo) : [...aAtuais, sCodigo]
      );
   }, []);

   /**
    * Marca ou desmarca todos os registros visíveis de uma grade.
    * Com algum registro da grade marcado, desmarca; senão, marca todos os
    * visíveis — conciliados e não conciliados.
    * @param {Array<object>} aVisiveis Registros exibidos na grade
    * @param {'lancamento'|'movimento'} sGrade
    */
   const alternaSelecaoTotal = useCallback(
      (aVisiveis, sGrade) => {
         const fnObtemCodigo = (oItem) => (sGrade === 'lancamento' ? oItem.codLancamento : oItem.codMovimento);
         const aSelecionados = sGrade === 'lancamento' ? aSelLancamentos : aSelMovimentos;
         const fnAtualiza = sGrade === 'lancamento' ? setSelLancamentos : setSelMovimentos;

         fnAtualiza(aSelecionados.length > 0 ? [] : aVisiveis.map(fnObtemCodigo));
      },
      [aSelLancamentos, aSelMovimentos]
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

   /**
    * Situação da seleção: vazia, só conciliados, só não conciliados ou mista.
    * Colore o cabeçalho da grade e orienta as mensagens.
    */
   const staSelecao = useMemo(() => {
      const aTodos = [...aLancSelecionados, ...aMovSelecionados];
      if (aTodos.length === 0) {
         return SELECAO_VAZIA;
      }
      if (aTodos.every((oItem) => oItem.staConciliado)) {
         return SELECAO_CONCILIADA;
      }
      if (aTodos.every((oItem) => !oItem.staConciliado)) {
         return SELECAO_NAO_CONCILIADA;
      }
      return SELECAO_MISTA;
   }, [aLancSelecionados, aMovSelecionados]);

   /**
    * Somatórias da seleção em duas linhas (item 6.1.2): uma para os
    * selecionados já conciliados e outra para os não conciliados, cada uma
    * com a sua diferença.
    *
    * Com a seleção mista (ata de 24/09/2026), as duas linhas podem estar
    * preenchidas ao mesmo tempo; cada ação usa a diferença da sua linha.
    */
   const oTotais = useMemo(() => {
      const oConciliados = montaLinhaSomatoria(
         aLancSelecionados.filter((oItem) => oItem.staConciliado),
         aMovSelecionados.filter((oItem) => oItem.staConciliado)
      );
      const oNaoConciliados = montaLinhaSomatoria(
         aLancSelecionados.filter((oItem) => !oItem.staConciliado),
         aMovSelecionados.filter((oItem) => !oItem.staConciliado)
      );

      // Diferença da linha ativa — é ela que trava Conciliar e Desfazer
      const oAtiva = oConciliados.iQuantidade > 0 ? oConciliados : oNaoConciliados;

      return {
         oConciliados,
         oNaoConciliados,
         // Mantidos na raiz: o restante da tela e os relatórios já os usam
         oSistema: montaLinhaSomatoria(aLancSelecionados, aMovSelecionados).oSistema,
         oBanco: montaLinhaSomatoria(aLancSelecionados, aMovSelecionados).oBanco,
         valDiferenca: oAtiva.valDiferenca,
      };
   }, [aLancSelecionados, aMovSelecionados]);

   /**
    * Totalizadores do período de cada grade (item 6.1.2: "ambos os extratos
    * possuem saldo anterior, entradas e saídas no período e saldo final").
    */
   const oTotaisPeriodo = useMemo(() => {
      const oGeral = somaMovimentos(aLancamentos);
      const oConciliado = somaMovimentos(aLancamentos.filter((oItem) => oItem.staConciliado));
      const oBancoGeral = somaMovimentos(aMovimentos);
      const oBancoConciliado = somaMovimentos(aMovimentos.filter((oItem) => oItem.staConciliado));

      return {
         valEntradas: oGeral.valEntradas,
         valSaidas: oGeral.valSaidas,
         valEntradasConciliadas: oConciliado.valEntradas,
         valSaidasConciliadas: oConciliado.valSaidas,
         valEntradasAConciliar: oGeral.valEntradas - oConciliado.valEntradas,
         valSaidasAConciliar: oGeral.valSaidas - oConciliado.valSaidas,
         oBanco: {
            valEntradas: oBancoGeral.valEntradas,
            valSaidas: oBancoGeral.valSaidas,
            valEntradasConciliadas: oBancoConciliado.valEntradas,
            valSaidasConciliadas: oBancoConciliado.valSaidas,
         },
      };
   }, [aLancamentos, aMovimentos]);

   /**
    * Saldos de cada lado da tela (item 6.1.2).
    * O saldo anterior vem da API; entradas, saídas e saldo final são somados
    * a partir do que está na grade.
    */
   const oSaldosPorLado = useMemo(
      () => ({
         oSistema: {
            valSaldoAnterior: oSaldos.valSaldoAnterior ?? 0,
            valEntradas: oTotaisPeriodo.valEntradas,
            valSaidas: oTotaisPeriodo.valSaidas,
            valSaldoFinal:
               (oSaldos.valSaldoAnterior ?? 0) +
               oTotaisPeriodo.valEntradas -
               oTotaisPeriodo.valSaidas,
         },
         oBanco: {
            valSaldoAnterior: oSaldos.valSaldoAnteriorBanco ?? 0,
            valEntradas: oTotaisPeriodo.oBanco.valEntradas,
            valSaidas: oTotaisPeriodo.oBanco.valSaidas,
            valSaldoFinal:
               (oSaldos.valSaldoAnteriorBanco ?? 0) +
               oTotaisPeriodo.oBanco.valEntradas -
               oTotaisPeriodo.oBanco.valSaidas,
         },
      }),
      [oSaldos, oTotaisPeriodo]
   );

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
            atualizaContaLocal?.(oConta.codConta, { datUltimoBloqueio: oRetorno.datUltimoBloqueio });
            notifica(oRetorno.mensagem, 'sucesso');
            return true;
         } catch (oErro) {
            notifica(oErro.message, 'erro');
            return false;
         }
      },
      [oConta, notifica, atualizaContaLocal]
   );

   /** Remove o bloqueio da conta (item 6.1.3.1). */
   const removeBloqueio = useCallback(async () => {
      if (!oConta) {
         return false;
      }

      try {
         const oRetorno = await gravaBloqueioApi(oConta.codConta, '');
         setDatBloqueio('');
         atualizaContaLocal?.(oConta.codConta, { datUltimoBloqueio: '' });
         notifica(oRetorno.mensagem, 'sucesso');
         return true;
      } catch (oErro) {
         notifica(oErro.message, 'erro');
         return false;
      }
   }, [oConta, notifica, atualizaContaLocal]);

   /**
    * Indica se uma data está dentro do período bloqueado.
    * @param {string} sData
    * @returns {boolean}
    */
   const estaBloqueada = useCallback(
      (sData) => Boolean(datBloqueio) && comparaDatas(sData, datBloqueio) <= 0,
      [datBloqueio]
   );

   /**
    * Descreve os registros selecionados que caem em período fechado.
    *
    * O bloqueio do item 6.1.3.1 vale também para conciliar e estornar: as duas
    * operações alteram o resultado de um período já encerrado. A rota confere
    * de novo com as datas da base — aqui é para o usuário saber antes de
    * clicar, e ver quais linhas estão travando.
    *
    * @param {Array<object>} [aLanc] Lançamentos a conferir; padrão é a seleção
    * @param {Array<object>} [aMov] Movimentos a conferir; padrão é a seleção
    * @returns {string} Mensagem de impedimento, ou string vazia
    */
   const verificaSelecaoBloqueada = useCallback((aLanc = aLancSelecionados, aMov = aMovSelecionados) => {
      if (!datBloqueio) {
         return '';
      }

      // A mensagem cita o DOCUMENTO, não a chave: no ERP a chave do lançamento
      // é composta (documento + série + emitente + desdobro…) e o código que
      // a tela usa para marcar a linha é essa chave inteira — ilegível em um
      // aviso. O número do documento é o que o usuário reconhece na grade.
      const aBloqueados = [
         ...aLanc
            .filter((oItem) => estaBloqueada(oItem.datMovimento))
            .map((oItem) => `${oItem.numDocumento || oItem.codLancamento} (${oItem.datMovimento})`),
         ...aMov
            .filter((oItem) => estaBloqueada(oItem.datMovimento))
            .map((oItem) => `${oItem.numDocumento || oItem.codMovimento} (${oItem.datMovimento})`),
      ];

      if (aBloqueados.length === 0) {
         return '';
      }

      return (
         `A conta está bloqueada até ${datBloqueio} e ${aBloqueados.length} registro(s) ` +
         `da seleção estão nesse período: ${aBloqueados.slice(0, 3).join(', ')}` +
         (aBloqueados.length > 3 ? ` e mais ${aBloqueados.length - 3}.` : '.') +
         ' Remova o bloqueio ou retire esses registros da seleção.'
      );
   }, [datBloqueio, aLancSelecionados, aMovSelecionados, estaBloqueada]);

   // ---------- Conciliação e estorno ----------

   /**
    * Aplica um novo status de conciliação aos registros informados e retira
    * da seleção só eles — o restante da seleção mista continua marcado.
    * @param {boolean} bConciliado Status gravado nos registros
    * @param {Array<object>} aLancAfetados Lançamentos gravados
    * @param {Array<object>} aMovAfetados Movimentos gravados
    */
   const aplicaStatusSelecao = useCallback((bConciliado, aLancAfetados, aMovAfetados) => {
      const oCodLanc = new Set(aLancAfetados.map((oItem) => oItem.codLancamento));
      const oCodMov = new Set(aMovAfetados.map((oItem) => oItem.codMovimento));

      setLancamentos((aAtuais) =>
         aAtuais.map((oItem) => (oCodLanc.has(oItem.codLancamento) ? { ...oItem, staConciliado: bConciliado } : oItem))
      );
      setMovimentos((aAtuais) =>
         aAtuais.map((oItem) => (oCodMov.has(oItem.codMovimento) ? { ...oItem, staConciliado: bConciliado } : oItem))
      );
      setSelLancamentos((aAtuais) => aAtuais.filter((sCodigo) => !oCodLanc.has(sCodigo)));
      setSelMovimentos((aAtuais) => aAtuais.filter((sCodigo) => !oCodMov.has(sCodigo)));
   }, []);

   /**
    * Botão "Conciliar" (item 6.1.3.6): concilia os NÃO conciliados da
    * seleção, exigindo diferença zero na linha de somatória deles. Os
    * conciliados que estiverem marcados junto ficam como estão.
    */
   const concilia = useCallback(async () => {
      const aLancPendentes = aLancSelecionados.filter((oItem) => !oItem.staConciliado);
      const aMovPendentes = aMovSelecionados.filter((oItem) => !oItem.staConciliado);

      // Todas as validações ocorrem antes de gravar, conforme padrão de transações
      if (aLancPendentes.length === 0 || aMovPendentes.length === 0) {
         notifica(
            staSelecao === SELECAO_CONCILIADA
               ? 'Os registros selecionados já estão conciliados. Use "Estorno" para desfazer antes de conciliar novamente.'
               : 'Selecione ao menos um lançamento do sistema e um movimento do banco não conciliados.',
            'alerta'
         );
         return;
      }
      if (oTotais.oNaoConciliados.valDiferenca !== 0) {
         notifica('A diferença entre as somatórias dos não conciliados deve ser zero para conciliar.', 'erro');
         return;
      }

      // Item 6.1.3.1: período fechado não aceita conciliação
      const sBloqueio = verificaSelecaoBloqueada(aLancPendentes, aMovPendentes);
      if (sBloqueio) {
         notifica(sBloqueio, 'erro');
         return;
      }

      try {
         // Persiste no banco antes de refletir a mudança na tela
         const oRetorno = await gravaConciliacaoApi(oConta.codConta, aLancPendentes, aMovPendentes, true);
         aplicaStatusSelecao(true, aLancPendentes, aMovPendentes);
         notifica(
            oRetorno.mensagem +
               (staSelecao === SELECAO_MISTA ? ' Os registros já conciliados da seleção não foram alterados.' : ''),
            'sucesso'
         );
      } catch (oErro) {
         notifica(oErro.message, 'erro');
      }
   }, [
      oConta,
      aLancSelecionados,
      aMovSelecionados,
      staSelecao,
      oTotais,
      aplicaStatusSelecao,
      verificaSelecaoBloqueada,
      notifica,
   ]);

   /**
    * Botão "Desfazer Conciliação" (item 6.1.3.7): estorna os CONCILIADOS da
    * seleção, exigindo diferença zero na linha de somatória deles.
    */
   const desfazConciliacao = useCallback(async () => {
      const aLancConciliados = aLancSelecionados.filter((oItem) => oItem.staConciliado);
      const aMovConciliados = aMovSelecionados.filter((oItem) => oItem.staConciliado);

      if (aLancConciliados.length === 0 && aMovConciliados.length === 0) {
         notifica('Selecione os registros conciliados que deseja estornar.', 'alerta');
         return;
      }
      if (oTotais.oConciliados.valDiferenca !== 0) {
         notifica('A diferença entre as somatórias dos conciliados deve ser zero para estornar.', 'erro');
         return;
      }

      // Item 6.1.3.1: reabrir uma conciliação em período fechado alteraria um
      // mês já encerrado — a trava vale para o estorno tanto quanto para a
      // conciliação
      const sBloqueio = verificaSelecaoBloqueada(aLancConciliados, aMovConciliados);
      if (sBloqueio) {
         notifica(sBloqueio, 'erro');
         return;
      }

      try {
         const oRetorno = await gravaConciliacaoApi(oConta.codConta, aLancConciliados, aMovConciliados, false);
         aplicaStatusSelecao(false, aLancConciliados, aMovConciliados);
         notifica(
            oRetorno.mensagem +
               (staSelecao === SELECAO_MISTA ? ' Os registros não conciliados da seleção não foram alterados.' : ''),
            'sucesso'
         );
      } catch (oErro) {
         notifica(oErro.message, 'erro');
      }
   }, [
      oConta,
      aLancSelecionados,
      aMovSelecionados,
      staSelecao,
      oTotais,
      aplicaStatusSelecao,
      verificaSelecaoBloqueada,
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

         // Item 6.1.3.1: grupos que tocam o período fechado ficam de fora.
         // O grupo é indivisível — conciliar só metade dele deixaria a outra
         // metade órfã, sem contrapartida —, então basta uma ponta bloqueada
         // para o grupo inteiro ser descartado.
         const oLancPorCodigo = new Map(aLancamentos.map((oItem) => [oItem.codLancamento, oItem]));
         const oMovPorCodigo = new Map(aMovimentos.map((oItem) => [oItem.codMovimento, oItem]));

         const aGruposLivres = aGrupos.filter((oGrupo) => {
            const bTocaBloqueio =
               oGrupo.aCodLancamentos.some((sCodigo) =>
                  estaBloqueada(oLancPorCodigo.get(sCodigo)?.datMovimento)
               ) ||
               oGrupo.aCodMovimentos.some((sCodigo) =>
                  estaBloqueada(oMovPorCodigo.get(sCodigo)?.datMovimento)
               );
            return !bTocaBloqueio;
         });

         const iBloqueados = aGrupos.length - aGruposLivres.length;

         if (aGruposLivres.length === 0) {
            notifica(
               `As ${aGrupos.length} correspondência(s) localizada(s) estão em período ` +
                  `bloqueado (até ${datBloqueio}). Remova o bloqueio para conciliá-las.`,
               'alerta'
            );
            return;
         }

         const oLancConciliados = new Set(aGruposLivres.flatMap((oGrupo) => oGrupo.aCodLancamentos));
         const oMovConciliados = new Set(aGruposLivres.flatMap((oGrupo) => oGrupo.aCodMovimentos));

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
            `${aGruposLivres.length} correspondência(s) conciliada(s) automaticamente.` +
               (iBloqueados > 0
                  ? ` ${iBloqueados} ficaram de fora por estarem em período bloqueado até ${datBloqueio}.`
                  : ''),
            iBloqueados > 0 ? 'alerta' : 'sucesso'
         );
      } catch (oErro) {
         notifica(oErro.message, 'erro');
      } finally {
         setCarregando(false);
      }
   }, [oConta, aLancamentos, aMovimentos, datBloqueio, estaBloqueada, notifica, limpaSelecao]);

   // ---------- Inclusão e exclusão de registros ----------

   /**
    * Inclui um lançamento gerado pela própria conciliação
    * (ações 1 e 2 do menu do botão direito).
    *
    * A caixa permite escolher outra conta (filtro de bancos pelo documento);
    * nesse caso o lançamento é gravado lá e não entra na grade aberta.
    *
    * @param {object} oLancamento Registro já normalizado
    * @param {string} [sCodConta] Conta do lançamento; padrão é a conta aberta
    */
   const incluiLancamento = useCallback(
      async (oLancamento, sCodConta) => {
         if (!oConta) {
            notifica('Selecione a conta corrente antes de lançar.', 'alerta');
            return false;
         }

         const sContaDestino = sCodConta || oConta.codConta;
         try {
            const oRetorno = await incluiLancamentoApi(sContaDestino, oLancamento);
            if (sContaDestino === oConta.codConta) {
               setLancamentos((aAtuais) => [...aAtuais, oRetorno.lancamento]);
            }
            notifica(
               oRetorno.mensagem +
                  (sContaDestino === oConta.codConta ? '' : ' O lançamento foi gravado em outra conta.'),
               'sucesso'
            );
            return true;
         } catch (oErro) {
            notifica(oErro.message, 'erro');
            return false;
         }
      },
      [oConta, notifica]
   );

   /**
    * Altera um lançamento originado na conciliação (ata de 24/09/2026).
    * @param {string} sCodLancamento
    * @param {object} oDados Dados informados na caixa de edição
    * @returns {Promise<boolean>} true quando a alteração é gravada
    */
   const alteraLancamento = useCallback(
      async (sCodLancamento, oDados) => {
         if (!oConta) {
            return false;
         }
         if (estaBloqueada(oDados.datMovimento)) {
            notifica(`A conta está bloqueada para lançamentos até ${datBloqueio}. Informe uma data posterior.`, 'erro');
            return false;
         }

         try {
            const oRetorno = await alteraLancamentoApi(oConta.codConta, sCodLancamento, oDados);
            const oAlterado = oRetorno.lancamento;

            setLancamentos((aAtuais) =>
               aAtuais.map((oItem) => (oItem.codLancamento === sCodLancamento ? { ...oItem, ...oAlterado } : oItem))
            );
            notifica(oRetorno.mensagem, 'sucesso');
            return true;
         } catch (oErro) {
            notifica(oErro.message, 'erro');
            return false;
         }
      },
      [oConta, datBloqueio, estaBloqueada, notifica]
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
         // A transferência também nasce nesta tela; a rota exclui as duas
         // pontas juntas, nos dois bancos
         if (sGrade === 'lancamento' && !ORIGENS_EDITAVEIS.includes(oRegistro.tipOrigem)) {
            notifica(
               `Somente lançamentos com origem "${ORIGEM_CONCILIACAO}" ou "${ORIGEM_TRANSFERENCIA}" podem ser ` +
                  `excluídos (origem atual: ${oRegistro.tipOrigem}).`,
               'erro'
            );
            return;
         }

         // O extrato do banco não é editável: ele é o retrato do que a
         // instituição registrou, e apagar uma linha ali faria a conciliação
         // fechar contra um extrato que não existe. Só o lado do ERP é nosso.
         if (sGrade !== 'lancamento') {
            notifica(
               'Movimento do banco não pode ser excluído: o extrato é o registro da instituição. ' +
                  'Somente lançamentos do sistema podem ser removidos.',
               'erro'
            );
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
      oSaldos,
      oSaldosPorLado,
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
      alteraLancamento,
      criaTransferencia,
      excluiRegistro,
      associaLancamento,
   };
} // useConciliacao
