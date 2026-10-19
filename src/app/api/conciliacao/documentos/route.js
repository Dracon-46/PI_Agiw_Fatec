// ============================================================================
// api/conciliacao/documentos - Contas que usam um tipo de documento
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Ata de 24/09/2026 — Pesquisa e Autocomplete: "Ao selecionar um documento,
// filtrar automaticamente as opções disponíveis de banco". A caixa de
// lançamento pergunta aqui em quais contas o documento escolhido já foi
// lançado, e reduz a lista de bancos a elas.
// ============================================================================

import { NextResponse } from 'next/server';
import { listaContasCorrentes } from '../../../../lib/repositories/contaRepository.js';
import { listaContasPorTipoDocumento } from '../../../../lib/repositories/lancamentoRepository.js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/conciliacao/documentos?tipo=CODDOCUM
 * @param {Request} oRequisicao
 * @returns {Promise<NextResponse>} { contas: string[] } — códigos de conta da tela
 */
export async function GET(oRequisicao) {
   const sTipo = (new URL(oRequisicao.url).searchParams.get('tipo') ?? '').trim();

   if (!sTipo) {
      return NextResponse.json({ erro: 'Informe o tipo de documento.' }, { status: 400 });
   }

   try {
      const [aUso, aContas] = await Promise.all([listaContasPorTipoDocumento(sTipo), listaContasCorrentes()]);

      // O ERP identifica a conta por banco + agência + conta corrente; a tela,
      // pelo código lógico. A tradução é feita aqui, sobre as contas ativas.
      const aCodContas = aContas
         .filter((oConta) =>
            aUso.some(
               (oUso) =>
                  oUso.codBancoErp === oConta.codBancoErp &&
                  oUso.codAgencia === oConta.codAgencia &&
                  oUso.numContaCorrente === oConta.numContaCorrente
            )
         )
         .map((oConta) => oConta.codConta);

      return NextResponse.json({ contas: aCodContas });
   } catch (oErro) {
      console.error('[api/conciliacao/documentos]', oErro);
      return NextResponse.json({ erro: oErro.message }, { status: 500 });
   }
} // GET
