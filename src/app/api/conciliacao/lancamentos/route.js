// ============================================================================
// api/conciliacao/lancamentos - Lançamentos do sistema (SQL Server / Satis)
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
 // Sem massa falsa: se ainda não houver integração Satis, a grade vem vazia.
// ============================================================================

import { NextResponse } from 'next/server';
import { dataBrParaSql } from '../../../../lib/db.js';
import { buscaContaPorCodigo, leBloqueioConta } from '../../../../lib/repositories/contaRepository.js';
import {
   atualizaLancamento,
   buscaLancamento,
   calculaSaldoAnterior,
   excluiLancamento,
   insereLancamento,
   listaLancamentosPeriodo,
   listaPernasTransferencia,
} from '../../../../lib/repositories/lancamentoRepository.js';
import {
   ACAO_LANCAMENTO_ALTERADO,
   ACAO_LANCAMENTO_EXCLUIDO,
   ACAO_LANCAMENTO_INCLUIDO,
   registraAuditoria,
} from '../../../../lib/repositories/auditoriaRepository.js';
import { calculaSaldoAnteriorBanco } from '../../../../lib/repositories/movimentoRepository.js';
import { normalizaRateio, validaRateio } from '../../../../utils/rateio.js';

export const dynamic = 'force-dynamic';

/**
 * Confere se a data cai no período bloqueado (item 6.1.3.1).
 * @param {string} sDatBloqueio Bloqueio da conta (DD/MM/AAAA)
 * @param {string} sData Data do lançamento (DD/MM/AAAA)
 * @returns {boolean}
 */
function caiNoBloqueio(sDatBloqueio, sData) {
   const sDatBloqueioSql = dataBrParaSql(sDatBloqueio);
   const sDataSql = dataBrParaSql(sData);
   return Boolean(sDatBloqueioSql && sDataSql && sDataSql <= sDatBloqueioSql);
} // caiNoBloqueio

/**
 * Confere o bloqueio de período para alterar ou excluir um lançamento.
 *
 * Valem a data atual do registro e, na alteração, a nova data: mover um
 * lançamento para fora de um período fechado também altera aquele período.
 * Na transferência, as duas contas são conferidas — o movimento é o mesmo nos
 * dois caixas, e cada conta tem o seu bloqueio.
 *
 * @param {object} oConta Conta aberta na tela
 * @param {object} oLancamento Lançamento como está gravado
 * @param {string[]} aDatas Datas a conferir
 * @param {'alterar'|'excluir'} sAcao Ação pretendida, para a mensagem
 * @returns {Promise<string>} Mensagem de impedimento, ou string vazia
 */
async function verificaBloqueioAlteracao(oConta, oLancamento, aDatas, sAcao) {
   const aDatasValidas = aDatas.filter(Boolean);

   if (!oLancamento.codTransferencia) {
      const sDataBloqueada = aDatasValidas.find((sData) => caiNoBloqueio(oConta.datUltimoBloqueio, sData));
      return sDataBloqueada
         ? `A conta está bloqueada para lançamentos até ${oConta.datUltimoBloqueio}; ` +
              `não é possível ${sAcao} lançamento com data ${sDataBloqueada}.`
         : '';
   }

   const aPernas = await listaPernasTransferencia(oLancamento.codLancamento);
   for (const oPerna of aPernas) {
      const sDatBloqueio = await leBloqueioConta({ ...oPerna, codEmp: oConta.codEmp });
      const sDataBloqueada = [...aDatasValidas, oPerna.datMovimento].find((sData) =>
         caiNoBloqueio(sDatBloqueio, sData)
      );
      if (sDataBloqueada) {
         return (
            `A conta ${oPerna.codAgencia}/${oPerna.numContaCorrente}, ponta desta transferência, está ` +
            `bloqueada para lançamentos até ${sDatBloqueio}. Remova o bloqueio das duas contas antes de ${sAcao}.`
         );
      }
   }

   return '';
} // verificaBloqueioAlteracao

/**
 * Valida os campos comuns à inclusão e à alteração.
 *
 * Ata de 24/09/2026: o subgrupo é obrigatório, conforme regra do ERP, e o
 * rateio por centro de custo, quando informado, fecha no valor do lançamento.
 *
 * @param {object} oCorpo
 * @returns {string} Mensagem de erro, ou string vazia
 */
