// ============================================================================
// extratoBanco.js - Leitura do extrato de uma conta
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// A grade "Movimentos no Banco" e o relatório do item 6.2 precisam exatamente
// do mesmo extrato — o relatório imprime "os registros exibidos nas grades".
// Ter duas leituras diferentes faria o papel divergir da tela.
//
// O extrato é GRAVADO no extrato do ERP (TBCONB006) na primeira leitura e, a
// partir daí, servido de lá. A instituição só é consultada para os dias que
// ainda não temos:
//
//   1. o período pedido é quebrado em dias;
//   2. TBCONB008 diz quais já foram consultados;
//   3. os que faltam viram faixas contíguas e vão à API, uma faixa por vez;
//   4. o que volta é gravado e os dias são marcados como cobertos;
//   5. a grade é montada lendo o ERP — sempre, inclusive no caminho novo.
//
// Duas razões para isso, e nenhuma é desempenho apenas: as APIs têm janela
// limitada (o BB não devolve nada além de 5 anos), então sem cópia local a
// conciliação de períodos antigos ficaria impossível; e reconsultar o mesmo
// período a cada abertura de tela gasta cota do gateway à toa.
// ============================================================================

import { BankProviderFactory } from '../providers/BankProviderFactory.js';
import {
   gravaMovimentos,
   listaDiasConsultados,
   listaMovimentosPeriodo,
   marcaDiasConsultados,
} from './repositories/movimentoRepository.js';
import { comparaDatas } from '../utils/formatters.js';
import { separaComponentesData } from './conciliacao/valorUtils.js';

/** Identificação da origem devolvida à tela */
export const ORIGEM_API = 'API';

/**
 * Máximo de dias enviados à instituição em uma única chamada.
 *
 * O limite mais apertado entre os bancos integrados é o do Banco do Brasil, de
 * 31 dias por consulta. Fatiar aqui evita que uma faixa maior seja recusada.
 */
export const MAX_DIAS_POR_CHAMADA = 31;

/**
 * Máximo de chamadas à instituição em uma única busca.
 *
 * Um período todo descoberto vira uma ou duas faixas; um período salpicado de
 * buracos (extrato antigo gravado dia sim, dia não) vira dezenas. Sem teto,
 * abrir a tela dispararia uma rajada contra o gateway do banco.
 */
export const MAX_FAIXAS_POR_BUSCA = 8;

/**
 * Indica se o que a API devolve fora do período pedido deve ser descartado.
 *
 * Ligado é o correto em produção: dia que não foi consultado não pode ser
 * marcado como coberto. Em homologação o descarte atrapalha — o sandbox do
 * Bradesco só ACEITA a janela 06/11/2024-20/11/2024 na consulta, mas RESPONDE
 * sempre out/2024 a jan/2025, e com o recorte ligado quase nada é gravado.
 *
 * A chave age SÓ na gravação. A GRADE é sempre recortada pelo período (item
 * 6.1.3.3), e isso não é configurável: as tabelas do ERP têm o histórico
 * inteiro da conta — a do Itaú tem movimento desde 2010 —, e mandar isso para
 * o navegador travaria a tela. O teto de 60 dias do período existe justamente
 * para manter a grade em um tamanho que se possa conferir.
 *
 * @returns {boolean}
 */
export function recortaPorPeriodo() {
   return (process.env.BANK_FILTRA_PERIODO ?? '').trim().toLowerCase() !== 'false';
} // recortaPorPeriodo

