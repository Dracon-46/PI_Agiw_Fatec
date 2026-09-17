// ============================================================================
// seed-espelho.mjs - Massa espelhada para exercitar a conciliação
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Sem contrapartida no lado do sistema não há o que conciliar: a tela abre com
// o extrato do banco de um lado e nada do outro. Este script cria, para cada
// movimento que ESTE módulo trouxe da API, o lançamento equivalente em
// TBCONB001 — o que o Satis geraria ao registrar aquele movimento.
//
// Nada é inventado: data, valor e sentido vêm do extrato real da instituição.
// O que o script acrescenta é a leitura contábil do movimento (histórico
// descritivo) e a origem "Conciliação".
//
// Por padrão UM movimento fica sem contrapartida. Extrato e sistema idênticos
// deixariam a tela conciliando tudo de primeira e nunca exercitariam a
// pendência — que é o caso real e o motivo de existirem o "Novo Lançamento" e
// a conciliação manual. Use --espelhar-tudo para não deixar sobra.
//
// A TRAVA que torna isso seguro em base real: o espelho só considera os
// movimentos cujo NOMEARQUIVO começa com "API", isto é, só o extrato que este
// módulo importou da instituição. O extrato que o Satis importou por arquivo
// (e o movimento real do cliente) fica de fora — o script não tem como gerar
// lançamento em cima dele.
//
// Uso:
//   node scripts/seed-espelho.mjs --conta=<codConta> --confirmo
//   node scripts/seed-espelho.mjs --conta=<codConta> --confirmo --espelhar-tudo
//   node scripts/seed-espelho.mjs --conta=<codConta> --confirmo --tipo=TED
//   node scripts/seed-espelho.mjs --conta=<codConta> --confirmo --limpar
// ============================================================================

import dotenv from 'dotenv';

dotenv.config();

const { dataBrParaSql, dataSqlParaBr, fechaConexao } = await import('../src/lib/db.js');
const { listaDiasDoPeriodo } = await import('../src/lib/extratoBanco.js');
const { buscaContaPorCodigo } = await import('../src/lib/repositories/contaRepository.js');
const { listaMovimentosDaApi, marcaDiasConsultados } = await import(
   '../src/lib/repositories/movimentoRepository.js'
);
const {
   ORIGEM_CONCILIACAO,
   excluiLancamento,
   insereLancamento,
   listaLancamentosPeriodo,
} = await import('../src/lib/repositories/lancamentoRepository.js');

/** Tipo de documento padrão do espelho; precisa existir em TBGENE009 */
const TIPO_DOCUMENTO_PADRAO = 'TED';

/** Prefixo do NUMDOCTO dos lançamentos de espelho */
const PREFIXO_ESPELHO = 'MC';

/**
 * Monta o NUMDOCTO do espelho a partir do movimento que ele reflete.
 *
 * O número é DERIVADO da sequência do extrato (NUMSEQMOVTO), e não gerado por
 * MAX+1: assim o mesmo movimento produz sempre o mesmo documento, e rodar o
 * script duas vezes atualiza o lançamento em vez de criar uma segunda cópia.
 *
 * @param {object} oMovimento
 * @returns {string} NUMDOCTO com 8 posições, ex.: "MC000001"
 */
function numDoctoEspelho(oMovimento) {
   return `${PREFIXO_ESPELHO}${String(oMovimento.codMovimento).replace(/\D/g, '').slice(-6).padStart(6, '0')}`;
} // numDoctoEspelho

/**
 * Lê um argumento nomeado da linha de comando.
 * @param {string} sNome
 * @returns {string} Vazio quando não informado
 */
function argumento(sNome) {
   const sArg = process.argv.slice(2).find((s) => s.startsWith(`--${sNome}=`));
   return sArg ? sArg.split('=').slice(1).join('=').trim() : '';
} // argumento