function validaCamposLancamento(oCorpo) {
   if (!oCorpo.datMovimento || !dataBrParaSql(oCorpo.datMovimento)) {
      return 'Informe a data do movimento.';
   }
   if (!oCorpo.desHistorico || !String(oCorpo.desHistorico).trim()) {
      return 'Informe o histórico do lançamento.';
   }
   const nValor = Number(oCorpo.valMovimento);
   if (!Number.isFinite(nValor) || nValor <= 0) {
      return 'O valor do lançamento deve ser maior que zero.';
   }
   if (!oCorpo.codSubgrupo || !String(oCorpo.codSubgrupo).trim()) {
      return 'Selecione o subgrupo do lançamento. O subgrupo é obrigatório no ERP.';
   }
   return validaRateio(normalizaRateio(oCorpo.aRateio), nValor);
} // validaCamposLancamento

/**
 * Monta o bloco de saldos de um dos lados da tela.
 *
 * O item 6.1.2 pede que "ambos os extratos" tragam saldo anterior, entradas e
 * saídas no período e saldo final — por isso a mesma função serve ao sistema
 * e ao banco.
 *
 * @param {number} nSaldoAnterior
 * @param {Array<object>} aRegistros Lançamentos ou movimentos do período
 * @returns {{ valSaldoAnterior: number, valEntradas: number,
 *             valSaidas: number, valSaldoFinal: number }}
 */
function montaSaldos(nSaldoAnterior, aRegistros) {
   let nEntradas = 0;
   let nSaidas = 0;

   for (const oRegistro of aRegistros) {
      if (oRegistro.bEntrada) {
         nEntradas += oRegistro.valMovimento;
      } else {
         nSaidas += oRegistro.valMovimento;
      }
   }

   return {
      valSaldoAnterior: nSaldoAnterior,
      valEntradas: nEntradas,
      valSaidas: nSaidas,
      valSaldoFinal: nSaldoAnterior + nEntradas - nSaidas,
   };
} // montaSaldos

/**
 * GET /api/conciliacao/lancamentos?conta=&dataInicio=&dataFim=
 */
export async function GET(oRequisicao) {
   const oParams = new URL(oRequisicao.url).searchParams;
   const sCodConta = oParams.get('conta') ?? '';
   const sDataInicio = oParams.get('dataInicio') ?? '';
   const sDataFim = oParams.get('dataFim') ?? '';
   const sCodLancamento = oParams.get('lancamento') ?? '';

   if (!sCodConta) {
      return NextResponse.json(
         { erro: 'Selecione a conta corrente a ser conciliada.' },
         { status: 400 }
      );
   }

   // Detalhe de um lançamento (tela de detalhes e de edição)
   if (sCodLancamento) {
      try {
         const oConta = await buscaContaPorCodigo(sCodConta);
         if (!oConta) {
            return NextResponse.json({ erro: `Conta "${sCodConta}" não localizada.` }, { status: 404 });
         }

         const oLancamento = await buscaLancamento(oConta, sCodLancamento);
         if (!oLancamento) {
            return NextResponse.json({ erro: 'Lançamento não localizado.' }, { status: 404 });
         }

         return NextResponse.json({ lancamento: oLancamento });
      } catch (oErro) {
         console.error('[api/conciliacao/lancamentos] Falha ao ler o lançamento:', oErro);
         return NextResponse.json({ erro: oErro.message }, { status: 500 });
      }
   }

   try {
      const oConta = await buscaContaPorCodigo(sCodConta);
      if (!oConta) {
         return NextResponse.json(
            { erro: `Conta corrente "${sCodConta}" não localizada no SQL Server.` },
            { status: 404 }
         );
      }

      // Os lançamentos do sistema SEMPRE respeitam o período (item 6.1.3.2:
      // o botão Buscar "traz os lançamentos e movimentos já registrados no
      // Satis" do período informado), e as duas grades cobrem a mesma janela —
      // sem isso a conferência entre os lados fica impossível.
      //
      // O recorte não é configurável: TBCONB001 é a tabela do ERP e tem o
      // histórico inteiro da conta (dezenas de milhares de movimentos desde
      // que ela existe). Mandar isso para o navegador travaria a tela.
      const aLancamentos = await listaLancamentosPeriodo(oConta, sDataInicio, sDataFim);

      // Saldo anterior é o acumulado ANTES da primeira linha da grade
      const [nSaldoAnterior, nSaldoAnteriorBanco] = await Promise.all([
         calculaSaldoAnterior(oConta, sDataInicio),
         calculaSaldoAnteriorBanco(oConta, sDataInicio),
      ]);


      return NextResponse.json({
         lancamentos: aLancamentos,
         conta: oConta,
         saldos: {
            // Bloco do sistema — mantido na raiz por compatibilidade com a tela
            ...montaSaldos(nSaldoAnterior, aLancamentos),
            datSaldoAnterior: sDataInicio,
            datSaldoFinal: sDataFim,
            // Item 6.1.2: cada extrato tem o seu próprio conjunto de saldos.
            // O do banco sai sem entradas/saídas: os movimentos do período
            // chegam pela API, e a tela os soma ao receber o extrato.
            oSistema: montaSaldos(nSaldoAnterior, aLancamentos),
            valSaldoAnteriorBanco: nSaldoAnteriorBanco,
         },
         periodo: { sDataInicio, sDataFim },
         aviso:
            aLancamentos.length === 0
               ? 'Nenhum lançamento do sistema no período. A grade ERP será preenchida quando a integração Satis estiver ativa.'
               : undefined,
      });
   } catch (oErro) {
      console.error('[api/conciliacao/lancamentos]', oErro);
      return NextResponse.json({ erro: oErro.message }, { status: 500 });
   }
} // GET

