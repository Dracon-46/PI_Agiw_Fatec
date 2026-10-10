// =============================================================================
// /api/health/route.js — Health Check Endpoint
// Projeto Banco · Ticket 37060 · Agiw Sistemas
//
// Utilizado por:
//   - Nginx: location /health
//   - ALB (em produção): health check do target group
//   - GitHub Actions CD: verificação pós-deploy
//   - CloudWatch: alarme de disponibilidade (via Synthetics ou URL check)
//
// Responde:
//   200 OK  → app online + banco acessível
//   503     → app online mas banco indisponível
// =============================================================================

import { getPool } from '@/lib/db';

export async function GET() {
   const sInicio = Date.now();

   // Verificação de conectividade com o banco MySQL
   let oBancoStatus = { ok: false, latenciaMs: null, erro: null };

   try {
      const oPool = getPool();
      const [aRows] = await oPool.query('SELECT 1 AS ping');

      oBancoStatus = {
         ok: aRows?.[0]?.ping === 1,
         latenciaMs: Date.now() - sInicio,
         erro: null,
      };
   } catch (oErro) {
      oBancoStatus = {
         ok: false,
         latenciaMs: Date.now() - sInicio,
         // Não expõe detalhes do erro (host, user, etc.) para segurança
         erro: 'Falha na conexão com o banco de dados',
      };
   }

   const nStatusHttp = oBancoStatus.ok ? 200 : 503;

   const oResposta = {
      status: oBancoStatus.ok ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      versao: process.env.npm_package_version || '2.0.0',
      ambiente: process.env.NODE_ENV || 'development',
      servicos: {
         banco: {
            ok: oBancoStatus.ok,
            latenciaMs: oBancoStatus.latenciaMs,
            // Somente expõe mensagem de erro (sem credenciais)
            ...(oBancoStatus.erro && { mensagem: oBancoStatus.erro }),
         },
      },
      uptimeSegundos: Math.floor(process.uptime()),
   };

   return Response.json(oResposta, {
      status: nStatusHttp,
      headers: {
         // Sem cache — sempre consulta o estado real
         'Cache-Control': 'no-store, no-cache, must-revalidate',
         'Content-Type': 'application/json',
      },
   });
} // GET