/**
 * Monta o FITID determinístico de um movimento.
 *
 * FITID é o campo de OFX para "identificador único da transação no banco", e é
 * nele que TBCONB006 guarda a identidade da linha do extrato: a mesma linha
 * gera sempre o mesmo FITID, e é por ele que reconsultar um período já gravado
 * ATUALIZA o registro em vez de duplicá-lo. A chave primária da tabela é uma
 * sequência (NUMSEQMOVTO), que não serviria para isso.
 *
 * A coluna é VARCHAR(50), então cada parte tem tamanho máximo — o código não
 * pode ser truncado no meio, sob pena de dois movimentos distintos virarem o
 * mesmo FITID e um sobrescrever o outro. A conta fica FORA do código: ela já
 * está na chave da tabela.
 *
 * O "codigoLancamento" do Bradesco NÃO serve sozinho: ele identifica o TIPO da
 * transação (ex.: 03584 = rendimento) e se repete entre movimentos distintos.
 *
 * @param {object} oMovimento
 * @param {number} iIndice
 * @param {boolean} bEntrada
 * @param {number} nValor
 * @returns {string} No máximo 50 posições
 */
function montaFitid(oMovimento, iIndice, bEntrada, nValor) {
   const sData = String(oMovimento.datMovimento ?? '').replace(/\D/g, '').slice(0, 8);
   const sValor = String(Math.round(nValor * 100)).slice(-12);
   const sDocumento = String(oMovimento.numDocumento || iIndice).slice(-8);
   const sTipo = String(oMovimento.codigoLancamento || '').slice(-6);

   // Discriminador da ocorrência. Sem ele, dois movimentos de mesmo dia,
   // documento, sentido e valor produzem a mesma chave e um sobrescreve o
   // outro na gravação — perda silenciosa de movimento. Acontece de verdade:
   // o Itaú devolve liquidações repetidas do mesmo título. Quando o banco
   // fornece identificador próprio de transação (o BB o faz na v2), é ele que
   // entra; senão, a posição na resposta.
   const sOcorrencia = String(oMovimento.idTransacao || iIndice).slice(-8);

   return `${sData}${bEntrada ? 'E' : 'S'}${sValor}-${sDocumento}-${sTipo}-${sOcorrencia}`;
} // montaFitid

/**
 * Normaliza os movimentos do provider para o formato da gravação.
 * @param {Array<object>} aBrutos
 * @param {string} sCodConta
 * @returns {Array<object>}
 */
export function normalizaMovimentosDoProvider(aBrutos, sCodConta) {
   return aBrutos.map((oMovimento, iIndice) => {
      const nEntrada = oMovimento.valEntrada ?? 0;
      const nSaida = oMovimento.valSaida ?? 0;
      const bEntrada = nEntrada > 0;
      const nValor = bEntrada ? nEntrada : nSaida;

      return {
         codFitid: montaFitid(oMovimento, iIndice, bEntrada, nValor),
         codConta: sCodConta,
         datMovimento: oMovimento.datMovimento ?? '',
         desHistorico: oMovimento.desHistorico ?? 'Movimento bancário',
         numDocumento: oMovimento.numDocumento ?? '',
         valMovimento: nValor,
         bEntrada,
         staConciliado: false,
         codigoLancamento: oMovimento.codigoLancamento || '',
         idTransacao: oMovimento.idTransacao || '',
      };
   });
} // normalizaMovimentosDoProvider

// ───────── Cobertura por dia ─────────

/**
 * Converte DD/MM/AAAA para AAAA-MM-DD.
 * @param {string} sDataBr
 * @returns {string} String vazia quando não for interpretável
 */
function paraIso(sDataBr) {
   const oPartes = separaComponentesData(sDataBr);
   return oPartes ? `${oPartes.sAno}-${oPartes.sMes}-${oPartes.sDia}` : '';
} // paraIso

/**
 * Converte AAAA-MM-DD para DD/MM/AAAA.
 * @param {string} sDataIso
 * @returns {string}
 */
function paraBr(sDataIso) {
   const [sAno, sMes, sDia] = String(sDataIso).slice(0, 10).split('-');
   return sAno && sMes && sDia ? `${sDia}/${sMes}/${sAno}` : '';
} // paraBr

/**
 * Relaciona todos os dias de um período, em AAAA-MM-DD.
 * @param {string} sDataInicioBr
 * @param {string} sDataFimBr
 * @returns {string[]} Vazio quando o período é inválido ou invertido
 */
