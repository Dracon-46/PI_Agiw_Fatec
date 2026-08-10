// ============================================================================
// parserExtrato.js - Leitura de arquivos de extrato bancário
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Atende o item 6.1.3.3 do documento de visão: além da API bancária, o extrato
// pode ser importado de um arquivo indicado pelo usuário. Formatos aceitos:
//   OFX  - padrão Money 2000 usado pelos bancos brasileiros
//   CSV  - separado por ponto-e-vírgula ou vírgula, com cabeçalho
//   TXT  - texto delimitado (mesmo tratamento do CSV)
//
// Módulo puro: recebe o conteúdo já lido e devolve movimentos normalizados,
// no mesmo formato produzido pelos providers das APIs bancárias.
// ============================================================================

import { limpaSeparadores, normalizaDataExibicao } from './valorUtils.js';
import { normalizaTexto } from '../../utils/formatters.js';

/** Formatos reconhecidos pelo importador */
export const FORMATO_OFX = 'OFX';
export const FORMATO_CSV = 'CSV';
export const FORMATO_TXT = 'TXT';

/** Extensões aceitas na tela de upload */
export const EXTENSOES_ACEITAS = ['.ofx', '.csv', '.txt'];

/** Tamanho máximo aceito para o arquivo enviado (5 MB) */
export const TAMANHO_MAXIMO_BYTES = 5 * 1024 * 1024;

/**
 * Descobre o formato a partir do nome do arquivo e do conteúdo.
 * @param {string} sNomeArquivo
 * @param {string} sConteudo
 * @returns {string} Uma das constantes FORMATO_*
 */
export function detectaFormato(sNomeArquivo, sConteudo) {
   const sNome = String(sNomeArquivo ?? '').toLowerCase();

   if (sNome.endsWith('.ofx')) {
      return FORMATO_OFX;
   }
   if (sNome.endsWith('.csv')) {
      return FORMATO_CSV;
   }

   // Arquivos .txt podem conter OFX; a tag STMTTRN é o indicador confiável
   if (/<STMTTRN>/i.test(sConteudo ?? '')) {
      return FORMATO_OFX;
   }

   return FORMATO_TXT;
} // detectaFormato

// ---------------------------------------------------------------------------
// OFX
// ---------------------------------------------------------------------------

/**
 * Extrai o valor de uma tag OFX de linha simples.
 * @param {string} sBloco Trecho do arquivo
 * @param {string} sTag Nome da tag (ex.: "DTPOSTED")
 * @returns {string} Conteúdo da tag, ou string vazia
 */
function leTagOfx(sBloco, sTag) {
   const oRegex = new RegExp(`<${sTag}>([^<\\r\\n]*)`, 'i');
   const oAchado = oRegex.exec(sBloco);
   return oAchado ? oAchado[1].trim() : '';
}

/**
 * Converte a data OFX (AAAAMMDD, podendo trazer hora e fuso) para DD/MM/AAAA.
 * @param {string} sDataOfx
 * @returns {string}
 */
function converteDataOfx(sDataOfx) {
   const sDigitos = String(sDataOfx ?? '').replace(/\D/g, '');
   if (sDigitos.length < 8) {
      return '';
   }
   // O OFX sempre grava a data como AAAAMMDD nos 8 primeiros dígitos
   const sAno = sDigitos.slice(0, 4);
   const sMes = sDigitos.slice(4, 6);
   const sDia = sDigitos.slice(6, 8);
   return `${sDia}/${sMes}/${sAno}`;
}

/**
 * Interpreta um arquivo OFX e devolve os movimentos.
 * @param {string} sConteudo
 * @returns {Array<object>} Movimentos normalizados
 */
