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

/** Cor de destaque usada nos cabeçalhos (padrão de interface: #3B82F6) */
const COR_DESTAQUE = 'FF3B82F6';

/** Máscara numérica brasileira com duas casas decimais */
const MASCARA_MOEDA = '#,##0.00';

/**
 * Monta a linha de cabeçalho que descreve os filtros aplicados.
 * @param {object} oConta Conta corrente conciliada
 * @param {string} sDataInicio Data inicial do período
 * @param {string} sDataFim Data final do período
 * @returns {string[]} Linhas descritivas
 */
export function montaCabecalhoFiltros(oConta, sDataInicio, sDataFim) {
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

   return aLinhas;
} // montaCabecalhoFiltros

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

   const aCabecalho = montaCabecalhoFiltros(oDados.oConta, oDados.sDataInicio, oDados.sDataFim);

   adicionaAba(oLivro, 'Extrato do Sistema', aCabecalho, oDados.aLancamentos, oDados.nSaldoAnterior);
   adicionaAba(oLivro, 'Extrato do Banco', aCabecalho, oDados.aMovimentos, 0);

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

   for (const sLinha of montaCabecalhoFiltros(oDados.oConta, oDados.sDataInicio, oDados.sDataFim)) {
      aLinhas.push(protegeCampoCsv(sLinha));
   }

   const aBlocos = [
      { sTitulo: 'EXTRATO DO SISTEMA', aItens: oDados.aLancamentos, nSaldo: oDados.nSaldoAnterior },
      { sTitulo: 'EXTRATO DO BANCO', aItens: oDados.aMovimentos, nSaldo: 0 },
   ];

   for (const oBloco of aBlocos) {
      aLinhas.push('');
      aLinhas.push(oBloco.sTitulo);
      aLinhas.push(`Saldo anterior;${protegeCampoCsv(oBloco.nSaldo)}`);
      aLinhas.push(COLUNAS.join(';'));

      for (const oItem of oBloco.aItens) {
         aLinhas.push(montaLinha(oItem).map(protegeCampoCsv).join(';'));
      }

      const oTotais = calculaTotais(oBloco.aItens, oBloco.nSaldo);
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
   const aCabecalho = montaCabecalhoFiltros(oDados.oConta, oDados.sDataInicio, oDados.sDataFim);

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

${montaTabelaHtml('Extrato do Sistema (Satis)', oDados.aLancamentos, oDados.nSaldoAnterior)}
${montaTabelaHtml(`Extrato do Banco (${escapaHtml(oDados.oConta.nomBanco)})`, oDados.aMovimentos, 0)}

<footer>
   Agiw Sistemas — Módulo Conciliação Bancária | Ticket 37060.
   Relatório conferido: os totais correspondem às linhas apresentadas em cada coluna.
</footer>
<script>window.addEventListener('load', function () { window.print(); });</script>
</body>
</html>`;
} // geraHtmlImpressao
