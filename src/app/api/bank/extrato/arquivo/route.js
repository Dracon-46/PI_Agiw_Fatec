// ============================================================================
// api/bank/extrato/arquivo - Importação do extrato por arquivo
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Segunda via de importação prevista no item 6.1.3.3 do documento de visão:
// "importação de arquivo, nesse caso solicitar ao usuário indicação de um
//  arquivo e importar conforme parametrização do banco".
//
// Movimentos idênticos aos já existentes são ignorados (upsert por chave
// composta), atendendo a regra "caso já exista movimento idêntico ignorar".
// ============================================================================

import { NextResponse } from 'next/server';
import { buscaContaPorCodigo } from '../../../../../lib/repositories/contaRepository.js';
import {
   gravaMovimentosArquivo,
   listaMovimentosArquivo,
} from '../../../../../lib/repositories/movimentoRepository.js';
import {
   ACAO_IMPORTACAO_ARQUIVO,
   registraArquivoImportado,
   registraAuditoria,
} from '../../../../../lib/repositories/auditoriaRepository.js';
import {
   EXTENSOES_ACEITAS,
   TAMANHO_MAXIMO_BYTES,
   interpretaArquivoExtrato,
} from '../../../../../lib/conciliacao/parserExtrato.js';

export const dynamic = 'force-dynamic';

/** Identifica a procedência dos movimentos devolvidos */
export const ORIGEM_ARQUIVO = 'ARQUIVO';

/**
 * Converte os movimentos lidos do arquivo para o formato da grade,
 * gerando a chave composta usada no upsert.
 * @param {Array<object>} aMovimentosLidos
 * @param {string} sCodConta
 * @param {string} sFormato
 * @returns {Array<object>}
 */
function normalizaMovimentos(aMovimentosLidos, sCodConta, sFormato) {
   return aMovimentosLidos.map((oMovimento, iIndice) => {
      const nEntrada = oMovimento.valEntrada ?? 0;
      const bEntrada = nEntrada > 0;
      const nValor = bEntrada ? nEntrada : (oMovimento.valSaida ?? 0);

      // Mesma estratégia da importação por API: chave determinística, para que
      // reenviar o mesmo arquivo atualize os registros em vez de duplicá-los
      const sCod = [
         sFormato,
         sCodConta,
         String(oMovimento.datMovimento ?? '').replace(/\D/g, ''),
         oMovimento.numDocumento || String(iIndice),
         bEntrada ? 'E' : 'S',
         String(Math.round(nValor * 100)),
      ].join('-');

      return {
         codMovimento: sCod,
         codConta: sCodConta,
         datMovimento: oMovimento.datMovimento,
         desHistorico: oMovimento.desHistorico,
         numDocumento: oMovimento.numDocumento ?? '',
         valMovimento: nValor,
         bEntrada,
         staConciliado: false,
         codigoLancamento: oMovimento.codigoLancamento ?? '',
      };
   });
} // normalizaMovimentos

/**
 * Valida a extensão do arquivo enviado.
 * @param {string} sNomeArquivo
 * @returns {boolean}
 */
function extensaoAceita(sNomeArquivo) {
   const sNome = String(sNomeArquivo ?? '').toLowerCase();
   return EXTENSOES_ACEITAS.some((sExtensao) => sNome.endsWith(sExtensao));
} // extensaoAceita

/**
 * POST /api/bank/extrato/arquivo
 * Corpo: multipart/form-data com os campos "arquivo" e "conta".
 * @param {Request} oRequisicao
 * @returns {Promise<NextResponse>}
 */
