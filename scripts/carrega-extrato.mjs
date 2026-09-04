// ============================================================================
// carrega-extrato.mjs - Traz o extrato das instituições para o MySQL
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Percorre as contas cadastradas cuja integração está completa e grava o
// extrato do período no MySQL, pelo mesmo caminho que a tela usa
// (lib/extratoBanco.js). Serve para deixar a base pronta antes de abrir o
// módulo, em vez de esperar a primeira busca de cada conta.
//
// Dias já consultados são pulados: o script pode ser repetido à vontade.
//
// Uso:
//   node scripts/carrega-extrato.mjs                       período padrão por banco
//   node scripts/carrega-extrato.mjs 01/09/2021 30/09/2021  período explícito
//   node scripts/carrega-extrato.mjs --conta=<codConta>     apenas uma conta
// ============================================================================

import dotenv from 'dotenv';

dotenv.config();

const { listaContasCorrentes } = await import('../src/lib/repositories/contaRepository.js');
const { leExtratoDaConta } = await import('../src/lib/extratoBanco.js');
const { getPool } = await import('../src/lib/db.js');

/**
 * Período padrão de cada banco nos ambientes de teste.
 *
 * Os sandboxes só respondem para janelas específicas: o Bradesco tem uma
 * combinação de agência/conta/período previamente cadastrada, e a carteira de
 * cobrança do Itaú tem posição apenas em setembro de 2021. Fora disso a
 * consulta volta vazia ou com erro, sem que haja problema na integração.
 */
const PERIODO_POR_BANCO = {
   bradesco: { sInicio: '06/11/2024', sFim: '20/11/2024' },
   itau: { sInicio: '01/09/2021', sFim: '30/09/2021' },
};

/** Período usado quando o banco não tem um padrão conhecido: últimos 30 dias */
function periodoRecente() {
   const dtFim = new Date();
   dtFim.setDate(dtFim.getDate() - 1);
   const dtInicio = new Date(dtFim);
   dtInicio.setDate(dtInicio.getDate() - 29);

   const formata = (dt) =>
      `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;

   return { sInicio: formata(dtInicio), sFim: formata(dtFim) };
} // periodoRecente

const aArgumentos = process.argv.slice(2);
const sContaFiltro = (aArgumentos.find((s) => s.startsWith('--conta=')) ?? '').replace('--conta=', '');
const aDatas = aArgumentos.filter((s) => !s.startsWith('--'));

async function main() {
   const aContas = await listaContasCorrentes();

   const aAlvo = aContas.filter(
      (oConta) => (!sContaFiltro || oConta.codConta === sContaFiltro) && oConta.bIntegracaoConfigurada
   );

   const aIgnoradas = aContas.filter((oConta) => !oConta.bIntegracaoConfigurada);

   if (aIgnoradas.length > 0) {
      console.log('Contas sem integração completa (ignoradas):');
      for (const oConta of aIgnoradas) {
         console.log(`  - ${oConta.codConta}: ${oConta.desPendenciaIntegracao || 'credencial ausente'}`);
      }
      console.log('');
   }

   if (aAlvo.length === 0) {
      console.log('Nenhuma conta com integração completa para carregar.');
      return;
   }

   let iTotal = 0;

   for (const oConta of aAlvo) {
      const oPeriodo =
         aDatas.length === 2
            ? { sInicio: aDatas[0], sFim: aDatas[1] }
            : (PERIODO_POR_BANCO[oConta.slugProvider] ?? periodoRecente());

      console.log(`${oConta.codConta} (${oConta.nomBanco}) — ${oPeriodo.sInicio} a ${oPeriodo.sFim}`);

      try {
         const oExtrato = await leExtratoDaConta(oConta, oPeriodo.sInicio, oPeriodo.sFim);
         iTotal += oExtrato.aMovimentos.length;

         console.log(
            `  ${oExtrato.aMovimentos.length} movimento(s) na base` +
               (oExtrato.iDiasBuscados > 0 ? `, ${oExtrato.iDiasBuscados} dia(s) lido(s) da API` : ', nada novo a buscar')
         );
         if (oExtrato.sAviso) {
            console.log(`  aviso: ${oExtrato.sAviso}`);
         }
      } catch (oErro) {
         console.log(`  FALHOU: ${oErro.message}`);
      }
   }

   console.log(`\n${iTotal} movimento(s) disponíveis no MySQL.`);
} // main

main()
   .catch((oErro) => {
      console.error('Falha ao carregar o extrato:', oErro.message);
      process.exitCode = 1;
   })
   .finally(async () => {
      await getPool().end();
   });
