'use client';
// ============================================================================
// ConciliacaoBancariaPage.jsx - Tela principal de conciliação
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Atende o item 6.1.3 do documento de visão: filtro inicial, grades de
// movimentos do sistema e do banco, conciliação manual/automática e bloqueio.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
   ArrowLeftRight,
   CheckCircle2,
   Download,
   HandCoins,
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
import { CampoData } from '../comum/CampoData.jsx';
import { MenuContexto } from '../comum/MenuContexto.jsx';
import { ModalNovoLancamento } from './ModalNovoLancamento.jsx';
import { ModalTransferencia } from './ModalTransferencia.jsx';
import { ModalBaixarTitulo } from './ModalBaixarTitulo.jsx';
import { MenuExportar } from './MenuExportar.jsx';
import { FiltroGrade, aplicaFiltrosGrade } from '../comum/FiltroGrade.jsx';
import { PERM_BLOQUEIO } from '../../utils/permissoes.js';
import {
   formataContaCorrente,
   formataDataBr,
   formataMoeda,
   formataValor,
   somaDiasData,
} from '../../utils/formatters.js';

/**
 * Colunas filtráveis da grade de lançamentos do sistema (item 6.1.3.4).
 * Espelham exatamente as colunas exibidas, como pede o documento.
 */
const CAMPOS_LANCAMENTO = [
   { sChave: 'datMovimento', sRotulo: 'Data baixa', sExemplo: 'Ex.: 15/11' },
   { sChave: 'numDocumento', sRotulo: 'Documento', sExemplo: 'Ex.: 000123' },
   { sChave: 'desHistorico', sRotulo: 'Descrição do documento', sExemplo: 'Contém...' },
   { sChave: 'valMovimento', sRotulo: 'Valor', sTipo: 'valor' },
   { sChave: 'tipOrigem', sRotulo: 'Origem', sExemplo: 'Ex.: Contas a Pagar' },
];

/** Colunas filtráveis da grade de movimentos do banco (item 6.1.3.4) */
const CAMPOS_MOVIMENTO = [
   { sChave: 'datMovimento', sRotulo: 'Data do movimento', sExemplo: 'Ex.: 15/11' },
   { sChave: 'numDocumento', sRotulo: 'Documento', sExemplo: 'Ex.: 000123' },
   { sChave: 'desHistorico', sRotulo: 'Descrição do movimento', sExemplo: 'Contém...' },
   { sChave: 'valMovimento', sRotulo: 'Valor', sTipo: 'valor' },
];

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
 *
 * Item 6.1.2: "exibir um sinal de marcação verde quando já conciliado, quando
 * não conciliado não exibe nada".
 *
 * @param {{ conciliado: boolean }} oPropriedades
 */
function SeloStatus({ conciliado }) {
   if (!conciliado) {
      return null;
   }

   return (
      <span className="icone-conciliado" title="Conciliado">
         <CheckCircle2 size={14} />
      </span>
   );
} // SeloStatus

/**
 * Uma das duas linhas de somatória da seleção (item 6.1.2).
 *
 * @param {object} oPropriedades
 * @param {string} oPropriedades.sRotulo Identificação da linha
 * @param {object} oPropriedades.oLinha Totais de sistema, banco e diferença
 */
function LinhaSomatoria({ sRotulo, oLinha }) {
   const bAtiva = oLinha.iQuantidade > 0;

   return (
      <div className={`linha-somatoria ${bAtiva ? 'ativa' : ''}`}>
         <span className="linha-somatoria-rotulo">
            {sRotulo}
            <span className="chip-contador">{oLinha.iQuantidade} selecionado(s)</span>
         </span>
         <span className="linha-somatoria-item">
            <span className="totais-rotulo">Sistema</span>
            <span className="totais-valor">{formataMoeda(oLinha.oSistema.valLiquido)}</span>
         </span>
         <span className="linha-somatoria-item">
            <span className="totais-rotulo">Banco</span>
            <span className="totais-valor">{formataMoeda(oLinha.oBanco.valLiquido)}</span>
         </span>
         <span className="linha-somatoria-item">
            <span className="totais-rotulo">Diferença</span>
            <span
               className={`totais-valor ${
                  !bAtiva ? '' : oLinha.valDiferenca === 0 ? 'diferenca-zero' : 'diferenca-aberta'
               }`}
            >
               {formataMoeda(oLinha.valDiferenca)}
            </span>
         </span>
      </div>
   );
} // LinhaSomatoria