export function listaDiasDoPeriodo(sDataInicioBr, sDataFimBr) {
   const sIni = paraIso(sDataInicioBr);
   const sFim = paraIso(sDataFimBr);
   if (!sIni || !sFim || sIni > sFim) {
      return [];
   }

   const aDias = [];
   const dtAtual = new Date(`${sIni}T00:00:00`);
   const dtFim = new Date(`${sFim}T00:00:00`);

   while (dtAtual <= dtFim) {
      aDias.push(dtAtual.toISOString().slice(0, 10));
      dtAtual.setDate(dtAtual.getDate() + 1);
   }

   return aDias;
} // listaDiasDoPeriodo

/**
 * Agrupa dias soltos em faixas contíguas, cada uma com no máximo
 * MAX_DIAS_POR_CHAMADA dias.
 *
 * Buscar dia a dia multiplicaria as chamadas; buscar tudo de uma vez estouraria
 * o limite do banco. A faixa contígua é o meio-termo: um intervalo por buraco.
 *
 * @param {string[]} aDiasIso Dias ordenados
 * @returns {Array<{ sInicioIso: string, sFimIso: string }>}
 */
export function agrupaEmFaixas(aDiasIso) {
   const aFaixas = [];
   if (aDiasIso.length === 0) {
      return aFaixas;
   }

   let sInicio = aDiasIso[0];
   let sAnterior = aDiasIso[0];
   let iTamanho = 1;

   const ehDiaSeguinte = (sA, sB) => {
      const dt = new Date(`${sA}T00:00:00`);
      dt.setDate(dt.getDate() + 1);
      return dt.toISOString().slice(0, 10) === sB;
   };

   for (let iPos = 1; iPos < aDiasIso.length; iPos += 1) {
      const sDia = aDiasIso[iPos];
      if (ehDiaSeguinte(sAnterior, sDia) && iTamanho < MAX_DIAS_POR_CHAMADA) {
         sAnterior = sDia;
         iTamanho += 1;
         continue;
      }
      aFaixas.push({ sInicioIso: sInicio, sFimIso: sAnterior });
      sInicio = sDia;
      sAnterior = sDia;
      iTamanho = 1;
   }

   aFaixas.push({ sInicioIso: sInicio, sFimIso: sAnterior });
   return aFaixas;
} // agrupaEmFaixas

/**
 * Mantém apenas os movimentos dentro do período pedido.
 *
 * Diferente do desenho anterior, o recorte aqui não é opcional: o que sai da
 * API vai ser GRAVADO, e gravar movimento de fora da faixa marcaria como
 * coberto um dia que não foi consultado de verdade. Ambientes de homologação
 * devolvem datas fora do pedido (o sandbox do Bradesco responde sempre
 * out/2024 a jan/2025), e é justamente esse lixo que não pode entrar na base.
 *
 * @param {Array<object>} aMovimentos
 * @param {string} sDataInicio DD/MM/AAAA
 * @param {string} sDataFim DD/MM/AAAA
 * @returns {{ aDentro: Array<object>, iFora: number }}
 */
export function recortaPeriodo(aMovimentos, sDataInicio, sDataFim) {
   if (!recortaPorPeriodo()) {
      return { aDentro: aMovimentos, iFora: 0 };
   }

   const aDentro = [];
   let iFora = 0;

   for (const oMovimento of aMovimentos) {
      const bDentro =
         comparaDatas(oMovimento.datMovimento, sDataInicio) >= 0 &&
         comparaDatas(oMovimento.datMovimento, sDataFim) <= 0;

      if (bDentro) {
         aDentro.push(oMovimento);
      } else {
         iFora += 1;
      }
   }

   return { aDentro, iFora };
} // recortaPeriodo