/**
 * POST /api/conciliacao/lancamentos
 * Inclui um lançamento no extrato do sistema (ação "Novo Lançamento").
 * Corpo: { conta, datMovimento, datCompensacao?, numDocumento?, desHistorico, valMovimento, bEntrada,
 *          tipDocumento, codSubgrupo, categoriaSubgrupo?, codContaContabil?, aRateio?, tipOrigem? }
 * @param {Request} oRequisicao
 * @returns {Promise<NextResponse>}
 */
export async function POST(oRequisicao) {
   let oCorpo = null;

   try {
      oCorpo = await oRequisicao.json();
   } catch {
      return NextResponse.json({ erro: 'Corpo da requisição inválido.' }, { status: 400 });
   }

   const sCodConta = String(oCorpo?.conta ?? '');

   // Validações antes de iniciar a gravação
   if (!sCodConta) {
      return NextResponse.json({ erro: 'Selecione a conta corrente.' }, { status: 400 });
   }
   const sErroCampos = validaCamposLancamento(oCorpo);
   if (sErroCampos) {
      return NextResponse.json({ erro: sErroCampos }, { status: 400 });
   }
   // O tipo de documento é obrigatório no ERP: TBCONB001 o exige na chave e
   // tem chave estrangeira para o cadastro de documentos (TBGENE009).
   if (!oCorpo.tipDocumento || !String(oCorpo.tipDocumento).trim()) {
      return NextResponse.json({ erro: 'Selecione o tipo de documento do lançamento.' }, { status: 400 });
   }

   const nValor = Number(oCorpo.valMovimento);

   try {
      const oConta = await buscaContaPorCodigo(sCodConta);
      if (!oConta) {
         return NextResponse.json({ erro: `Conta "${sCodConta}" não localizada.` }, { status: 404 });
      }

      // Não aceita lançamento em período já bloqueado (item 6.1.3.1)
      if (oConta.datUltimoBloqueio) {
         const sDatBloqueioSql = dataBrParaSql(oConta.datUltimoBloqueio);
         const sDatMovimentoSql = dataBrParaSql(oCorpo.datMovimento);
         if (sDatMovimentoSql && sDatBloqueioSql && sDatMovimentoSql <= sDatBloqueioSql) {
            return NextResponse.json(
               {
                  erro: `A conta está bloqueada para lançamentos até ${oConta.datUltimoBloqueio}. Informe uma data posterior.`,
               },
               { status: 409 }
            );
         }
      }

      const oLancamento = await insereLancamento(oConta, {
         datMovimento: oCorpo.datMovimento,
         datCompensacao: oCorpo.datCompensacao,
         numDocumento: oCorpo.numDocumento,
         desHistorico: String(oCorpo.desHistorico).trim(),
         valMovimento: nValor,
         bEntrada: Boolean(oCorpo.bEntrada),
         tipOrigem: oCorpo.tipOrigem,
         // Campos do item 6.1.3.8 — ação 1
         tipDocumento: oCorpo.tipDocumento,
         codSubgrupo: oCorpo.codSubgrupo,
         categoriaSubgrupo: oCorpo.categoriaSubgrupo,
         codContaContabil: oCorpo.codContaContabil,
         aRateio: normalizaRateio(oCorpo.aRateio),
      });

      // A mensagem de sucesso é emitida somente após concluir a gravação
      await registraAuditoria({
         oConta,
         tipAcao: ACAO_LANCAMENTO_INCLUIDO,
         desEntidade: 'lancamento',
         codEntidade: oLancamento.codLancamento,
         desDetalhe:
            `Lançamento ${oLancamento.codLancamento} incluído: ${oLancamento.desHistorico} ` +
            `(${oLancamento.bEntrada ? 'entrada' : 'saída'} em ${oLancamento.datMovimento}).`,
         valReferencia: oLancamento.valMovimento,
      });

      return NextResponse.json({
         lancamento: { ...oLancamento, codConta: sCodConta },
         mensagem: `Lançamento ${oLancamento.codLancamento} incluído com sucesso.`,
      });
   } catch (oErro) {
      console.error('[api/conciliacao/lancamentos] Falha ao incluir:', oErro);
      return NextResponse.json({ erro: oErro.message }, { status: 500 });
   }
} // POST

