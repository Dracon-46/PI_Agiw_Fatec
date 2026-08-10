'use client';
// ============================================================================
// ConciliacaoBancariaPage.jsx - Tela principal de conciliação
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Atende o item 6.1.3 do documento de visão: filtro inicial, grades de
// movimentos do sistema e do banco, conciliação manual/automática e bloqueio.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
   CheckCircle2,
   Circle,
   Download,
   Lock,
   PlusCircle,
   Search,
   ShieldCheck,
   Trash2,
   Unlock,
   Upload,
   Zap,
} from 'lucide-react';
import { AppShell } from '../layout/AppShell.jsx';
import { useBankContext } from '../../contexts/BankContext.jsx';
import { useNotificacoes } from '../comum/Notificacoes.jsx';
import { useConciliacao } from '../../hooks/useConciliacao.js';
import { ModalNovoLancamento } from './ModalNovoLancamento.jsx';
import { MenuExportar } from './MenuExportar.jsx';
import {
   formataContaCorrente,
   formataMoeda,
   formataValor,
} from '../../utils/formatters.js';

/**
 * Filtra a grade conforme chips conciliado / não conciliado.
 * @param {Array<object>} aItens
 * @param {boolean} bConciliados
 * @param {boolean} bNaoConciliados
 * @returns {Array<object>}
 */
function filtraPorStatus(aItens, bConciliados, bNaoConciliados) {
   return aItens.filter((oItem) => {
      if (oItem.staConciliado) {
         return bConciliados;
      }
      return bNaoConciliados;
   });
} // filtraPorStatus

/**
 * Célula de valor entrada/saída da grade.
 * @param {{ bEntrada: boolean, valMovimento: number }} oPropriedades
 */
function CelulaValor({ bEntrada, valMovimento }) {
   return (
      <td className={`col-valor ${bEntrada ? 'valor-entrada' : 'valor-saida'}`}>
         {bEntrada ? formataValor(valMovimento) : formataValor(valMovimento)}
      </td>
   );
} // CelulaValor

/**
 * Selo visual do status de conciliação.
 * @param {{ conciliado: boolean }} oPropriedades
 */
function SeloStatus({ conciliado }) {
   if (conciliado) {
      return (
         <span className="selo selo-conciliado">
            <CheckCircle2 size={11} />
            Sim
         </span>
      );
   }
   return (
      <span className="selo selo-nao-conciliado">
         <Circle size={11} />
         Não
      </span>
   );
} // SeloStatus