/**
 * Conta quantos movimentos cada dia trouxe.
 *
 * Vai para TBCONB008.QTDMOVTO: dia consultado com zero movimento é resposta
 * legítima da instituição, e registrar a quantidade deixa isso explícito para
 * quem for conferir a cobertura do extrato depois.
 *
 * @param {Array<object>} aMovimentos Movimentos já recortados pelo período
 * @returns {Record<string, number>} Quantidade por dia, em AAAA-MM-DD
 */
function contaMovimentosPorDia(aMovimentos) {
   const oQtd = {};

   for (const oMovimento of aMovimentos) {
      const sDia = paraIso(oMovimento.datMovimento);
      if (sDia) {
         oQtd[sDia] = (oQtd[sDia] ?? 0) + 1;
      }
   }

   return oQtd;
} // contaMovimentosPorDia

/**
 * Busca na instituição as faixas de dias que ainda não temos e grava o
 * resultado.
 *
 * @param {object} oProvider
 * @param {object} oConta
 * @param {Array<{ sInicioIso: string, sFimIso: string }>} aFaixas
 * @returns {Promise<{ iGravados: number, aAvisos: string[] }>}
 */
async function buscaEGrava(oProvider, oConta, aFaixas) {
   const aAvisos = [];
   const aFalhas = [];
   let iGravados = 0;

   for (const oFaixa of aFaixas) {
      const sInicioBr = paraBr(oFaixa.sInicioIso);
      const sFimBr = paraBr(oFaixa.sFimIso);

      try {
         const aBrutos = await oProvider.fetchExtrato(sInicioBr, sFimBr, {
            codAgencia: oConta.codAgencia,
            numContaCorrente: oConta.numContaCorrente,
            tipConta: oConta.tipConta,
         });

         const aNormalizados = normalizaMovimentosDoProvider(aBrutos, oConta.codConta);
         const { aDentro, iFora } = recortaPeriodo(aNormalizados, sInicioBr, sFimBr);

         iGravados += await gravaMovimentos(oConta, aDentro);

         // Só marca os dias depois de gravar: falha no meio deixa o dia
         // pendente e a próxima busca refaz a consulta
         await marcaDiasConsultados(
            oConta,
            listaDiasDoPeriodo(sInicioBr, sFimBr),
            contaMovimentosPorDia(aDentro)
         );

         if (iFora > 0) {
            aAvisos.push(
               `${oProvider.getName()} devolveu ${iFora} movimento(s) fora de ` +
                  `${sInicioBr} a ${sFimBr}; foram descartados. Ambientes de ` +
                  'homologação costumam ignorar as datas enviadas.'
            );
         }
      } catch (oErro) {
         // Acumula em vez de emitir na hora: um período com muitos buracos
         // gera muitas faixas, e uma mensagem por faixa afogaria a tela
         aFalhas.push({ sInicioBr, sFimBr, sMotivo: oErro.message });
      }
   }

   if (aFalhas.length === 1) {
      aAvisos.push(
         `Não foi possível ler ${aFalhas[0].sInicioBr} a ${aFalhas[0].sFimBr} na API: ` +
            aFalhas[0].sMotivo
      );
   } else if (aFalhas.length > 1) {
      // O motivo costuma ser o mesmo em todas; mostrar um basta para agir
      aAvisos.push(
         `Não foi possível ler ${aFalhas.length} trecho(s) do período na API ` +
            `(de ${aFalhas[0].sInicioBr} a ${aFalhas[aFalhas.length - 1].sFimBr}). ` +
            `Motivo: ${aFalhas[0].sMotivo}`
      );
   }

   return { iGravados, aAvisos };
} // buscaEGrava