/**
 * PUT /api/conciliacao/lancamentos
 * Altera um lançamento originado na conciliação (ata de 24/09/2026).
 * Corpo: { conta, lancamento, datMovimento, datCompensacao?, desHistorico, valMovimento, bEntrada,
 *          codSubgrupo, categoriaSubgrupo?, codContaContabil?, aRateio? }
 *
 * Origem, tipo e número do documento não são alterados: a origem fica
 * bloqueada em lançamento existente, e documento faz parte da chave.
 *
 * @param {Request} oRequisicao
 * @returns {Promise<NextResponse>}
 */
export async function PUT(oRequisicao) {
   let oCorpo = null;

   try {
      oCorpo = await oRequisicao.json();
   } catch {
      return NextResponse.json({ erro: 'Corpo da requisição inválido.' }, { status: 400 });
   }

   const sCodConta = String(oCorpo?.conta ?? '');
   const sCodLancamento = String(oCorpo?.lancamento ?? '');

   // Validações antes de iniciar a gravação
   if (!sCodConta || !sCodLancamento) {
      return NextResponse.json({ erro: 'Informe a conta e o lançamento a ser alterado.' }, { status: 400 });
   }
   const sErroCampos = validaCamposLancamento(oCorpo);
   if (sErroCampos) {
      return NextResponse.json({ erro: sErroCampos }, { status: 400 });
   }

   try {
      const oConta = await buscaContaPorCodigo(sCodConta);
      if (!oConta) {
         return NextResponse.json({ erro: `Conta "${sCodConta}" não localizada.` }, { status: 404 });
      }

      const oAtual = await buscaLancamento(oConta, sCodLancamento);
      if (!oAtual) {
         return NextResponse.json({ erro: 'Lançamento não localizado.' }, { status: 404 });
      }
      if (!oAtual.bEditavel) {
         return NextResponse.json(
            {
               erro: oAtual.staConciliado
                  ? 'Lançamento conciliado não pode ser alterado. Estorne a conciliação antes.'
                  : `Somente lançamentos originados na conciliação podem ser alterados (origem atual: ${oAtual.tipOrigem}).`,
            },
            { status: 409 }
         );
      }

      const sImpedimento = await verificaBloqueioAlteracao(oConta, oAtual, [
         oAtual.datMovimento,
         oCorpo.datMovimento,
      ], 'alterar');
      if (sImpedimento) {
         return NextResponse.json({ erro: sImpedimento }, { status: 409 });
      }

      const oLancamento = await atualizaLancamento(oConta, sCodLancamento, {
         datMovimento: oCorpo.datMovimento,
         datCompensacao: oCorpo.datCompensacao,
         desHistorico: String(oCorpo.desHistorico).trim(),
         valMovimento: Number(oCorpo.valMovimento),
         bEntrada: Boolean(oCorpo.bEntrada),
         codSubgrupo: oCorpo.codSubgrupo,
         categoriaSubgrupo: oCorpo.categoriaSubgrupo,
         codContaContabil: oCorpo.codContaContabil,
         aRateio: normalizaRateio(oCorpo.aRateio),
      });

      await registraAuditoria({
         oConta,
         tipAcao: ACAO_LANCAMENTO_ALTERADO,
         desEntidade: oAtual.codTransferencia ? 'transferencia' : 'lancamento',
         codEntidade: oAtual.codTransferencia ?? sCodLancamento,
         desDetalhe:
            `Lançamento ${oLancamento.numDocumento} alterado: ${oAtual.datMovimento} ${oAtual.valMovimento.toFixed(2)} ` +
            `→ ${oLancamento.datMovimento} ${oLancamento.valMovimento.toFixed(2)}` +
            (oAtual.codTransferencia ? ' (as duas pontas da transferência).' : '.'),
         valReferencia: oLancamento.valMovimento,
      });

      return NextResponse.json({
         lancamento: { ...oLancamento, codConta: sCodConta },
         mensagem: oAtual.codTransferencia
            ? `Transferência ${oLancamento.numDocumento} alterada nas duas contas.`
            : `Lançamento ${oLancamento.numDocumento} alterado com sucesso.`,
      });
   } catch (oErro) {
      console.error('[api/conciliacao/lancamentos] Falha ao alterar:', oErro);
      return NextResponse.json({ erro: oErro.message }, { status: 500 });
   }
} // PUT