/**
 * Bloco de saldos de um dos extratos (item 6.1.2).
 *
 * @param {object} oPropriedades
 * @param {object} oPropriedades.oSaldos Saldo anterior, entradas, saídas e final
 */
function SaldosGrade({ oSaldos }) {
   return (
      <div className="saldos-grade">
         <span className="saldos-grade-item">
            <span className="totais-rotulo">Saldo anterior</span>
            <span className="totais-valor">{formataMoeda(oSaldos.valSaldoAnterior)}</span>
         </span>
         <span className="saldos-grade-item">
            <span className="totais-rotulo">Entradas</span>
            <span className="totais-valor entrada">{formataMoeda(oSaldos.valEntradas)}</span>
         </span>
         <span className="saldos-grade-item">
            <span className="totais-rotulo">Saídas</span>
            <span className="totais-valor saida">{formataMoeda(oSaldos.valSaidas)}</span>
         </span>
         <span className="saldos-grade-item">
            <span className="totais-rotulo">Saldo final</span>
            <span className="totais-valor">{formataMoeda(oSaldos.valSaldoFinal)}</span>
         </span>
      </div>
   );
} // SaldosGrade

export function ConciliacaoBancariaPage() {
   const router = useRouter();
   const { aContas, oContaSelecionada, limpaSelecao, oUsuario, temPermissao } = useBankContext();
   const { notifica } = useNotificacoes();
   const oConc = useConciliacao(oContaSelecionada, notifica);
   // Filtros por campo de cada grade (item 6.1.3.4)
   const [oFiltrosLanc, setFiltrosLanc] = useState({});
   const [oFiltrosMov, setFiltrosMov] = useState({});
   const bPodeBloquear = temPermissao(PERM_BLOQUEIO);
   const [sDatBloqueioEdicao, setDatBloqueioEdicao] = useState('');
   const [bLancamentoAberto, setLancamentoAberto] = useState(false);
   const [bTransferenciaAberta, setTransferenciaAberta] = useState(false);
   const [bBaixaAberta, setBaixaAberta] = useState(false);
   // O menu de exportação também é acionado pelo item "Exportar" da lateral
   const [bExportarAberto, setExportarAberto] = useState(false);
   const [oMovimentoBase, setMovimentoBase] = useState(null);
   // Linha e posição do clique com o botão direito (item 6.1.3.8)
   const [oMenuContexto, setMenuContexto] = useState(null);
   // Só o cliente conhece a data do dia; calcular no render quebraria a
   // hidratação quando o servidor e o navegador virassem o dia em momentos
   // diferentes (item 6.1.3.1: o bloqueio precisa ser anterior a hoje)
   const [sDataOntem, setDataOntem] = useState('');

   useEffect(() => {
      setDataOntem(somaDiasData(formataDataBr(new Date()), -1));
   }, []);

   useEffect(() => {
      setDatBloqueioEdicao(oConc.datBloqueio || '');
   }, [oConc.datBloqueio]);

   // Os dois filtros do item 6.1.3.4 se somam: primeiro os chips de situação,
   // depois os filtros por campo da grade
   const aLancVisiveis = useMemo(
      () =>
         aplicaFiltrosGrade(
            filtraPorStatus(
               oConc.aLancamentos,
               oConc.oFiltrosGrade.bLancConciliados,
               oConc.oFiltrosGrade.bLancNaoConciliados
            ),
            oFiltrosLanc,
            CAMPOS_LANCAMENTO
         ),
      [oConc.aLancamentos, oConc.oFiltrosGrade, oFiltrosLanc]
   );

   const aMovVisiveis = useMemo(
      () =>
         aplicaFiltrosGrade(
            filtraPorStatus(
               oConc.aMovimentos,
               oConc.oFiltrosGrade.bMovConciliados,
               oConc.oFiltrosGrade.bMovNaoConciliados
            ),
            oFiltrosMov,
            CAMPOS_MOVIMENTO
         ),
      [oConc.aMovimentos, oConc.oFiltrosGrade, oFiltrosMov]
   );

   /** Volta à tela de seleção de banco/agência. */
   function trocaConta() {
      limpaSelecao();
      router.push('/');
   } // trocaConta

   /**
    * Escolhe qual movimento do banco alimenta as caixas de lançamento e de
    * transferência: a linha clicada com o botão direito tem prioridade sobre
    * a seleção, conforme o item 6.1.3.8 ("aproveitar as informações da linha
    * que estiver posicionado o mouse").
    * @returns {object|null}
    */
   function resolveMovimentoBase() {
      if (oMenuContexto?.sGrade === 'movimento' && oMenuContexto.oRegistro) {
         return oMenuContexto.oRegistro;
      }
      return oConc.aMovSelecionados.length === 1 ? oConc.aMovSelecionados[0] : null;
   } // resolveMovimentoBase

   /**
    * Abre a caixa de lançamento, aproveitando os dados da linha do banco
    * quando houver um único movimento selecionado (item 6.1.3.8 — ação 1).
    */
   function abreNovoLancamento() {
      setMovimentoBase(resolveMovimentoBase());
      setLancamentoAberto(true);
   } // abreNovoLancamento

   /** Abre a caixa de transferência entre contas (item 6.1.3.8 — ação 2). */
   function abreTransferencia() {
      setMovimentoBase(resolveMovimentoBase());
      setTransferenciaAberta(true);
   } // abreTransferencia

   /** Abre a caixa de baixa de títulos (item 6.1.3.8 — ação 3). */
   function abreBaixaTitulo() {
      setMovimentoBase(resolveMovimentoBase());
      setBaixaAberta(true);
   } // abreBaixaTitulo

   /**
    * Abre o menu do botão direito sobre a linha apontada.
    * @param {import('react').MouseEvent} oEvento
    * @param {object|null} oRegistro Linha sob o cursor
    * @param {'lancamento'|'movimento'} sGrade
    */
   function abreMenuContexto(oEvento, oRegistro, sGrade) {
      oEvento.preventDefault();
      setMenuContexto({ nX: oEvento.clientX, nY: oEvento.clientY, oRegistro, sGrade });
   } // abreMenuContexto

   /** Fecha o menu do botão direito. */
   const fechaMenuContexto = useCallback(() => setMenuContexto(null), []);

   /**
    * Executa a ação escolhida no menu do botão direito.
    * @param {string} sChave Identificador da ação
    */
   async function executaAcaoMenu(sChave) {
      // A linha do menu precisa ser lida antes de fechar, porque as caixas
      // abertas em seguida dependem dela
      const oRegistro = oMenuContexto?.oRegistro ?? null;
      const sGrade = oMenuContexto?.sGrade ?? 'lancamento';

      if (sChave === 'lancamento') {
         abreNovoLancamento();
         return;
      }
      if (sChave === 'transferencia') {
         abreTransferencia();
         return;
      }
      if (sChave === 'baixa') {
         abreBaixaTitulo();
         return;
      }
      if (sChave === 'excluir' && oRegistro) {
         await oConc.excluiRegistro(oRegistro, sGrade);
      }
   } // executaAcaoMenu

   /**
    * Executa a ação escolhida no menu lateral do módulo financeiro.
    *
    * O AppShell apenas dispara a chave do item; sem este tratador os botões
    * da lateral ficavam inertes.
    *
    * @param {string} sChave Item escolhido
    */
   function trataMenuLateral(sChave) {
      const oAcoes = {
         baixar: abreBaixaTitulo,
         conciliacao: oConc.buscaMovimentos,
         excluir: excluiSelecionados,
         estorno: oConc.desfazConciliacao,
         transferir: abreTransferencia,
         exportar: () => setExportarAberto(true),
         ajuda: () =>
            notifica(
               'Selecione lançamentos e movimentos com a mesma situação; a conciliação exige diferença zero. ' +
                  'O botão direito nas grades abre as ações de lançamento, transferência, baixa e exclusão.',
               'info'
            ),
      };

      oAcoes[sChave]?.();
   } // trataMenuLateral

   /**
    * Monta os itens do menu conforme a linha apontada.
    * @returns {Array<object>}
    */
   function montaItensMenu() {
      const oRegistro = oMenuContexto?.oRegistro ?? null;
      const bConciliado = Boolean(oRegistro?.staConciliado);

      return [
         { sChave: 'lancamento', sRotulo: 'Novo Lançamento', Icone: PlusCircle },
         {
            sChave: 'transferencia',
            sRotulo: 'Nova Transferência entre Contas',
            Icone: ArrowLeftRight,
            bDesabilitado: aContas.length < 2,
            sMotivo: 'Cadastre ao menos duas contas para transferir entre elas.',
         },
         { sChave: 'baixa', sRotulo: 'Baixar Título', Icone: HandCoins },
         {
            sChave: 'excluir',
            sRotulo: 'Excluir Registro',
            Icone: Trash2,
            bPerigo: true,
            bSeparadorAntes: true,
            bDesabilitado: !oRegistro || bConciliado,
            sMotivo: !oRegistro
               ? 'Clique com o botão direito sobre um registro.'
               : 'Registro conciliado não pode ser excluído. Estorne a conciliação antes.',
         },
      ];
   } // montaItensMenu

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
         nomUsuario={oUsuario.nomUsuario}
         desEmpresa={oUsuario.desEmpresa}
         oConta={oContaSelecionada}
         aoSelecionarItem={trataMenuLateral}
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

                  {/* Sem limite cruzado entre as duas pontas: travar a data
                      inicial no valor da final impediria avançar o período a
                      partir do padrão configurado. A ordem das datas é
                      conferida no botão Buscar. */}
                  <CampoData
                     rotulo="Data inicial"
                     valor={oConc.sDataInicio}
                     aoAlterar={oConc.setDataInicio}
                     titulo="Início do período conciliado"
                  />

                  <CampoData
                     rotulo="Data final"
                     valor={oConc.sDataFim}
                     aoAlterar={oConc.setDataFim}
                     titulo="Fim do período conciliado"
                  />

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
                     <span className="campo-rotulo">Conta bloqueada para lançamentos até</span>
                     <div className="filtro-bloqueio-linha">
                        <CampoData
                           valor={sDatBloqueioEdicao}
                           aoAlterar={setDatBloqueioEdicao}
                           datMaxima={sDataOntem}
                           titulo="A data de bloqueio deve ser anterior à data do dia"
                           classe="campo-data-compacto"
                        />
                        {/* Item 6.1.3.1: "Verificar permissão de acesso para
                            uso desses botões." A rota confere de novo — aqui
                            é só para o usuário não tentar em vão. */}
                        <button
                           type="button"
                           className="btn-icone"
                           title={
                              bPodeBloquear
                                 ? 'Aplicar bloqueio'
                                 : `${oUsuario.nomUsuario || 'O usuário atual'} não tem permissão para bloquear o período.`
                           }
                           disabled={!bPodeBloquear}
                           onClick={() => oConc.aplicaBloqueio(sDatBloqueioEdicao)}
                        >
                           <Lock size={14} />
                        </button>
                        <button
                           type="button"
                           className="btn-icone"
                           title={
                              bPodeBloquear
                                 ? 'Remover bloqueio'
                                 : `${oUsuario.nomUsuario || 'O usuário atual'} não tem permissão para reabrir o período.`
                           }
                           disabled={!bPodeBloquear}
                           onClick={oConc.removeBloqueio}
                        >
                           <Unlock size={14} />
                        </button>
                     </div>
                  </div>
               </div>

               {/* Item 6.1.2: as somatórias da seleção em duas linhas — uma
                   para os conciliados e outra para os não conciliados —,
                   cada uma com a sua diferença. */}
               <div className="linhas-somatoria">
                  <LinhaSomatoria
                     sRotulo="Selecionados não conciliados"
                     oLinha={oConc.oTotais.oNaoConciliados}
                  />
                  <LinhaSomatoria
                     sRotulo="Selecionados conciliados"
                     oLinha={oConc.oTotais.oConciliados}
                  />
               </div>

               <div className="linha-saldos">
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
                        className="btn btn-secundario btn-pequeno"
                        onClick={abreTransferencia}
                        disabled={aContas.length < 2}
                        title={
                           aContas.length < 2
                              ? 'Cadastre ao menos duas contas para transferir entre elas.'
                              : 'Gera o débito e o crédito da transferência'
                        }
                     >
                        <ArrowLeftRight size={13} />
                        Transferência
                     </button>
                     <button
                        type="button"
                        className="btn btn-secundario btn-pequeno"
                        onClick={abreBaixaTitulo}
                        title="Busca títulos a pagar e a receber em aberto"
                     >
                        <HandCoins size={13} />
                        Baixar Título
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
                        oFiltrosGrade={oConc.oFiltrosGrade}
                        desabilitado={!oContaSelecionada}
                        aberto={bExportarAberto}
                        aoAlterarAberto={setExportarAberto}
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

                  <FiltroGrade
                     aCampos={CAMPOS_LANCAMENTO}
                     oFiltros={oFiltrosLanc}
                     aoAlterar={setFiltrosLanc}
                     sTitulo="Movimentos no Sistema"
                  />
               </div>

               <div
                  className="grade-wrapper"
                  role="presentation"
                  onContextMenu={(oEvento) => abreMenuContexto(oEvento, null, 'lancamento')}
               >
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
                              {/* Campos do item 6.1.2 para os lançamentos do
                                  sistema: número do documento, data da baixa,
                                  descrição, valor, origem e situação */}
                              <th>Data baixa</th>
                              <th>Documento</th>
                              <th className="col-historico">Descrição</th>
                              <th className="col-valor">Valor</th>
                              <th className="col-origem">Origem</th>
                              <th className="col-status">Conc.</th>
                           </tr>
                        </thead>
                        <tbody>
                           {aLancVisiveis.map((oLanc) => {
                              const bSel = oConc.aSelLancamentos.includes(oLanc.codLancamento);
                              return (
                                 <tr
                                    key={oLanc.codLancamento}
                                    className={`${bSel ? 'selecionada' : ''} ${
                                       oLanc.staConciliado ? 'conciliada' : ''
                                    }`}
                                    onClick={() => oConc.alternaSelecao(oLanc, 'lancamento')}
                                    onContextMenu={(oEvento) => abreMenuContexto(oEvento, oLanc, 'lancamento')}
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
                                    <td className="col-origem">{oLanc.tipOrigem}</td>
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
                  <SaldosGrade oSaldos={oConc.oSaldosPorLado.oSistema} />
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

                  <FiltroGrade
                     aCampos={CAMPOS_MOVIMENTO}
                     oFiltros={oFiltrosMov}
                     aoAlterar={setFiltrosMov}
                     sTitulo="Movimentos no Banco"
                  />
               </div>

               <div
                  className="grade-wrapper"
                  role="presentation"
                  onContextMenu={(oEvento) => abreMenuContexto(oEvento, null, 'movimento')}
               >
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
                              {/* Campos do item 6.1.2 para os movimentos do
                                  banco: data, descrição e valor */}
                              <th>Data movimento</th>
                              <th>Documento</th>
                              <th className="col-historico">Descrição do movimento</th>
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
                                    className={`${bSel ? 'selecionada' : ''} ${
                                       oMov.staConciliado ? 'conciliada' : ''
                                    }`}
                                    onClick={() => oConc.alternaSelecao(oMov, 'movimento')}
                                    onContextMenu={(oEvento) => abreMenuContexto(oEvento, oMov, 'movimento')}
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
                  <SaldosGrade oSaldos={oConc.oSaldosPorLado.oBanco} />
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

         <ModalTransferencia
            aberto={bTransferenciaAberta}
            aContas={aContas}
            oContaAtual={oContaSelecionada}
            oMovimentoBase={oMovimentoBase}
            sDataSugerida={oConc.sDataFim}
            aoConfirmar={oConc.criaTransferencia}
            aoFechar={() => {
               setTransferenciaAberta(false);
               setMovimentoBase(null);
            }}
         />

         <ModalBaixarTitulo
            aberto={bBaixaAberta}
            sCodConta={oContaSelecionada?.codConta}
            sDataMovimento={oMovimentoBase?.datMovimento || oConc.sDataFim}
            oResumoSelecao={oConc.oTotais.oSistema}
            aoConfirmar={oConc.baixaTitulos}
            aoFechar={() => {
               setBaixaAberta(false);
               setMovimentoBase(null);
            }}
         />

         <MenuContexto
            oPosicao={oMenuContexto}
            aItens={montaItensMenu()}
            aoEscolher={executaAcaoMenu}
            aoFechar={fechaMenuContexto}
         />
      </AppShell>
   );
} // ConciliacaoBancariaPage