/**
 * Indica se uma opção sem valor foi passada.
 * @param {string} sNome
 * @returns {boolean}
 */
function opcao(sNome) {
   return process.argv.slice(2).includes(`--${sNome}`);
} // opcao

/**
 * Remove os lançamentos que este script criou.
 *
 * A exclusão passa pelas MESMAS regras da tela (item 6.1.3.8 — ação 4): o
 * lançamento conciliado é recusado com o motivo, em vez de sair à força. Quem
 * quer limpar um espelho já conciliado estorna a conciliação primeiro.
 *
 * @param {object} oConta
 * @returns {Promise<void>}
 */
async function limpaEspelho(oConta) {
   // A janela é larga de propósito: o sandbox devolve datas fora do período
   // pedido, e o espelho acompanha o extrato onde ele estiver.
   const aLancamentos = await listaLancamentosPeriodo(oConta, '01/01/2000', '31/12/2099');
   const aEspelho = aLancamentos.filter(
      (oItem) =>
         oItem.tipOrigem === ORIGEM_CONCILIACAO && oItem.numDocumento.startsWith(PREFIXO_ESPELHO)
   );

   if (aEspelho.length === 0) {
      console.log('Nenhum lançamento de espelho encontrado nesta conta.');
      return;
   }

   let iRemovidos = 0;
   for (const oLancamento of aEspelho) {
      const oResultado = await excluiLancamento(oConta, oLancamento.codLancamento);
      if (oResultado.bExcluido) {
         iRemovidos += 1;
      } else {
         console.log(`  ${oLancamento.numDocumento}: ${oResultado.sMotivo}`);
      }
   }

   console.log(`${iRemovidos} de ${aEspelho.length} lançamento(s) de espelho removido(s).`);
} // limpaEspelho