/**
 * DELETE /api/conciliacao/lancamentos?conta=&lancamento=
 * Exclui um lançamento originado na conciliação (item 6.1.3.8 — ação 4).
 * @param {Request} oRequisicao
 * @returns {Promise<NextResponse>}
 */
export async function DELETE(oRequisicao) {
   const oParams = new URL(oRequisicao.url).searchParams;
   const sCodConta = oParams.get('conta') ?? '';
   const sCodLancamento = oParams.get('lancamento') ?? '';

   if (!sCodConta || !sCodLancamento) {
      return NextResponse.json(
         { erro: 'Informe a conta e o lançamento a ser excluído.' },
         { status: 400 }
      );
   }

   try {
      const oConta = await buscaContaPorCodigo(sCodConta);
      if (!oConta) {
         return NextResponse.json({ erro: `Conta "${sCodConta}" não localizada.` }, { status: 404 });
      }

      // Excluir também altera o período: a trava do item 6.1.3.1 vale aqui,
      // e na transferência vale para as duas contas
      const oAtual = await buscaLancamento(oConta, sCodLancamento);
      if (oAtual) {
         const sImpedimento = await verificaBloqueioAlteracao(oConta, oAtual, [oAtual.datMovimento], 'excluir');
         if (sImpedimento) {
            return NextResponse.json({ erro: sImpedimento }, { status: 409 });
         }
      }

      const oResultado = await excluiLancamento(oConta, sCodLancamento);
      if (!oResultado.bExcluido) {
         return NextResponse.json({ erro: oResultado.sMotivo }, { status: 409 });
      }


      const sDetalhe = oResultado.codTransferencia
         ? `Transferência ${oResultado.codTransferencia} excluída: ${oResultado.iPernasExcluidas} lançamento(s) removido(s) nas duas contas.`
         : `Lançamento ${sCodLancamento} excluído da conciliação.`;

      await registraAuditoria({
         oConta,
         tipAcao: ACAO_LANCAMENTO_EXCLUIDO,
         desEntidade: oResultado.codTransferencia ? 'transferencia' : 'lancamento',
         codEntidade: oResultado.codTransferencia ?? sCodLancamento,
         desDetalhe: sDetalhe,
      });

      return NextResponse.json({
         ok: true,
         codTransferencia: oResultado.codTransferencia ?? null,
         mensagem: sDetalhe,
      });
   } catch (oErro) {
      console.error('[api/conciliacao/lancamentos] Falha ao excluir:', oErro);
      return NextResponse.json({ erro: oErro.message }, { status: 500 });
   }
} // DELETE