export function leOfx(sConteudo) {
   const aMovimentos = [];
   const aBlocos = String(sConteudo ?? '').split(/<STMTTRN>/i).slice(1);

   for (const sBlocoBruto of aBlocos) {
      const sBloco = sBlocoBruto.split(/<\/STMTTRN>/i)[0];

      const sValorBruto = leTagOfx(sBloco, 'TRNAMT');
      if (!sValorBruto) {
         continue;
      }

      let nValor = 0;
      try {
         nValor = limpaSeparadores(sValorBruto);
      } catch {
         continue;
      }
      if (nValor === 0) {
         continue;
      }

      const sData = converteDataOfx(leTagOfx(sBloco, 'DTPOSTED'));
      if (!sData) {
         continue;
      }

      // MEMO costuma trazer a descrição completa; NAME é o fallback
      const sHistorico = leTagOfx(sBloco, 'MEMO') || leTagOfx(sBloco, 'NAME') || 'Movimento importado';
      const sDocumento = leTagOfx(sBloco, 'CHECKNUM') || leTagOfx(sBloco, 'FITID');
      const sTipo = leTagOfx(sBloco, 'TRNTYPE').toUpperCase();

      // O sinal do TRNAMT manda; TRNTYPE é usado apenas como reforço
      const bEntrada = nValor > 0 && sTipo !== 'DEBIT';

      aMovimentos.push({
         datMovimento: sData,
         desHistorico: sHistorico,
         numDocumento: sDocumento,
         valEntrada: bEntrada ? Math.abs(nValor) : null,
         valSaida: bEntrada ? null : Math.abs(nValor),
         codigoLancamento: sTipo,
         staConciliado: false,
      });
   }

   return aMovimentos;
} // leOfx

// ---------------------------------------------------------------------------
// CSV / TXT delimitado
// ---------------------------------------------------------------------------

/** Nomes de coluna reconhecidos para cada campo */
const SINONIMOS_COLUNA = {
   data: ['data', 'data movimento', 'datamovimento', 'dat movimento', 'data lancamento', 'dt', 'date'],
   historico: ['historico', 'descricao', 'historico completo', 'memo', 'lancamento', 'description'],
   documento: ['documento', 'num documento', 'numero documento', 'doc', 'numdocumento'],
   valor: ['valor', 'valor lancamento', 'vlr', 'amount', 'valor movimento'],
   entrada: ['entrada', 'credito', 'credit'],
   saida: ['saida', 'debito', 'debit'],
   tipo: ['tipo', 'sinal', 'tipo lancamento', 'dc', 'd/c'],
};

/**
 * Descobre o delimitador dominante na linha de cabeçalho.
 * @param {string} sLinha
 * @returns {string}
 */
function detectaDelimitador(sLinha) {
   const aCandidatos = [';', ',', '\t', '|'];
   let sEscolhido = ';';
   let iMaior = 0;

   for (const sCandidato of aCandidatos) {
      const iOcorrencias = sLinha.split(sCandidato).length - 1;
      if (iOcorrencias > iMaior) {
         iMaior = iOcorrencias;
         sEscolhido = sCandidato;
      }
   }

   return sEscolhido;
}

/**
 * Localiza o índice da coluna correspondente a um campo.
 * @param {string[]} aCabecalho Cabeçalho já normalizado
 * @param {string} sCampo Chave de SINONIMOS_COLUNA
 * @returns {number} Índice, ou -1 quando ausente
 */
function achaColuna(aCabecalho, sCampo) {
   const aSinonimos = SINONIMOS_COLUNA[sCampo] ?? [];
   return aCabecalho.findIndex((sTitulo) => aSinonimos.includes(sTitulo));
}

/**
 * Divide uma linha respeitando campos entre aspas.
 * @param {string} sLinha
 * @param {string} sDelimitador
 * @returns {string[]}
 */
function divideLinha(sLinha, sDelimitador) {
   const aCampos = [];
   let sAtual = '';
   let bDentroDeAspas = false;

   for (let iPos = 0; iPos < sLinha.length; iPos += 1) {
      const sChar = sLinha[iPos];

      if (sChar === '"') {
         // Duas aspas seguidas representam uma aspa literal
         if (bDentroDeAspas && sLinha[iPos + 1] === '"') {
            sAtual += '"';
            iPos += 1;
         } else {
            bDentroDeAspas = !bDentroDeAspas;
         }
         continue;
      }

      if (sChar === sDelimitador && !bDentroDeAspas) {
         aCampos.push(sAtual.trim());
         sAtual = '';
         continue;
      }

      sAtual += sChar;
   }

   aCampos.push(sAtual.trim());
   return aCampos;
}

/**
 * Interpreta um arquivo CSV/TXT delimitado com cabeçalho.
 * @param {string} sConteudo
 * @returns {Array<object>} Movimentos normalizados
 */
