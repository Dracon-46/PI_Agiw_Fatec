// ============================================================================
// api/auditoria - Consulta da trilha de auditoria
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Atende o item 6.5 das sugestões: consulta do registro de todas as ações
// realizadas no módulo, com filtros por conta, tipo de ação e período.
// ============================================================================

import { NextResponse } from 'next/server';
import { buscaContaPorCodigo } from '../../../lib/repositories/contaRepository.js';
import {
   ROTULOS_ACAO,
   listaArquivosImportados,
   listaAuditoria,
   resumeAuditoriaPorAcao,
} from '../../../lib/repositories/auditoriaRepository.js';
import { dataBrParaMysql } from '../../../lib/db.js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auditoria?conta=&acao=&dataInicio=&dataFim=&limite=
 * @param {Request} oRequisicao
 * @returns {Promise<NextResponse>}
 */
export async function GET(oRequisicao) {
   const oParams = new URL(oRequisicao.url).searchParams;
   const sCodConta = oParams.get('conta') ?? '';
   const sAcao = oParams.get('acao') ?? '';
   const sDataInicio = oParams.get('dataInicio') ?? '';
   const sDataFim = oParams.get('dataFim') ?? '';
   const iLimite = Number(oParams.get('limite') ?? 0);

   try {
      let iIdConta = null;
      if (sCodConta) {
         const oConta = await buscaContaPorCodigo(sCodConta);
         if (!oConta) {
            return NextResponse.json({ erro: `Conta "${sCodConta}" não localizada.` }, { status: 404 });
         }
         iIdConta = oConta.idConta;
      }

      const aEventos = await listaAuditoria({
         idConta: iIdConta,
         tipAcao: sAcao,
         datInicioMysql: dataBrParaMysql(sDataInicio),
         datFimMysql: dataBrParaMysql(sDataFim),
         iLimite,
      });

      const aResumo = await resumeAuditoriaPorAcao(iIdConta);
      const aArquivos = iIdConta ? await listaArquivosImportados(iIdConta) : [];

      return NextResponse.json({
         eventos: aEventos,
         resumo: aResumo,
         arquivos: aArquivos,
         acoesDisponiveis: Object.entries(ROTULOS_ACAO).map(([sChave, sRotulo]) => ({
            tipAcao: sChave,
            desAcao: sRotulo,
         })),
      });
   } catch (oErro) {
      console.error('[api/auditoria] Falha na consulta:', oErro);
      return NextResponse.json({ erro: oErro.message }, { status: 500 });
   }
} // GET
