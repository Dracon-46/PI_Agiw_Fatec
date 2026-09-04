// ============================================================================
// relatorioConciliacao.js - Geração dos relatórios do módulo
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Atende o item 6.2 do documento de visão: exportação dos extratos (bancário
// ou Satis) para Excel e PDF, contendo sempre saldo inicial, movimentos e
// saldo final, além do total de entradas, saídas, conciliado e não conciliado.
//
// Regras do padrão de programação aplicadas ao cabeçalho e aos totais:
//   - todos os filtros aplicados aparecem no cabeçalho da página;
//   - intervalos são impressos de forma explícita ("de X até Y");
//   - toda coluna de valor possui total, conferido com as linhas exibidas.
// ============================================================================

import ExcelJS from 'exceljs';
import { formataMoeda } from '../../utils/formatters.js';

/** Formatos de saída suportados */
export const FORMATO_XLSX = 'xlsx';
export const FORMATO_CSV = 'csv';
export const FORMATO_PDF = 'pdf';

/** OFX — formato padrão de troca de extrato entre banco e contabilidade */
export const FORMATO_OFX = 'ofx';

/**
 * Escopos de exportação — item 6.2: "exportar os extratos (bancário ou Satis)".
 */
export const ESCOPO_AMBOS = 'ambos';
export const ESCOPO_SISTEMA = 'sistema';
export const ESCOPO_BANCO = 'banco';

/** Escopos aceitos pelo parâmetro "escopo" */
export const ESCOPOS_VALIDOS = [ESCOPO_AMBOS, ESCOPO_SISTEMA, ESCOPO_BANCO];

/**
 * Monta os blocos que serão impressos, conforme o escopo escolhido.
 *
 * Cada bloco vira uma aba no Excel, uma seção no CSV e uma tabela no PDF,
 * sempre com saldo inicial, movimentos e saldo final (item 6.2).
 *
 * @param {object} oDados
 * @param {string} oDados.sEscopo Um dos ESCOPOS_VALIDOS
 * @param {object} oDados.oConta
 * @param {Array<object>} oDados.aLancamentos
 * @param {Array<object>} oDados.aMovimentos
 * @param {number} oDados.nSaldoAnterior Saldo do sistema no início do período
 * @returns {Array<{ sTitulo: string, sAba: string, aItens: Array<object>, nSaldoAnterior: number }>}
 */
export function montaBlocos(oDados) {
   const sEscopo = ESCOPOS_VALIDOS.includes(oDados.sEscopo) ? oDados.sEscopo : ESCOPO_AMBOS;
   const aBlocos = [];

   if (sEscopo === ESCOPO_AMBOS || sEscopo === ESCOPO_SISTEMA) {
      aBlocos.push({
         sTitulo: 'Extrato do Sistema (Satis)',
         sAba: 'Extrato do Sistema',
         aItens: oDados.aLancamentos ?? [],
         nSaldoAnterior: oDados.nSaldoAnterior ?? 0,
      });
   }

   if (sEscopo === ESCOPO_AMBOS || sEscopo === ESCOPO_BANCO) {
      aBlocos.push({
         sTitulo: `Extrato do Banco (${oDados.oConta?.nomBanco ?? 'instituição'})`,
         sAba: 'Extrato do Banco',
         // O extrato bancário parte do saldo informado pela própria instituição;
         // sem esse dado na base, o bloco começa em zero e soma o período
         aItens: oDados.aMovimentos ?? [],
         nSaldoAnterior: 0,
      });
   }

   return aBlocos;
} // montaBlocos

/** Cor de destaque usada nos cabeçalhos (padrão de interface: #3B82F6) */
const COR_DESTAQUE = 'FF3B82F6';

/** Máscara numérica brasileira com duas casas decimais */
const MASCARA_MOEDA = '#,##0.00';

/**
 * Monta a linha de cabeçalho que descreve os filtros aplicados.
 * @param {object} oConta Conta corrente conciliada
 * @param {string} sDataInicio Data inicial do período
 * @param {string} sDataFim Data final do período
 * @param {{ sDescricaoEscopo: string, sDescricaoStatus: string }} [oFiltros] Filtros das grades
 * @returns {string[]} Linhas descritivas
 */
export function montaCabecalhoFiltros(oConta, sDataInicio, sDataFim, oFiltros) {
   const aLinhas = [
      'Agiw Sistemas — Conciliação Bancária (Ticket 37060)',
      `Banco: ${oConta.codBanco} - ${oConta.nomBanco}`,
      `Agência / Conta Corrente: ${oConta.codAgencia} / ${oConta.numContaCorrente} (${oConta.tipConta === 'cp' ? 'poupança' : 'conta corrente'})`,
   ];

   // O intervalo precisa ficar explícito, conforme o padrão de relatórios
   if (sDataInicio && sDataFim) {
      aLinhas.push(`Período de ${sDataInicio} até ${sDataFim}`);
   } else if (sDataInicio) {
      aLinhas.push(`Período a partir de: ${sDataInicio}`);
   } else if (sDataFim) {
      aLinhas.push(`Período até: ${sDataFim}`);
   } else {
      aLinhas.push('Período: todos os movimentos importados');
   }

   aLinhas.push(
      `Conta bloqueada para lançamentos até: ${oConta.datUltimoBloqueio || 'sem bloqueio'}`
   );

   // Os filtros das grades também são filtros do relatório e precisam aparecer
   // no cabeçalho, conforme o padrão de relatórios da Agiw
   if (oFiltros) {
      aLinhas.push(`Conteúdo exportado: ${oFiltros.sDescricaoEscopo}`);
      aLinhas.push(`Situação incluída: ${oFiltros.sDescricaoStatus}`);
   }

   return aLinhas;
} // montaCabecalhoFiltros

/**
 * Descreve, em texto, os filtros de situação aplicados às grades.
 * @param {object} oFiltros
 * @param {boolean} oFiltros.bConciliados
 * @param {boolean} oFiltros.bNaoConciliados
 * @returns {string}
 */
export function descreveFiltroStatus({ bConciliados, bNaoConciliados }) {
   if (bConciliados && bNaoConciliados) {
      return 'conciliados e não conciliados';
   }
   if (bConciliados) {
      return 'somente conciliados';
   }
   if (bNaoConciliados) {
      return 'somente não conciliados';
   }
   return 'nenhuma situação selecionada';
} // descreveFiltroStatus

/**
 * Aplica à lista o mesmo recorte de situação usado nos chips das grades
 * (item 6.1.3.4), para que o relatório imprima "os registros exibidos".
 * @param {Array<object>} aItens
 * @param {boolean} bConciliados
 * @param {boolean} bNaoConciliados
 * @returns {Array<object>}
 */
export function filtraPorStatus(aItens, bConciliados, bNaoConciliados) {
   return (aItens ?? []).filter((oItem) => (oItem.staConciliado ? bConciliados : bNaoConciliados));
} // filtraPorStatus

/**
 * Calcula os totalizadores exigidos no relatório.
 * @param {Array<object>} aItens Lançamentos ou movimentos
 * @param {number} nSaldoAnterior Saldo no início do período
 * @returns {object} Totais de entradas, saídas, conciliado e não conciliado
 */
export function calculaTotais(aItens, nSaldoAnterior = 0) {
   let nEntradas = 0;
   let nSaidas = 0;
   let nConciliado = 0;
   let nNaoConciliado = 0;
   let iConciliados = 0;

   for (const oItem of aItens) {
      const nValor = Number(oItem.valMovimento);

      if (oItem.bEntrada) {
         nEntradas += nValor;
      } else {
         nSaidas += nValor;
      }

      // O líquido de cada lado alimenta os totais de conciliado / a conciliar
      const nLiquido = oItem.bEntrada ? nValor : -nValor;
      if (oItem.staConciliado) {
         nConciliado += nLiquido;
         iConciliados += 1;
      } else {
         nNaoConciliado += nLiquido;
      }
   }

   return {
      valSaldoAnterior: nSaldoAnterior,
      valEntradas: nEntradas,
      valSaidas: nSaidas,
      valSaldoFinal: nSaldoAnterior + nEntradas - nSaidas,
      valConciliado: nConciliado,
      valNaoConciliado: nNaoConciliado,
      iRegistros: aItens.length,
      iConciliados,
      iNaoConciliados: aItens.length - iConciliados,
   };
} // calculaTotais

/**
 * Converte um registro para a linha do relatório.
 * @param {object} oItem
 * @returns {Array} Célula por coluna
 */
function montaLinha(oItem) {
   return [
      oItem.datMovimento,
      oItem.numDocumento || '',
      oItem.desHistorico,
      oItem.tipOrigem || '',
      oItem.bEntrada ? Number(oItem.valMovimento) : null,
      oItem.bEntrada ? null : Number(oItem.valMovimento),
      oItem.staConciliado ? 'Sim' : 'Não',
   ];
} // montaLinha

/** Títulos das colunas do relatório */
const COLUNAS = ['Data', 'Documento', 'Histórico', 'Origem', 'Entrada', 'Saída', 'Conciliado'];

// ---------------------------------------------------------------------------
// Excel (.xlsx)
// ---------------------------------------------------------------------------

/**
 * Acrescenta uma aba com o extrato e seus totalizadores.
 * @param {ExcelJS.Workbook} oLivro
 * @param {string} sTitulo Nome da aba
 * @param {string[]} aCabecalho Linhas de filtros
 * @param {Array<object>} aItens Registros exibidos
 * @param {number} nSaldoAnterior
 */
function adicionaAba(oLivro, sTitulo, aCabecalho, aItens, nSaldoAnterior) {
   const oAba = oLivro.addWorksheet(sTitulo);
   oAba.columns = [
      { width: 12 },
      { width: 16 },
      { width: 46 },
      { width: 18 },
      { width: 15 },
      { width: 15 },
      { width: 12 },
   ];

   // Cabeçalho com os filtros aplicados
   for (const sLinha of aCabecalho) {
      const oLinha = oAba.addRow([sLinha]);
      oLinha.font = { bold: sLinha.startsWith('Agiw'), size: sLinha.startsWith('Agiw') ? 12 : 10 };
      oAba.mergeCells(`A${oLinha.number}:G${oLinha.number}`);
   }
   oAba.addRow([]);

   // Saldo anterior aparece como primeira informação do extrato
   const oLinhaSaldo = oAba.addRow(['Saldo anterior', '', '', '', null, null, '']);
   oLinhaSaldo.getCell(5).value = nSaldoAnterior;
   oLinhaSaldo.getCell(5).numFmt = MASCARA_MOEDA;
   oLinhaSaldo.font = { bold: true };
   oAba.addRow([]);

   // Títulos das colunas
   const oLinhaTitulos = oAba.addRow(COLUNAS);
   oLinhaTitulos.font = { bold: true, color: { argb: 'FFFFFFFF' } };
   oLinhaTitulos.eachCell((oCelula) => {
      oCelula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_DESTAQUE } };
      oCelula.alignment = { vertical: 'middle' };
   });

   for (const oItem of aItens) {
      const oLinha = oAba.addRow(montaLinha(oItem));
      oLinha.getCell(5).numFmt = MASCARA_MOEDA;
      oLinha.getCell(6).numFmt = MASCARA_MOEDA;
   }

   const oTotais = calculaTotais(aItens, nSaldoAnterior);

   oAba.addRow([]);
   const aResumo = [
      ['Total de entradas', oTotais.valEntradas],
      ['Total de saídas', oTotais.valSaidas],
      ['Saldo final', oTotais.valSaldoFinal],
      [`Total conciliado (${oTotais.iConciliados} registro(s))`, oTotais.valConciliado],
      [`Total não conciliado (${oTotais.iNaoConciliados} registro(s))`, oTotais.valNaoConciliado],
   ];

   for (const [sRotulo, nValor] of aResumo) {
      const oLinha = oAba.addRow([sRotulo, '', '', '', nValor]);
      oLinha.font = { bold: true };
      oLinha.getCell(5).numFmt = MASCARA_MOEDA;
   }

   // Congela o painel na linha de títulos para facilitar a leitura
   oAba.views = [{ state: 'frozen', ySplit: oLinhaTitulos.number }];
} // adicionaAba