export function ConciliacaoBancariaPage() {
   const router = useRouter();
   const { oContaSelecionada, limpaSelecao } = useBankContext();
   const { notifica } = useNotificacoes();
   const oConc = useConciliacao(oContaSelecionada, notifica);
   const [sDatBloqueioEdicao, setDatBloqueioEdicao] = useState('');
   const [bLancamentoAberto, setLancamentoAberto] = useState(false);
   const [oMovimentoBase, setMovimentoBase] = useState(null);

   useEffect(() => {
      setDatBloqueioEdicao(oConc.datBloqueio || '');
   }, [oConc.datBloqueio]);

   const aLancVisiveis = useMemo(
      () =>
         filtraPorStatus(
            oConc.aLancamentos,
            oConc.oFiltrosGrade.bLancConciliados,
            oConc.oFiltrosGrade.bLancNaoConciliados
         ),
      [oConc.aLancamentos, oConc.oFiltrosGrade]
   );

   const aMovVisiveis = useMemo(
      () =>
         filtraPorStatus(
            oConc.aMovimentos,
            oConc.oFiltrosGrade.bMovConciliados,
            oConc.oFiltrosGrade.bMovNaoConciliados
         ),
      [oConc.aMovimentos, oConc.oFiltrosGrade]
   );

   /** Volta à tela de seleção de banco/agência. */
   function trocaConta() {
      limpaSelecao();
      router.push('/');
   } // trocaConta

   /**
    * Abre a caixa de lançamento, aproveitando os dados da linha do banco
    * quando houver um único movimento selecionado (item 6.1.3.8 — ação 1).
    */
   function abreNovoLancamento() {
      const oMovimento = oConc.aMovSelecionados.length === 1 ? oConc.aMovSelecionados[0] : null;
      setMovimentoBase(oMovimento);
      setLancamentoAberto(true);
   } // abreNovoLancamento

   /**
    * Exclui os registros selecionados nas duas grades.
    * Percorre as listas e deixa o hook aplicar as regras de cada grade.
    */
   async function excluiSelecionados() {
      if (oConc.aLancSelecionados.length === 0 && oConc.aMovSelecionados.length === 0) {
         notifica('Selecione os registros que deseja excluir.', 'alerta');
         return;
      }

      for (const oLancamento of oConc.aLancSelecionados) {
         await oConc.excluiRegistro(oLancamento, 'lancamento');
      }
      for (const oMovimento of oConc.aMovSelecionados) {
         await oConc.excluiRegistro(oMovimento, 'movimento');
      }
   } // excluiSelecionados

   return (
      <AppShell
         itemAtivo="conciliacao"
         oConta={oContaSelecionada}
         aoTrocarConta={trocaConta}
         aoSair={trocaConta}
      >
         <div className="painel" style={{ marginBottom: 12 }}>
            <header className="painel-cabecalho">
               <Search size={15} />
               Período e conta para conciliação
            </header>
            <div className="painel-corpo">
               <div className="filtro-conciliacao">
                  <label className="campo">
                     <span className="campo-rotulo">Banco / Agência / C.C.</span>
                     <input
                        type="text"
                        className="campo-controle"
                        value={formataContaCorrente(oContaSelecionada)}
                        readOnly
                        title={oContaSelecionada?.desAgencia}
                     />
                  </label>

                  <label className="campo">
                     <span className="campo-rotulo">Data inicial</span>
                     <input
                        type="text"
                        className="campo-controle"
                        placeholder="DD/MM/AAAA"
                        value={oConc.sDataInicio}
                        onChange={(oEvento) => oConc.setDataInicio(oEvento.target.value)}
                     />
                  </label>

                  <label className="campo">
                     <span className="campo-rotulo">Data final</span>
                     <input
                        type="text"
                        className="campo-controle"
                        placeholder="DD/MM/AAAA"
                        value={oConc.sDataFim}
                        onChange={(oEvento) => oConc.setDataFim(oEvento.target.value)}
                     />
                  </label>

                  <div className="filtro-acao">
                     <button
                        type="button"
                        className="btn btn-primario"
                        onClick={oConc.buscaMovimentos}
                        disabled={oConc.bCarregando}
                     >
                        <Search size={14} />
                        Buscar
                     </button>
                     <button
                        type="button"
                        className="btn btn-secundario"
                        onClick={oConc.importaExtrato}
                        disabled={oConc.bImportando}
                     >
                        <Upload size={14} />
                        {oConc.bImportando ? 'Importando...' : 'Importar Extrato'}
                     </button>
                  </div>

                  <div className="filtro-bloqueio">
                     <span className="campo-rotulo">Bloqueio de período</span>
                     <div className="filtro-bloqueio-linha">
                        <input
                           type="text"
                           className="campo-controle"
                           placeholder="DD/MM/AAAA"
                           value={sDatBloqueioEdicao}
                           onChange={(oEvento) => setDatBloqueioEdicao(oEvento.target.value)}
                           style={{ width: 110 }}
                        />
                        <button
                           type="button"
                           className="btn-icone"
                           title="Aplicar bloqueio"
                           onClick={() => oConc.aplicaBloqueio(sDatBloqueioEdicao)}
                        >
                           <Lock size={14} />
                        </button>
                        <button
                           type="button"
                           className="btn-icone"
                           title="Remover bloqueio"
                           onClick={oConc.removeBloqueio}
                        >
                           <Unlock size={14} />
                        </button>
                     </div>
                  </div>
               </div>

               <div className="linha-saldos">
                  <div className="card-saldo">
                     <div className="card-saldo-icone">
                        <Download size={15} />
                     </div>
                     <div>
                        <div className="card-saldo-rotulo">Saldo anterior</div>
                        <div className="card-saldo-valor">{formataMoeda(oConc.oSaldos.valSaldoAnterior)}</div>
                     </div>
                  </div>
                  <div className="card-saldo">
                     <div className="card-saldo-icone">
                        <CheckCircle2 size={15} />
                     </div>
                     <div>
                        <div className="card-saldo-rotulo">Saldo final (sistema)</div>
                        <div className="card-saldo-valor">{formataMoeda(oConc.oSaldos.valSaldoFinal)}</div>
                     </div>
                  </div>
                  <div className="card-saldo">
                     <div>
                        <div className="card-saldo-rotulo">Diferença da seleção</div>
                        <div
                           className={`card-saldo-valor ${
                              oConc.oTotais.valDiferenca === 0 ? '' : 'negativo'
                           }`}
                        >
                           {formataMoeda(oConc.oTotais.valDiferenca)}
                        </div>
                     </div>
                  </div>
                  <div className="saldos-acoes">
                     <button
                        type="button"
                        className="btn btn-sucesso btn-pequeno"
                        onClick={oConc.concilia}
                     >
                        <CheckCircle2 size={13} />
                        Conciliar
                     </button>
                     <button
                        type="button"
                        className="btn btn-neutro btn-pequeno"
                        onClick={oConc.desfazConciliacao}
                     >
                        Desfazer
                     </button>
                     <button
                        type="button"
                        className="btn btn-primario btn-pequeno"
                        onClick={oConc.conciliaAutomaticamente}
                        disabled={oConc.bCarregando}
                     >
                        <Zap size={13} />
                        Auto conciliar
                     </button>

                     <span className="separador-acoes" aria-hidden="true" />

                     <button
                        type="button"
                        className="btn btn-secundario btn-pequeno"
                        onClick={abreNovoLancamento}
                     >
                        <PlusCircle size={13} />
                        Novo Lançamento
                     </button>
                     <button
                        type="button"
                        className="btn btn-perigo btn-pequeno"
                        onClick={excluiSelecionados}
                     >
                        <Trash2 size={13} />
                        Excluir
                     </button>

                     <MenuExportar
                        sCodConta={oContaSelecionada?.codConta}
                        sDataInicio={oConc.sDataInicio}
                        sDataFim={oConc.sDataFim}
                        desabilitado={!oContaSelecionada}
                        notifica={notifica}
                     />

                     <button
                        type="button"
                        className="btn btn-neutro btn-pequeno"
                        onClick={() => router.push('/auditoria')}
                        title="Consultar a trilha de auditoria do módulo"
                     >
                        <ShieldCheck size={13} />
                        Auditoria
                     </button>
                  </div>
               </div>
            </div>
         </div>

         <div className="area-conciliacao">
            {/* ---------- Movimentos no Sistema ---------- */}
            <div className="painel">
               <header
                  className={`painel-cabecalho ${
                     oConc.staSelecao === true
                        ? 'cabecalho-conciliado'
                        : oConc.staSelecao === false
                          ? 'cabecalho-nao-conciliado'
                          : ''
                  }`}
               >
                  Movimentos no Sistema
                  <span className="chip-contador" style={{ marginLeft: 'auto' }}>
                     {aLancVisiveis.length} registro(s)
                  </span>
               </header>

               <div className="grade-filtros">
                  <button
                     type="button"
                     className={`chip-toggle ${oConc.oFiltrosGrade.bLancConciliados ? 'ligado' : ''}`}
                     onClick={() =>
                        oConc.setFiltrosGrade((oAtual) => ({
                           ...oAtual,
                           bLancConciliados: !oAtual.bLancConciliados,
                        }))
                     }
                  >
                     Conciliados
                  </button>
                  <button
                     type="button"
                     className={`chip-toggle ${oConc.oFiltrosGrade.bLancNaoConciliados ? 'ligado' : ''}`}
                     onClick={() =>
                        oConc.setFiltrosGrade((oAtual) => ({
                           ...oAtual,
                           bLancNaoConciliados: !oAtual.bLancNaoConciliados,
                        }))
                     }
                  >
                     Não conciliados
                  </button>
               </div>

               <div className="grade-wrapper">
                  {oConc.bCarregando ? (
                     <div className="grade-vazia">Carregando lançamentos...</div>
                  ) : aLancVisiveis.length === 0 ? (
                     <div className="grade-vazia">Nenhum lançamento no período informado.</div>
                  ) : (
                     <table className="grade">
                        <thead>
                           <tr>
                              <th className="col-selecao">
                                 <input
                                    type="checkbox"
                                    className="checkbox"
                                    checked={
                                       aLancVisiveis.length > 0 &&
                                       aLancVisiveis.every((oItem) =>
                                          oConc.aSelLancamentos.includes(oItem.codLancamento)
                                       )
                                    }
                                    onChange={() => oConc.alternaSelecaoTotal(aLancVisiveis, 'lancamento')}
                                    aria-label="Selecionar todos os lançamentos"
                                 />
                              </th>
                              <th>Data</th>
                              <th>Documento</th>
                              <th className="col-historico">Histórico</th>
                              <th className="col-valor">Valor</th>
                              <th className="col-status">Conc.</th>
                           </tr>
                        </thead>
                        <tbody>
                           {aLancVisiveis.map((oLanc) => {
                              const bSel = oConc.aSelLancamentos.includes(oLanc.codLancamento);
                              return (
                                 <tr
                                    key={oLanc.codLancamento}
                                    className={bSel ? 'selecionada' : ''}
                                    onClick={() => oConc.alternaSelecao(oLanc, 'lancamento')}
                                 >
                                    <td className="col-selecao">
                                       <input
                                          type="checkbox"
                                          className="checkbox"
                                          checked={bSel}
                                          onChange={() => oConc.alternaSelecao(oLanc, 'lancamento')}
                                          onClick={(oEvento) => oEvento.stopPropagation()}
                                       />
                                    </td>
                                    <td>{oLanc.datMovimento}</td>
                                    <td>{oLanc.numDocumento}</td>
                                    <td className="col-historico">{oLanc.desHistorico}</td>
                                    <CelulaValor bEntrada={oLanc.bEntrada} valMovimento={oLanc.valMovimento} />
                                    <td className="col-status">
                                       <SeloStatus conciliado={oLanc.staConciliado} />
                                    </td>
                                 </tr>
                              );
                           })}
                        </tbody>
                     </table>
                  )}
               </div>

               <div className="grade-rodape">
                  <div className="totais">
                     <div className="totais-item">
                        <span className="totais-rotulo">Selecionado (sistema)</span>
                        <span className="totais-valor">{formataMoeda(oConc.oTotais.oSistema.valLiquido)}</span>
                     </div>
                     <div className="totais-item">
                        <span className="totais-rotulo">Entradas a conciliar</span>
                        <span className="totais-valor entrada">
                           {formataMoeda(oConc.oTotaisPeriodo.valEntradasAConciliar)}
                        </span>
                     </div>
                     <div className="totais-item">
                        <span className="totais-rotulo">Saídas a conciliar</span>
                        <span className="totais-valor saida">
                           {formataMoeda(oConc.oTotaisPeriodo.valSaidasAConciliar)}
                        </span>
                     </div>
                  </div>
               </div>
            </div>

            {/* ---------- Movimentos no Banco ---------- */}
            <div className="painel">
               <header className="painel-cabecalho">
                  Movimentos no Banco — {oContaSelecionada?.nomBanco}
                  <span className="chip-contador" style={{ marginLeft: 'auto' }}>
                     {aMovVisiveis.length} registro(s)
                  </span>
               </header>

               <div className="grade-filtros">
                  <button
                     type="button"
                     className={`chip-toggle ${oConc.oFiltrosGrade.bMovConciliados ? 'ligado' : ''}`}
                     onClick={() =>
                        oConc.setFiltrosGrade((oAtual) => ({
                           ...oAtual,
                           bMovConciliados: !oAtual.bMovConciliados,
                        }))
                     }
                  >
                     Conciliados
                  </button>
                  <button
                     type="button"
                     className={`chip-toggle ${oConc.oFiltrosGrade.bMovNaoConciliados ? 'ligado' : ''}`}
                     onClick={() =>
                        oConc.setFiltrosGrade((oAtual) => ({
                           ...oAtual,
                           bMovNaoConciliados: !oAtual.bMovNaoConciliados,
                        }))
                     }
                  >
                     Não conciliados
                  </button>
               </div>

               <div className="grade-wrapper">
                  {aMovVisiveis.length === 0 ? (
                     <div className="grade-vazia">
                        Nenhum movimento importado. Use &quot;Importar Extrato&quot; para buscar o período.
                     </div>
                  ) : (
                     <table className="grade">
                        <thead>
                           <tr>
                              <th className="col-selecao">
                                 <input
                                    type="checkbox"
                                    className="checkbox"
                                    checked={
                                       aMovVisiveis.length > 0 &&
                                       aMovVisiveis.every((oItem) =>
                                          oConc.aSelMovimentos.includes(oItem.codMovimento)
                                       )
                                    }
                                    onChange={() => oConc.alternaSelecaoTotal(aMovVisiveis, 'movimento')}
                                    aria-label="Selecionar todos os movimentos"
                                 />
                              </th>
                              <th>Data</th>
                              <th>Documento</th>
                              <th className="col-historico">Histórico</th>
                              <th className="col-valor">Valor</th>
                              <th className="col-status">Conc.</th>
                           </tr>
                        </thead>
                        <tbody>
                           {aMovVisiveis.map((oMov) => {
                              const bSel = oConc.aSelMovimentos.includes(oMov.codMovimento);
                              return (
                                 <tr
                                    key={oMov.codMovimento}
                                    className={bSel ? 'selecionada' : ''}
                                    onClick={() => oConc.alternaSelecao(oMov, 'movimento')}
                                 >
                                    <td className="col-selecao">
                                       <input
                                          type="checkbox"
                                          className="checkbox"
                                          checked={bSel}
                                          onChange={() => oConc.alternaSelecao(oMov, 'movimento')}
                                          onClick={(oEvento) => oEvento.stopPropagation()}
                                       />
                                    </td>
                                    <td>{oMov.datMovimento}</td>
                                    <td>{oMov.numDocumento}</td>
                                    <td className="col-historico">{oMov.desHistorico}</td>
                                    <CelulaValor bEntrada={oMov.bEntrada} valMovimento={oMov.valMovimento} />
                                    <td className="col-status">
                                       <SeloStatus conciliado={oMov.staConciliado} />
                                    </td>
                                 </tr>
                              );
                           })}
                        </tbody>
                     </table>
                  )}
               </div>

               <div className="grade-rodape">
                  <div className="totais">
                     <div className="totais-item">
                        <span className="totais-rotulo">Selecionado (banco)</span>
                        <span className="totais-valor">{formataMoeda(oConc.oTotais.oBanco.valLiquido)}</span>
                     </div>
                     <div className="totais-item">
                        <span className="totais-rotulo">Diferença</span>
                        <span
                           className={`totais-valor ${
                              oConc.oTotais.valDiferenca === 0 ? 'diferenca-zero' : 'diferenca-aberta'
                           }`}
                        >
                           {formataMoeda(oConc.oTotais.valDiferenca)}
                        </span>
                     </div>
                  </div>
               </div>
            </div>
         </div>

         <ModalNovoLancamento
            aberto={bLancamentoAberto}
            oMovimentoBase={oMovimentoBase}
            sDataSugerida={oConc.sDataFim}
            aoConfirmar={oConc.incluiLancamento}
            aoFechar={() => {
               setLancamentoAberto(false);
               setMovimentoBase(null);
            }}
         />
      </AppShell>
   );
} // ConciliacaoBancariaPage