export function leCsv(sConteudo) {
   const aLinhas = String(sConteudo ?? '')
      .split(/\r?\n/)
      .map((sLinha) => sLinha.trim())
      .filter((sLinha) => sLinha.length > 0);

   if (aLinhas.length < 2) {
      return [];
   }

   const sDelimitador = detectaDelimitador(aLinhas[0]);
   const aCabecalho = divideLinha(aLinhas[0], sDelimitador).map((sTitulo) => normalizaTexto(sTitulo));

   const iColData = achaColuna(aCabecalho, 'data');
   const iColHistorico = achaColuna(aCabecalho, 'historico');
   const iColDocumento = achaColuna(aCabecalho, 'documento');
   const iColValor = achaColuna(aCabecalho, 'valor');
   const iColEntrada = achaColuna(aCabecalho, 'entrada');
   const iColSaida = achaColuna(aCabecalho, 'saida');
   const iColTipo = achaColuna(aCabecalho, 'tipo');

   if (iColData === -1) {
      throw new Error(
         'O arquivo não possui uma coluna de data reconhecível. ' +
            'Inclua um cabeçalho com as colunas Data, Histórico e Valor.'
      );
   }
   if (iColValor === -1 && iColEntrada === -1 && iColSaida === -1) {
      throw new Error(
         'O arquivo não possui coluna de valor reconhecível. ' +
            'Use "Valor" (com sinal) ou as colunas "Entrada" e "Saída".'
      );
   }

   const aMovimentos = [];

   for (const sLinha of aLinhas.slice(1)) {
      const aCampos = divideLinha(sLinha, sDelimitador);

      const sData = normalizaDataExibicao(aCampos[iColData]);
      if (!sData) {
         continue;
      }

      let nEntrada = null;
      let nSaida = null;

      // Colunas separadas de entrada e saída
      if (iColEntrada !== -1 || iColSaida !== -1) {
         const nCredito = iColEntrada !== -1 ? converteCampoValor(aCampos[iColEntrada]) : 0;
         const nDebito = iColSaida !== -1 ? converteCampoValor(aCampos[iColSaida]) : 0;
         if (nCredito > 0) {
            nEntrada = nCredito;
         } else if (nDebito > 0) {
            nSaida = nDebito;
         }
      } else {
         // Coluna única: o sinal do valor ou a coluna de tipo define o sentido
         const sValorBruto = String(aCampos[iColValor] ?? '').trim();
         const nValor = converteCampoValor(sValorBruto);
         if (nValor === 0) {
            continue;
         }

         const sTipo = iColTipo !== -1 ? normalizaTexto(aCampos[iColTipo]) : '';
         const bDebito =
            sValorBruto.startsWith('-') ||
            ['d', 'debito', 'saida', 'debit'].includes(sTipo);

         if (bDebito) {
            nSaida = nValor;
         } else {
            nEntrada = nValor;
         }
      }

      if (nEntrada === null && nSaida === null) {
         continue;
      }

      aMovimentos.push({
         datMovimento: sData,
         desHistorico:
            (iColHistorico !== -1 ? aCampos[iColHistorico] : '') || 'Movimento importado por arquivo',
         numDocumento: iColDocumento !== -1 ? aCampos[iColDocumento] ?? '' : '',
         valEntrada: nEntrada,
         valSaida: nSaida,
         codigoLancamento: '',
         staConciliado: false,
      });
   }

   return aMovimentos;
} // leCsv

/**
 * Converte um campo de valor do arquivo em número absoluto.
 * @param {string} sCampo
 * @returns {number} 0 quando não for possível converter
 */
function converteCampoValor(sCampo) {
   const sTexto = String(sCampo ?? '').replace(/[R$\s]/gi, '').trim();
   if (!sTexto) {
      return 0;
   }
   try {
      return Math.abs(limpaSeparadores(sTexto));
   } catch {
      return 0;
   }
}

// ---------------------------------------------------------------------------
// Entrada única
// ---------------------------------------------------------------------------

/**
 * Interpreta o conteúdo de um arquivo de extrato, escolhendo o leitor
 * conforme o formato detectado.
 *
 * @param {string} sNomeArquivo Nome original enviado pelo usuário
 * @param {string} sConteudo Conteúdo do arquivo em texto
 * @returns {{ aMovimentos: Array<object>, sFormato: string }}
 */
export function interpretaArquivoExtrato(sNomeArquivo, sConteudo) {
   const sFormato = detectaFormato(sNomeArquivo, sConteudo);
   const aMovimentos = sFormato === FORMATO_OFX ? leOfx(sConteudo) : leCsv(sConteudo);

   return { aMovimentos, sFormato };
} // interpretaArquivoExtrato