/**
 * Gera a planilha Excel com as abas do sistema e do banco.
 * @param {object} oDados
 * @param {object} oDados.oConta
 * @param {string} oDados.sDataInicio
 * @param {string} oDados.sDataFim
 * @param {Array<object>} oDados.aLancamentos
 * @param {Array<object>} oDados.aMovimentos
 * @param {number} oDados.nSaldoAnterior
 * @returns {Promise<Buffer>} Conteúdo do arquivo .xlsx
 */
export async function geraExcel(oDados) {
   const oLivro = new ExcelJS.Workbook();
   oLivro.creator = 'Agiw Sistemas — Conciliação Bancária';
   oLivro.created = new Date();

   const aCabecalho = montaCabecalhoFiltros(
      oDados.oConta,
      oDados.sDataInicio,
      oDados.sDataFim,
      oDados.oFiltros
   );

   for (const oBloco of montaBlocos(oDados)) {
      adicionaAba(oLivro, oBloco.sAba, aCabecalho, oBloco.aItens, oBloco.nSaldoAnterior);
   }

   const oBuffer = await oLivro.xlsx.writeBuffer();
   return Buffer.from(oBuffer);
} // geraExcel

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * Protege um campo para uso em CSV.
 * @param {any} oValor
 * @returns {string}
 */