async function main() {
   const sCodConta = argumento('conta');
   const sTipoDocumento = argumento('tipo') || TIPO_DOCUMENTO_PADRAO;
   const bLimpar = opcao('limpar');
   const bEspelharTudo = opcao('espelhar-tudo');

   if (!sCodConta) {
      console.error('Informe a conta: --conta=<codConta> (ex.: --conta=bradesco-3750-75557).');
      process.exitCode = 1;
      return;
   }

   const oConta = await buscaContaPorCodigo(sCodConta);
   if (!oConta) {
      console.error(`Conta "${sCodConta}" não localizada entre as contas ativas do ERP.`);
      process.exitCode = 1;
      return;
   }

   // A confirmação é exigida porque o script GRAVA em TBCONB001, a tabela de
   // movimento do ERP. Rodar sem querer é o risco que ela evita.
   if (!opcao('confirmo')) {
      console.log(
         `Este script ${bLimpar ? 'REMOVE de' : 'GRAVA em'} dbo.TBCONB001 (movimento do ERP), ` +
            `na conta ${oConta.codConta} — ${oConta.nomBanco} ag ${oConta.codAgencia} cc ${oConta.numContaCorrente}.\n` +
            'Confirme acrescentando --confirmo à linha de comando.'
      );
      return;
   }

   if (bLimpar) {
      await limpaEspelho(oConta);
      return;
   }

   const aMovimentos = await listaMovimentosDaApi(oConta);

   if (aMovimentos.length === 0) {
      console.log(
         'Nenhum movimento vindo da API e não conciliado nesta conta.\n' +
            'Importe o extrato primeiro (npm run db:extrato, ou o botão Buscar na tela).\n' +
            'Lembre-se: o espelho só considera o extrato que ESTE módulo trouxe da ' +
            'instituição — o que o Satis importou por arquivo fica de fora.'
      );
      return;
   }

   // O último movimento fica sem contrapartida: é a pendência que o usuário
   // resolve na tela. Com mais de um movimento sempre sobra exatamente um.
   const bDeixaPendente = !bEspelharTudo && aMovimentos.length > 1;
   const aEspelhar = bDeixaPendente ? aMovimentos.slice(0, -1) : aMovimentos;
   const oPendente = bDeixaPendente ? aMovimentos[aMovimentos.length - 1] : null;

   console.log(
      `${oConta.codConta} — ${aMovimentos.length} movimento(s) da API, ` +
         `${aEspelhar.length} a espelhar (tipo de documento ${sTipoDocumento}).\n`
   );

   let iCriados = 0;
   for (const oMovimento of aEspelhar) {
      const oLancamento = await insereLancamento(oConta, {
         numDocumento: numDoctoEspelho(oMovimento),
         datMovimento: oMovimento.datMovimento,
         datCompensacao: oMovimento.datMovimento,
         desHistorico: oMovimento.bEntrada
            ? `Recebimento ref. ${oMovimento.desHistorico}`
            : `Pagamento ref. ${oMovimento.desHistorico}`,
         valMovimento: oMovimento.valMovimento,
         bEntrada: oMovimento.bEntrada,
         tipDocumento: sTipoDocumento,
         tipOrigem: ORIGEM_CONCILIACAO,
      });

      console.log(
         `  + ${oLancamento.numDocumento}  ${oLancamento.datMovimento}  ` +
            `${(oLancamento.bEntrada ? '+' : '-')}${oLancamento.valMovimento.toFixed(2).padStart(12)}  ` +
            oLancamento.desHistorico.slice(0, 44)
      );
      iCriados += 1;
   }

   console.log(`\n${iCriados} lançamento(s) criado(s) em TBCONB001.`);

   // Marca como consultada a FAIXA INTEIRA que o extrato gravado cobre — do
   // primeiro ao último movimento, inclusive os dias sem movimento no meio.
   //
   // Em produção quem marca dia é a busca da tela, e só o período que ela
   // pediu: dia sem movimento só está coberto se a instituição foi consultada
   // para ele. Aqui a afirmação é verdadeira por outro caminho: o sandbox
   // devolve a faixa toda em UMA chamada, seja qual for o período pedido, então
   // os dias vazios no meio dela foram consultados de fato.
   //
   // Sem isso a tela tentaria consultar a API a cada busca para os dias vazios,
   // e o mock responderia 404 — um aviso a cada busca, no meio da demonstração.
   const aDatasIso = aMovimentos
      .map((oMovimento) => dataBrParaSql(oMovimento.datMovimento))
      .filter(Boolean)
      .sort();

   const aDiasFaixa = listaDiasDoPeriodo(
      dataSqlParaBr(aDatasIso[0]),
      dataSqlParaBr(aDatasIso[aDatasIso.length - 1])
   );

   const oQtdPorDia = {};
   for (const sDataIso of aDatasIso) {
      oQtdPorDia[sDataIso] = (oQtdPorDia[sDataIso] ?? 0) + 1;
   }

   const iMarcados = await marcaDiasConsultados(oConta, aDiasFaixa, oQtdPorDia);
   console.log(
      `${iMarcados} dia(s) marcado(s) como consultado(s) em TBCONB008 ` +
         `(${dataSqlParaBr(aDatasIso[0])} a ${dataSqlParaBr(aDatasIso[aDatasIso.length - 1])}).`
   );

   if (oPendente) {
      console.log(
         `Pendente de propósito: ${oPendente.datMovimento} · ${oPendente.desHistorico} · ` +
            `R$ ${oPendente.valMovimento.toFixed(2).replace('.', ',')} ` +
            `(${oPendente.bEntrada ? 'entrada' : 'saída'}) — sem lançamento no sistema.`
      );
   }

   console.log('\nAbra a tela, escolha a conta e clique em "Auto conciliar".');
} // main

main()
   .catch((oErro) => {
      console.error('Falha ao gerar a massa espelhada:', oErro.message);
      process.exitCode = 1;
   })
   .finally(async () => {
      await fechaConexao();
   });
