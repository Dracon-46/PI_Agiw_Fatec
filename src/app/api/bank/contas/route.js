// ============================================================================
// api/bank/contas - Cadastro de conta corrente no MySQL
// Projeto Banco - Ticket 37060 | Agiw Sistemas
// ============================================================================

import { NextResponse } from 'next/server';
import {
   atualizaContaCorrente,
   cadastraContaCorrente,
   inativaConta,
   listaBancos,
} from '../../../../lib/repositories/contaRepository.js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/bank/contas — catálogo de bancos para o formulário
 */
export async function GET() {
   try {
      const aBancos = await listaBancos();
      return NextResponse.json({ bancos: aBancos });
   } catch (oErro) {
      return NextResponse.json({ erro: oErro.message }, { status: 500 });
   }
} // GET

/**
 * POST /api/bank/contas — cadastra conta real (banco/agência/C.C.)
 */
export async function POST(oRequisicao) {
   try {
      const oCorpo = await oRequisicao.json();
      const oConta = await cadastraContaCorrente(oCorpo);
      return NextResponse.json({ conta: oConta }, { status: 201 });
   } catch (oErro) {
      const nStatus = oErro.message?.includes('Já existe') || oErro.message?.includes('Informe')
         ? 400
         : 500;
      return NextResponse.json({ erro: oErro.message }, { status: nStatus });
   }
} // POST

/**
 * PUT /api/bank/contas — altera banco/agência/C.C. de uma conta cadastrada.
 * Corpo: { codConta, slugProvider, tipConta, codAgencia, numContaCorrente, ... }
 */
export async function PUT(oRequisicao) {
   try {
      const oCorpo = await oRequisicao.json();
      const sCodConta = String(oCorpo?.codConta ?? '');

      if (!sCodConta) {
         return NextResponse.json({ erro: 'Informe a conta a ser alterada.' }, { status: 400 });
      }

      const oConta = await atualizaContaCorrente(sCodConta, oCorpo);
      return NextResponse.json({ conta: oConta });
   } catch (oErro) {
      const nStatus =
         oErro.message?.includes('Já existe') ||
         oErro.message?.includes('Informe') ||
         oErro.message?.includes('inválido')
            ? 400
            : oErro.message?.includes('não localizada')
              ? 404
              : 500;
      return NextResponse.json({ erro: oErro.message }, { status: nStatus });
   }
} // PUT

/**
 * DELETE /api/bank/contas?conta=codConta — inativa conta
 */
export async function DELETE(oRequisicao) {
   try {
      const sCodConta = new URL(oRequisicao.url).searchParams.get('conta') ?? '';
      if (!sCodConta) {
         return NextResponse.json({ erro: 'Informe o código da conta.' }, { status: 400 });
      }
      const bOk = await inativaConta(sCodConta);
      if (!bOk) {
         return NextResponse.json({ erro: 'Conta não localizada.' }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
   } catch (oErro) {
      return NextResponse.json({ erro: oErro.message }, { status: 500 });
   }
} // DELETE