function protegeCampoCsv(oValor) {
   if (oValor === null || oValor === undefined) {
      return '';
   }
   const sTexto = typeof oValor === 'number' ? oValor.toFixed(2).replace('.', ',') : String(oValor);
   return /[";\r\n]/.test(sTexto) ? `"${sTexto.replace(/"/g, '""')}"` : sTexto;
} // protegeCampoCsv

/**
 * Gera o relatório em CSV (separador ponto-e-vírgula, compatível com Excel pt-BR).
 * @param {object} oDados Mesmo formato de geraExcel
 * @returns {string} Conteúdo do arquivo
 */
export function geraCsv(oDados) {
   const aLinhas = [];

   for (const sLinha of montaCabecalhoFiltros(
      oDados.oConta,
      oDados.sDataInicio,
      oDados.sDataFim,
      oDados.oFiltros
   )) {
      aLinhas.push(protegeCampoCsv(sLinha));
   }

   for (const oBloco of montaBlocos(oDados)) {
      aLinhas.push('');
      aLinhas.push(protegeCampoCsv(oBloco.sTitulo.toUpperCase()));
      aLinhas.push(`Saldo anterior;${protegeCampoCsv(oBloco.nSaldoAnterior)}`);
      aLinhas.push(COLUNAS.join(';'));

      for (const oItem of oBloco.aItens) {
         aLinhas.push(montaLinha(oItem).map(protegeCampoCsv).join(';'));
      }

      const oTotais = calculaTotais(oBloco.aItens, oBloco.nSaldoAnterior);
      aLinhas.push(`Total de entradas;;;;${protegeCampoCsv(oTotais.valEntradas)}`);
      aLinhas.push(`Total de saídas;;;;;${protegeCampoCsv(oTotais.valSaidas)}`);
      aLinhas.push(`Saldo final;;;;${protegeCampoCsv(oTotais.valSaldoFinal)}`);
      aLinhas.push(`Total conciliado;;;;${protegeCampoCsv(oTotais.valConciliado)}`);
      aLinhas.push(`Total não conciliado;;;;${protegeCampoCsv(oTotais.valNaoConciliado)}`);
   }

   // BOM inicial para o Excel reconhecer os acentos
   return `﻿${aLinhas.join('\r\n')}`;
} // geraCsv

// ---------------------------------------------------------------------------
// PDF (via página pronta para impressão)
// ---------------------------------------------------------------------------

/**
 * Escapa texto para inclusão segura no HTML.
 * @param {any} oValor
 * @returns {string}
 */
function escapaHtml(oValor) {
   return String(oValor ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
} // escapaHtml

/**
 * Monta a tabela HTML de um extrato com seus totalizadores.
 * @param {string} sTitulo
 * @param {Array<object>} aItens
 * @param {number} nSaldoAnterior
 * @returns {string}
 */
function montaTabelaHtml(sTitulo, aItens, nSaldoAnterior) {
   const oTotais = calculaTotais(aItens, nSaldoAnterior);

   const sCorpo =
      aItens.length === 0
         ? '<tr><td colspan="7" class="vazio">Nenhum registro no período.</td></tr>'
         : aItens
              .map(
                 (oItem) => `<tr>
   <td>${escapaHtml(oItem.datMovimento)}</td>
   <td>${escapaHtml(oItem.numDocumento || '')}</td>
   <td>${escapaHtml(oItem.desHistorico)}</td>
   <td>${escapaHtml(oItem.tipOrigem || '')}</td>
   <td class="num entrada">${oItem.bEntrada ? formataMoeda(oItem.valMovimento) : ''}</td>
   <td class="num saida">${oItem.bEntrada ? '' : formataMoeda(oItem.valMovimento)}</td>
   <td class="centro">${oItem.staConciliado ? 'Sim' : 'Não'}</td>
</tr>`
              )
              .join('\n');

   return `
<h2>${escapaHtml(sTitulo)}</h2>
<p class="saldo">Saldo anterior: <strong>${formataMoeda(nSaldoAnterior)}</strong></p>
<table>
   <thead>
      <tr>
         <th>Data</th><th>Documento</th><th>Histórico</th><th>Origem</th>
         <th class="num">Entrada</th><th class="num">Saída</th><th class="centro">Conc.</th>
      </tr>
   </thead>
   <tbody>${sCorpo}</tbody>
   <tfoot>
      <tr><td colspan="4">Total de entradas / saídas</td>
          <td class="num entrada">${formataMoeda(oTotais.valEntradas)}</td>
          <td class="num saida">${formataMoeda(oTotais.valSaidas)}</td><td></td></tr>
      <tr><td colspan="4">Saldo final</td>
          <td class="num" colspan="2">${formataMoeda(oTotais.valSaldoFinal)}</td><td></td></tr>
      <tr><td colspan="4">Total conciliado (${oTotais.iConciliados} registro(s))</td>
          <td class="num" colspan="2">${formataMoeda(oTotais.valConciliado)}</td><td></td></tr>
      <tr><td colspan="4">Total não conciliado (${oTotais.iNaoConciliados} registro(s))</td>
          <td class="num" colspan="2">${formataMoeda(oTotais.valNaoConciliado)}</td><td></td></tr>
   </tfoot>
</table>`;
} // montaTabelaHtml

/**
 * Gera uma página HTML pronta para impressão / gravação em PDF.
 *
 * A conversão é feita pelo próprio navegador ("Salvar como PDF"), evitando
 * incluir no projeto uma dependência de geração de PDF apenas para este uso.
 *
 * @param {object} oDados Mesmo formato de geraExcel
 * @returns {string} Documento HTML completo
 */
export function geraHtmlImpressao(oDados) {
   const aCabecalho = montaCabecalhoFiltros(
      oDados.oConta,
      oDados.sDataInicio,
      oDados.sDataFim,
      oDados.oFiltros
   );
   const sTabelas = montaBlocos(oDados)
      .map((oBloco) => montaTabelaHtml(oBloco.sTitulo, oBloco.aItens, oBloco.nSaldoAnterior))
      .join('\n');

   return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Conciliação Bancária — ${escapaHtml(oDados.oConta.codAgencia)}/${escapaHtml(oDados.oConta.numContaCorrente)}</title>
<style>
   @page { size: A4 landscape; margin: 12mm; }
   * { box-sizing: border-box; }
   body { font-family: 'Segoe UI', Tahoma, sans-serif; color: #18181b; font-size: 11px; margin: 0; }
   header { border-bottom: 2px solid #3b82f6; padding-bottom: 8px; margin-bottom: 14px; }
   header p { margin: 1px 0; }
   header p.marca { font-size: 15px; font-weight: 700; color: #1d4ed8; }
   h2 { font-size: 12px; margin: 16px 0 4px; color: #1d4ed8; text-transform: uppercase; }
   p.saldo { margin: 0 0 6px; }
   table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
   th, td { border: 1px solid #e4e4e7; padding: 4px 6px; text-align: left; }
   thead th { background: #eff6ff; color: #1d4ed8; font-size: 10px; }
   tbody tr:nth-child(even) { background: #fafafa; }
   tfoot td { background: #f4f4f5; font-weight: 600; }
   .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
   .centro { text-align: center; }
   .entrada { color: #2563eb; }
   .saida { color: #dc2626; }
   .vazio { text-align: center; color: #a1a1aa; padding: 14px; }
   footer { margin-top: 14px; border-top: 1px solid #e4e4e7; padding-top: 6px; color: #52525b; font-size: 9px; }
   .aviso { margin: 10px 0; padding: 8px 10px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; }
   @media print { .aviso { display: none; } }
</style>
</head>
<body>
<header>
   ${aCabecalho.map((sLinha, iIndice) => `<p class="${iIndice === 0 ? 'marca' : ''}">${escapaHtml(sLinha)}</p>`).join('\n   ')}
   <p>Emitido em ${escapaHtml(oDados.sDataEmissao)}</p>
</header>

<div class="aviso">
   Use <strong>Ctrl+P</strong> e escolha <strong>&quot;Salvar como PDF&quot;</strong> para gerar o arquivo.
</div>

${sTabelas}

<footer>
   Agiw Sistemas — Módulo Conciliação Bancária | Ticket 37060.
   Relatório conferido: os totais correspondem às linhas apresentadas em cada coluna.
</footer>
<script>window.addEventListener('load', function () { window.print(); });</script>
</body>
</html>`;
} // geraHtmlImpressao

// ───────── OFX ─────────

/**
 * Converte DD/MM/AAAA para o carimbo de data do OFX (AAAAMMDD).
 * @param {string} sDataBr
 * @returns {string}
 */
function dataOfx(sDataBr) {
   const [sDia, sMes, sAno] = String(sDataBr ?? '').split('/');
   return sAno && sMes && sDia ? `${sAno}${sMes}${sDia}` : '';
} // dataOfx

/**
 * Escapa os caracteres que o SGML do OFX interpreta como marcação.
 * @param {string} sTexto
 * @returns {string}
 */
function escapaOfx(sTexto) {
   return String(sTexto ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
} // escapaOfx

/**
 * Gera o extrato em OFX (Open Financial Exchange).
 *
 * É o formato que os bancos publicam para troca de extrato, e o que a
 * contabilidade consegue importar direto — diferente do xlsx e do CSV, que são
 * leitura humana. A versão 1.0.2 (SGML) é a suportada pelos ERPs brasileiros;
 * o OFX 2.x é XML puro e tem adoção bem menor por aqui.
 *
 * Um arquivo OFX descreve UMA conta, então o escopo "ambos" não se aplica:
 * cada extrato sai em seu próprio arquivo.
 *
 * @param {object} oDados Mesmo formato de geraExcel
 * @returns {string} Conteúdo do arquivo
 */
export function geraOfx(oDados) {
   const aBlocos = montaBlocos(oDados);
   const oBloco = aBlocos[0] ?? { aItens: [], nSaldoAnterior: 0 };
   const oConta = oDados.oConta ?? {};

   const sDataInicio = dataOfx(oDados.sDataInicio);
   const sDataFim = dataOfx(oDados.sDataFim);
   const sAgora = dataOfx(oDados.sDataEmissao) || sDataFim;

   const oTotais = calculaTotais(oBloco.aItens, oBloco.nSaldoAnterior);

   const aTransacoes = oBloco.aItens.map((oItem) => {
      const nValor = Number(oItem.valMovimento) || 0;
      // Débito vai com sinal negativo, como manda o formato
      const sValor = (oItem.bEntrada ? nValor : -nValor).toFixed(2);
      const sCodigo = oItem.codLancamento || oItem.codMovimento || '';

      return [
         '<STMTTRN>',
         `<TRNTYPE>${oItem.bEntrada ? 'CREDIT' : 'DEBIT'}`,
         `<DTPOSTED>${dataOfx(oItem.datMovimento)}`,
         `<TRNAMT>${sValor}`,
         `<FITID>${escapaOfx(sCodigo)}`,
         oItem.numDocumento ? `<CHECKNUM>${escapaOfx(oItem.numDocumento)}` : '',
         `<MEMO>${escapaOfx(oItem.desHistorico).slice(0, 255)}`,
         '</STMTTRN>',
      ]
         .filter(Boolean)
         .join('\n');
   });

   return [
      'OFXHEADER:100',
      'DATA:OFXSGML',
      'VERSION:102',
      'SECURITY:NONE',
      'ENCODING:USASCII',
      'CHARSET:1252',
      'COMPRESSION:NONE',
      'OLDFILEUID:NONE',
      'NEWFILEUID:NONE',
      '',
      '<OFX>',
      '<SIGNONMSGSRSV1><SONRS>',
      '<STATUS><CODE>0<SEVERITY>INFO</STATUS>',
      `<DTSERVER>${sAgora}`,
      '<LANGUAGE>POR',
      '</SONRS></SIGNONMSGSRSV1>',
      '<BANKMSGSRSV1><STMTTRNRS>',
      '<TRNUID>1',
      '<STATUS><CODE>0<SEVERITY>INFO</STATUS>',
      '<STMTRS>',
      '<CURDEF>BRL',
      '<BANKACCTFROM>',
      `<BANKID>${escapaOfx(oConta.codBanco ?? '')}`,
      `<BRANCHID>${escapaOfx(oConta.codAgencia ?? '')}`,
      `<ACCTID>${escapaOfx(oConta.numContaCorrente ?? '')}`,
      `<ACCTTYPE>${oConta.tipConta === 'cp' ? 'SAVINGS' : 'CHECKING'}`,
      '</BANKACCTFROM>',
      '<BANKTRANLIST>',
      `<DTSTART>${sDataInicio}`,
      `<DTEND>${sDataFim}`,
      ...aTransacoes,
      '</BANKTRANLIST>',
      '<LEDGERBAL>',
      `<BALAMT>${(oTotais.valSaldoFinal ?? 0).toFixed(2)}`,
      `<DTASOF>${sDataFim}`,
      '</LEDGERBAL>',
      '</STMTRS>',
      '</STMTTRNRS></BANKMSGSRSV1>',
      '</OFX>',
      '',
   ].join('\n');
} // geraOfx