/**
 * Lê o extrato de uma conta no período, consultando a instituição apenas para
 * os dias que ainda não estão gravados.
 *
 * Nunca lança por falha da instituição: o que já está gravado no ERP continua
 * disponível para conciliar mesmo com a API fora do ar. O motivo volta em
 * `sAviso` para a tela mostrar.
 *
 * @param {object} oConta Conta corrente já carregada do ERP
 * @param {string} sDataInicio DD/MM/AAAA
 * @param {string} sDataFim DD/MM/AAAA
 * @param {object} [oOpcoes]
 * @param {boolean} [oOpcoes.bForcaApi] Reconsulta o período inteiro, ignorando
 *        o que já está gravado.
 * @param {boolean} [oOpcoes.bSomenteCache] Não consulta a instituição: devolve
 *        apenas o que já está gravado. A tela usa isso ao abrir, para que
 *        trocar de conta seja instantâneo; a ida à API fica no botão Buscar.
 * @returns {Promise<{ aMovimentos: Array<object>, sAviso: string,
 *                     bApiConsultada: boolean, iDiasBuscados: number }>}
 */
export async function leExtratoDaConta(oConta, sDataInicio, sDataFim, oOpcoes = {}) {
   const aAvisos = [];
   let bApiConsultada = false;
   let iDiasBuscados = 0;

   const aDiasPeriodo = listaDiasDoPeriodo(sDataInicio, sDataFim);

   if (aDiasPeriodo.length === 0) {
      return {
         aMovimentos: [],
         sAviso: `Período inválido: ${sDataInicio} a ${sDataFim}.`,
         bApiConsultada: false,
         iDiasBuscados: 0,
      };
   }

   // ---------- 1. o que ainda falta buscar ----------
   const oJaConsultados = oOpcoes.bForcaApi
      ? new Set()
      : await listaDiasConsultados(oConta, sDataInicio, sDataFim);

   const aDiasFaltantes = aDiasPeriodo.filter((sDia) => !oJaConsultados.has(sDia));

   // ---------- 2. consulta a instituição só para os buracos ----------
   if (aDiasFaltantes.length > 0 && !oOpcoes.bSomenteCache) {
      try {
         const oProvider = BankProviderFactory.createProvider(oConta.slugProvider);

         const aPendencias =
            typeof oProvider.verificaConfiguracao === 'function' ? oProvider.verificaConfiguracao() : [];
         const aPendenciasConta =
            typeof oProvider.verificaConta === 'function' ? oProvider.verificaConta(oConta) : [];
         const aTodasPendencias = [...aPendencias, ...aPendenciasConta];

         if (aTodasPendencias.length === 0) {
            const aTodasFaixas = agrupaEmFaixas(aDiasFaltantes);
            const aFaixas = aTodasFaixas.slice(0, MAX_FAIXAS_POR_BUSCA);

            const { aAvisos: aAvisosBusca } = await buscaEGrava(oProvider, oConta, aFaixas);
            aAvisos.push(...aAvisosBusca);
            bApiConsultada = true;
            iDiasBuscados = aFaixas.reduce(
               (iSoma, oFaixa) => iSoma + listaDiasDoPeriodo(paraBr(oFaixa.sInicioIso), paraBr(oFaixa.sFimIso)).length,
               0
            );

            if (aTodasFaixas.length > aFaixas.length) {
               aAvisos.push(
                  `O período tem ${aTodasFaixas.length} trechos ainda não consultados; ` +
                     `${aFaixas.length} foram buscados agora. Busque novamente para continuar.`
               );
            }
         } else {
            aAvisos.push(
               `Integração com ${oProvider.getName()} incompleta: ${aTodasPendencias.join(' ')} ` +
                  'A grade mostra apenas o extrato já gravado.'
            );
         }
      } catch (oErro) {
         aAvisos.push(`Não foi possível consultar a instituição: ${oErro.message}`);
      }
   }

   // ---------- 3. a grade sai sempre do ERP, recortada pelo período ----------
   // O recorte aqui NÃO é configurável: TBCONB006 guarda o extrato desde que a
   // conta existe, e a grade tem de caber na tela e na conferência.
   const aMovimentos = await listaMovimentosPeriodo(oConta, sDataInicio, sDataFim);

   return {
      aMovimentos,
      sAviso: aAvisos.join(' '),
      bApiConsultada,
      iDiasBuscados,
   };
} // leExtratoDaConta