export async function POST(oRequisicao) {
   let oFormulario = null;

   try {
      oFormulario = await oRequisicao.formData();
   } catch {
      return NextResponse.json(
         { erro: 'Envie o arquivo em um formulário multipart/form-data.' },
         { status: 400 }
      );
   }

   const oArquivo = oFormulario.get('arquivo');
   const sCodConta = String(oFormulario.get('conta') ?? '');

   // Todas as validações ocorrem antes de qualquer gravação
   if (!sCodConta) {
      return NextResponse.json({ erro: 'Selecione a conta corrente antes de importar.' }, { status: 400 });
   }
   if (!oArquivo || typeof oArquivo.arrayBuffer !== 'function') {
      return NextResponse.json({ erro: 'Nenhum arquivo foi enviado.' }, { status: 400 });
   }
   if (!extensaoAceita(oArquivo.name)) {
      return NextResponse.json(
         { erro: `Formato não suportado. Envie um arquivo ${EXTENSOES_ACEITAS.join(', ')}.` },
         { status: 400 }
      );
   }
   if (oArquivo.size > TAMANHO_MAXIMO_BYTES) {
      return NextResponse.json(
         { erro: `Arquivo muito grande. O limite é ${TAMANHO_MAXIMO_BYTES / 1024 / 1024} MB.` },
         { status: 413 }
      );
   }

   try {
      const oConta = await buscaContaPorCodigo(sCodConta);
      if (!oConta) {
         return NextResponse.json(
            { erro: `Conta "${sCodConta}" não localizada no cadastro.` },
            { status: 404 }
         );
      }

      // Extratos brasileiros costumam vir em latin1; a checagem do caractere
      // de substituição indica que a leitura como UTF-8 corrompeu o texto
      const oBuffer = Buffer.from(await oArquivo.arrayBuffer());
      let sConteudo = oBuffer.toString('utf8');
      if (sConteudo.includes('�')) {
         sConteudo = oBuffer.toString('latin1');
      }

      const { aMovimentos: aLidos, sFormato } = interpretaArquivoExtrato(oArquivo.name, sConteudo);

      if (aLidos.length === 0) {
         return NextResponse.json(
            {
               erro:
                  'Nenhum movimento foi reconhecido no arquivo. ' +
                  'Confira se o arquivo é um OFX válido ou se o CSV possui cabeçalho com Data, Histórico e Valor.',
            },
            { status: 422 }
         );
      }

      const aMovimentos = normalizaMovimentos(aLidos, sCodConta, sFormato);

      // Compara com o que já existe para informar quantos foram ignorados
      const aExistentes = await listaMovimentosArquivo(oConta.idConta);
      const oChavesExistentes = new Set(aExistentes.map((oItem) => oItem.codMovimento));
      const iNovos = aMovimentos.filter((oItem) => !oChavesExistentes.has(oItem.codMovimento)).length;
      const iIgnorados = aMovimentos.length - iNovos;

      await gravaMovimentosArquivo(oConta.idConta, aMovimentos);

      await registraArquivoImportado({
         idConta: oConta.idConta,
         nomArquivo: oArquivo.name,
         tipFormato: sFormato,
         numBytes: oArquivo.size,
         qtdLidos: aMovimentos.length,
         qtdImportados: iNovos,
         qtdIgnorados: iIgnorados,
      });

      await registraAuditoria({
         idConta: oConta.idConta,
         tipAcao: ACAO_IMPORTACAO_ARQUIVO,
         desEntidade: 'movimento',
         codEntidade: oArquivo.name,
         desDetalhe:
            `Arquivo ${sFormato} "${oArquivo.name}" importado: ` +
            `${aMovimentos.length} movimento(s) lido(s), ${iNovos} novo(s), ${iIgnorados} já existente(s).`,
      });

      // Devolve tudo o que veio de arquivo nesta conta. Os movimentos de API
      // não entram aqui: a tela os obtém consultando a instituição.
      const aTodos = await listaMovimentosArquivo(oConta.idConta);

      return NextResponse.json({
         movimentos: aTodos,
         origem: ORIGEM_ARQUIVO,
         formato: sFormato,
         resumo: {
            iLidos: aMovimentos.length,
            iImportados: iNovos,
            iIgnorados: iIgnorados,
         },
         mensagem:
            `Arquivo ${sFormato} importado: ${iNovos} movimento(s) novo(s)` +
            (iIgnorados > 0 ? ` e ${iIgnorados} já existente(s) ignorado(s).` : '.'),
      });
   } catch (oErro) {
      console.error('[api/bank/extrato/arquivo] Falha na importação:', oErro);
      return NextResponse.json(
         { erro: `Não foi possível importar o arquivo: ${oErro.message}` },
         { status: 500 }
      );
   }
} // POST
