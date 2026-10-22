// ============================================================================
// api/conciliacao/transferencia - Transferência entre contas
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Item 6.1.3.8 — ação 2 do documento de visão: "Abrir caixa para informar o
// banco/agência(conta) de contrapartida do movimento e gerar tanto o
// lançamento de débito como o de crédito."
//
// As duas pernas compartilham um mesmo cod_transferencia, o que permite
// tratá-las como um par indivisível na exclusão.
// ============================================================================

import { NextResponse } from 'next/server';
import { buscaContaPorCodigo } from '../../../../lib/repositories/contaRepository.js';
import { insereTransferencia } from '../../../../lib/repositories/lancamentoRepository.js';
import {
   ACAO_LANCAMENTO_INCLUIDO,
   registraAuditoria,
} from '../../../../lib/repositories/auditoriaRepository.js';
import { dataBrParaSql } from '../../../../lib/db.js';
import { normalizaRateio, validaRateio } from '../../../../utils/rateio.js';

export const dynamic = 'force-dynamic';

/**
 * Monta a identificação legível de uma conta, usada no histórico das pernas.
 * @param {object} oConta
 * @returns {string}
 */
function descreveConta(oConta) {
   return `${oConta.nomBanco} ${oConta.codAgencia}/${oConta.numContaCorrente}`;
} // descreveConta

/**
 * Verifica se a data cai em período bloqueado da conta (item 6.1.3.1).
 * @param {object} oConta
 * @param {string} sDatMovimento Data em DD/MM/AAAA
 * @returns {string} Mensagem de impedimento, ou string vazia
 */
function verificaBloqueio(oConta, sDatMovimento) {
   if (!oConta.datUltimoBloqueio) {
      return '';
   }

   const sDatBloqueio = dataBrParaSql(oConta.datUltimoBloqueio);
   const sDatMovimentoSql = dataBrParaSql(sDatMovimento);

   if (sDatMovimentoSql && sDatBloqueio && sDatMovimentoSql <= sDatBloqueio) {
      return (
         `A conta ${descreveConta(oConta)} está bloqueada para lançamentos até ` +
         `${oConta.datUltimoBloqueio}. Informe uma data posterior.`
      );
   }

   return '';
} // verificaBloqueio

/**
 * POST /api/conciliacao/transferencia
 * Corpo: { contaSaida, contaEntrada, datMovimento, numDocumento?, desHistorico, valMovimento,
 *          codSubgrupo, aRateio? }
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

   const sContaSaida = String(oCorpo?.contaSaida ?? '');
   const sContaEntrada = String(oCorpo?.contaEntrada ?? '');
   const sDatMovimento = String(oCorpo?.datMovimento ?? '');
   const sDesHistorico = String(oCorpo?.desHistorico ?? '').trim();
   const nValor = Number(oCorpo?.valMovimento);
   const sCodSubgrupo = String(oCorpo?.codSubgrupo ?? '').trim();
   const aRateio = normalizaRateio(oCorpo?.aRateio);

   // ---------- Validações (todas antes de gravar) ----------
   if (!sContaSaida || !sContaEntrada) {
      return NextResponse.json(
         { erro: 'Informe a conta de saída e a conta de entrada da transferência.' },
         { status: 400 }
      );
   }
   if (sContaSaida === sContaEntrada) {
      return NextResponse.json(
         { erro: 'As contas de origem e destino devem ser diferentes.' },
         { status: 400 }
      );
   }
   if (!sDatMovimento || !dataBrParaSql(sDatMovimento)) {
      return NextResponse.json({ erro: 'Informe a data da transferência.' }, { status: 400 });
   }
   if (!sDesHistorico) {
      return NextResponse.json({ erro: 'Informe o histórico da transferência.' }, { status: 400 });
   }
   if (!Number.isFinite(nValor) || nValor <= 0) {
      return NextResponse.json(
         { erro: 'O valor da transferência deve ser maior que zero.' },
         { status: 400 }
      );
   }
   // Ata de 24/09/2026: subgrupo é obrigatório, conforme regra do ERP
   if (!sCodSubgrupo) {
      return NextResponse.json(
         { erro: 'Selecione o subgrupo da transferência. O subgrupo é obrigatório no ERP.' },
         { status: 400 }
      );
   }
   const sErroRateio = validaRateio(aRateio, nValor);
   if (sErroRateio) {
      return NextResponse.json({ erro: sErroRateio }, { status: 400 });
   }

   try {
      const [oContaSaida, oContaEntrada] = await Promise.all([
         buscaContaPorCodigo(sContaSaida),
         buscaContaPorCodigo(sContaEntrada),
      ]);

      if (!oContaSaida) {
         return NextResponse.json(
            { erro: `Conta de saída "${sContaSaida}" não localizada.` },
            { status: 404 }
         );
      }
      if (!oContaEntrada) {
         return NextResponse.json(
            { erro: `Conta de entrada "${sContaEntrada}" não localizada.` },
            { status: 404 }
         );
      }

      // Nenhuma das duas pontas pode cair em período fechado
      const sImpedimento =
         verificaBloqueio(oContaSaida, sDatMovimento) || verificaBloqueio(oContaEntrada, sDatMovimento);
      if (sImpedimento) {
         return NextResponse.json({ erro: sImpedimento }, { status: 409 });
      }

      const oResultado = await insereTransferencia({
         oContaSaida,
         oContaEntrada,
         sDatMovimento,
         sNumDocumento: oCorpo?.numDocumento,
         sDesHistorico,
         nValor,
         sDesContaSaida: descreveConta(oContaSaida),
         sDesContaEntrada: descreveConta(oContaEntrada),
         sCodSubgrupo,
         aRateio,
      });

      // A auditoria registra as duas pontas, cada uma sob a sua conta
      await registraAuditoria({
         oConta: oContaSaida,
         tipAcao: ACAO_LANCAMENTO_INCLUIDO,
         desEntidade: 'transferencia',
         codEntidade: oResultado.sCodTransferencia,
         desDetalhe:
            `Transferência ${oResultado.sCodTransferencia}: saída de ${descreveConta(oContaSaida)} ` +
            `para ${descreveConta(oContaEntrada)} em ${sDatMovimento}.`,
         valReferencia: nValor,
      });
      await registraAuditoria({
         oConta: oContaEntrada,
         tipAcao: ACAO_LANCAMENTO_INCLUIDO,
         desEntidade: 'transferencia',
         codEntidade: oResultado.sCodTransferencia,
         desDetalhe:
            `Transferência ${oResultado.sCodTransferencia}: entrada em ${descreveConta(oContaEntrada)} ` +
            `vinda de ${descreveConta(oContaSaida)} em ${sDatMovimento}.`,
         valReferencia: nValor,
      });

      return NextResponse.json({
         codTransferencia: oResultado.sCodTransferencia,
         // A tela recebe apenas a perna da conta aberta; a outra fica na
         // contrapartida e aparece quando aquela conta for selecionada
         lancamentoSaida: { ...oResultado.oSaida, codConta: sContaSaida },
         lancamentoEntrada: { ...oResultado.oEntrada, codConta: sContaEntrada },
         mensagem:
            `Transferência ${oResultado.sCodTransferencia} gerada: débito em ` +
            `${descreveConta(oContaSaida)} e crédito em ${descreveConta(oContaEntrada)}.`,
      });
   } catch (oErro) {
      console.error('[api/conciliacao/transferencia] Falha ao gravar:', oErro);
      return NextResponse.json({ erro: oErro.message }, { status: 500 });
   }
} // POST
