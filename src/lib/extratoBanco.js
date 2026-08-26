// ============================================================================
// extratoBanco.js - Leitura unificada do extrato de uma conta
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// A grade "Movimentos no Banco" e o relatório do item 6.2 precisam exatamente
// do mesmo extrato — o relatório imprime "os registros exibidos nas grades".
// Ter duas leituras diferentes faria o papel divergir da tela.
//
// O extrato tem duas fontes, conforme o item 6.1.3.3:
//   - a API da instituição, consultada a cada chamada (nada é copiado);
//   - os arquivos OFX/CSV/TXT importados, esses sim gravados no MySQL.
//
// Sobre os dois aplica-se o estado local: conciliado e excluído da grade.
// ============================================================================

import { BankProviderFactory } from '../providers/BankProviderFactory.js';
import {
   aplicaEstadoNosMovimentos,
   carregaEstadoMovimentos,
   listaMovimentosArquivo,
   registraEstadoMovimentos,
} from './repositories/movimentoRepository.js';
import { comparaDatas } from '../utils/formatters.js';

/** Identificação da origem devolvida à tela */
export const ORIGEM_API = 'API';

/**
 * Indica se o extrato deve ser recortado pelo período informado.
 *
 * Ligado é o comportamento do item 6.1.3.3 e o correto em produção. Em
 * homologação o recorte atrapalha: o sandbox do Bradesco só ACEITA a janela
 * 06/11/2024-20/11/2024 na consulta, mas RESPONDE sempre out/2024 a jan/2025 —
 * recortar deixaria um único movimento na grade.
 *
 * @returns {boolean}
 */
export function recortaPorPeriodo() {
   return (process.env.BANK_FILTRA_PERIODO ?? '').trim().toLowerCase() !== 'false';
} // recortaPorPeriodo

/**
 * Monta o código determinístico de um movimento da API.
 *
 * Data, documento, sentido e valor identificam a linha do extrato: a mesma
 * linha gera sempre o mesmo código, e é por ele que o estado local (conciliado
 * / excluído) reencontra o movimento em cada consulta.
 *
 * O "codigoLancamento" do Bradesco NÃO serve sozinho: ele identifica o TIPO da
 * transação (ex.: 03584 = rendimento) e se repete entre movimentos distintos.
 *
 * @param {object} oMovimento
 * @param {string} sCodConta
 * @param {number} iIndice
 * @param {boolean} bEntrada
 * @param {number} nValor
 * @returns {string}
 */
function montaCodigoMovimento(oMovimento, sCodConta, iIndice, bEntrada, nValor) {
   return [
      'API',
      sCodConta,
      String(oMovimento.datMovimento ?? '').replace(/\D/g, ''),
      oMovimento.numDocumento || String(iIndice),
      bEntrada ? 'E' : 'S',
      String(Math.round(nValor * 100)),
      oMovimento.codigoLancamento || '',
   ].join('-');
} // montaCodigoMovimento

/**
 * Normaliza os movimentos do provider para o formato da tela.
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
         codMovimento: montaCodigoMovimento(oMovimento, sCodConta, iIndice, bEntrada, nValor),
         codConta: sCodConta,
         datMovimento: oMovimento.datMovimento ?? '',
         desHistorico: oMovimento.desHistorico ?? 'Movimento bancário',
         numDocumento: oMovimento.numDocumento ?? '',
         valMovimento: nValor,
         bEntrada,
         staConciliado: false,
         codigoLancamento: oMovimento.codigoLancamento || '',
      };
   });
} // normalizaMovimentosDoProvider

/**
 * Mantém apenas os movimentos dentro do período pedido (item 6.1.3.3).
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
 * Lê o extrato completo de uma conta: API + arquivos importados.
 *
 * Nunca lança por falha da instituição — a importação por arquivo (item
 * 6.1.3.3) tem de continuar utilizável quando a API está fora ou não
 * contratada. O motivo volta em `sAviso` para a tela mostrar.
 *
 * @param {object} oConta Conta corrente já carregada do MySQL
 * @param {string} sDataInicio DD/MM/AAAA
 * @param {string} sDataFim DD/MM/AAAA
 * @returns {Promise<{ aMovimentos: Array<object>, sAviso: string, bApiConsultada: boolean }>}
 */
export async function leExtratoDaConta(oConta, sDataInicio, sDataFim) {
   const aAvisos = [];
   let aDaApi = [];
   let bApiConsultada = false;

   try {
      const oProvider = BankProviderFactory.createProvider(oConta.slugProvider);

      if (oProvider.isConfigured()) {
         const aBrutos = await oProvider.fetchExtrato(sDataInicio, sDataFim, {
            codAgencia: oConta.codAgencia,
            numContaCorrente: oConta.numContaCorrente,
            tipConta: oConta.tipConta,
         });

         const aNormalizados = normalizaMovimentosDoProvider(aBrutos, oConta.codConta);
         const { aDentro, iFora } = recortaPeriodo(aNormalizados, sDataInicio, sDataFim);
         aDaApi = aDentro;
         bApiConsultada = true;

         if (iFora > 0) {
            aAvisos.push(
               `${oProvider.getName()} devolveu ${aNormalizados.length} movimento(s); ` +
                  `${iFora} estão fora de ${sDataInicio} a ${sDataFim} e foram descartados. ` +
                  'Ambientes de homologação costumam ignorar as datas enviadas.'
            );
         }
      } else {
         const aPendencias =
            typeof oProvider.verificaConfiguracao === 'function'
               ? oProvider.verificaConfiguracao()
               : [];
         aAvisos.push(
            aPendencias.length > 0
               ? `Integração com ${oProvider.getName()} incompleta: ${aPendencias.join(' ')}`
               : `Integração com ${oProvider.getName()} não configurada. ` +
                 'Use "Importar arquivo" com o OFX do internet banking.'
         );
      }
   } catch (oErro) {
      aAvisos.push(`Não foi possível ler o extrato na API: ${oErro.message}`);
   }

   // Movimentos de arquivo já estão no MySQL com o estado aplicado
   const aDoArquivo = await listaMovimentosArquivo(
      oConta.idConta,
      recortaPorPeriodo() ? { sDataInicioBr: sDataInicio, sDataFimBr: sDataFim } : {}
   );

   const oEstado = await carregaEstadoMovimentos(oConta.idConta);
   const aDaApiComEstado = aplicaEstadoNosMovimentos(aDaApi, oEstado);

   if (aDaApiComEstado.length > 0) {
      await registraEstadoMovimentos(oConta.idConta, aDaApiComEstado);
   }

   // Um mesmo movimento pode chegar pelas duas vias quando o usuário importa
   // o OFX de um período que a API também cobre; o da API prevalece
   const oCodigosApi = new Set(aDaApiComEstado.map((oItem) => oItem.codMovimento));
   const aMovimentos = [
      ...aDaApiComEstado,
      ...aDoArquivo.filter((oItem) => !oCodigosApi.has(oItem.codMovimento)),
   ].sort((oA, oB) => comparaDatas(oA.datMovimento, oB.datMovimento));

   return { aMovimentos, sAviso: aAvisos.join(' '), bApiConsultada };
} // leExtratoDaConta
