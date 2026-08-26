// ============================================================================
// api/sessao - Usuário corrente, permissões e catálogos do módulo
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Reúne o que a tela precisa saber antes de desenhar: quem é o usuário, o que
// ele pode fazer (item 6.1.3.1) e os catálogos das caixas de lançamento e
// transferência (item 6.1.3.8).
//
// As permissões devolvidas aqui servem só para a tela desabilitar botões e
// explicar o motivo. Cada rota que grava confere a permissão por conta
// própria — o navegador nunca é a fonte de autorização.
// ============================================================================

import { NextResponse } from 'next/server';
import { listaCatalogos } from '../../../lib/repositories/catalogoRepository.js';
import { carregaUsuarioAtual } from '../../../lib/repositories/usuarioRepository.js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sessao
 * @returns {Promise<NextResponse>}
 */
export async function GET() {
   try {
      const [oUsuario, oCatalogos] = await Promise.all([carregaUsuarioAtual(), listaCatalogos()]);

      return NextResponse.json({
         usuario: oUsuario,
         catalogos: oCatalogos,
         aviso: oUsuario.bCadastrado
            ? undefined
            : `O usuário "${oUsuario.nomUsuario}" não está cadastrado. Nenhuma permissão foi concedida.`,
      });
   } catch (oErro) {
      console.error('[api/sessao]', oErro);
      return NextResponse.json({ erro: oErro.message }, { status: 500 });
   }
} // GET
