'use client';
// ============================================================================
// PainelAuditoria.jsx - Consulta da trilha de auditoria
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Atende o item 6.5 das sugestões: registro detalhado de todas as ações
// realizadas no módulo — quem conciliou, quem bloqueou um período, quem
// realizou um lançamento avulso e quando.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileClock, FileUp, Loader2, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { AppShell } from '../layout/AppShell.jsx';
import { useBankContext } from '../../contexts/BankContext.jsx';
import { useNotificacoes } from '../comum/Notificacoes.jsx';
import { buscaAuditoria } from '../../services/conciliacaoService.js';
import { formataMoeda } from '../../utils/formatters.js';

/**
 * Converte o carimbo de tempo do MySQL para exibição.
 * @param {string} sDataHora
 * @returns {string}
 */
function formataDataHora(sDataHora) {
   if (!sDataHora) {
      return '—';
   }
   const sTexto = String(sDataHora);
   const oIso = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(sTexto);
   if (oIso) {
      return `${oIso[3]}/${oIso[2]}/${oIso[1]} ${oIso[4]}:${oIso[5]}`;
   }
   return sTexto.slice(0, 19);
} // formataDataHora

/**
 * Tela de auditoria do módulo.
 */
export function PainelAuditoria() {
   const router = useRouter();
   const { oContaSelecionada, limpaSelecao } = useBankContext();
   const { notifica } = useNotificacoes();

   const [aEventos, setEventos] = useState([]);
   const [aResumo, setResumo] = useState([]);
   const [aArquivos, setArquivos] = useState([]);
   const [aAcoes, setAcoes] = useState([]);
   const [sAcaoFiltro, setAcaoFiltro] = useState('');
   const [sDataInicio, setDataInicio] = useState('');
   const [sDataFim, setDataFim] = useState('');
   const [bCarregando, setCarregando] = useState(false);

   const carrega = useCallback(async () => {
      setCarregando(true);
      try {
         const oRetorno = await buscaAuditoria({
            sCodConta: oContaSelecionada?.codConta,
            sAcao: sAcaoFiltro,
            sDataInicio,
            sDataFim,
         });
         setEventos(oRetorno.eventos ?? []);
         setResumo(oRetorno.resumo ?? []);
         setArquivos(oRetorno.arquivos ?? []);
         setAcoes(oRetorno.acoesDisponiveis ?? []);
      } catch (oErro) {
         notifica(oErro.message, 'erro');
      } finally {
         setCarregando(false);
      }
   }, [oContaSelecionada, sAcaoFiltro, sDataInicio, sDataFim, notifica]);

   // Carrega a trilha ao abrir a tela
   useEffect(() => {
      carrega();
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [oContaSelecionada]);

   /** Retorna à tela de conciliação. */
   function voltaParaConciliacao() {
      router.push('/conciliacao');
   } // voltaParaConciliacao

   return (
      <AppShell
         itemAtivo="auditoria"
         oConta={oContaSelecionada}
         aoSelecionarItem={(sChave) => {
            if (sChave === 'conciliacao') {
               voltaParaConciliacao();
            }
         }}
         aoTrocarConta={() => {
            limpaSelecao();
            router.push('/');
         }}
         aoSair={() => {
            limpaSelecao();
            router.push('/');
         }}
      >
         <div className="painel" style={{ marginBottom: 12 }}>
            <header className="painel-cabecalho">
               <ShieldCheck size={15} />
               Auditoria do módulo
               <div className="painel-acoes">
                  <button type="button" className="btn btn-neutro btn-pequeno" onClick={voltaParaConciliacao}>
                     Voltar à conciliação
                  </button>
               </div>
            </header>

            <div className="painel-corpo">
               <div className="filtro-conciliacao">
                  <label className="campo">
                     <span className="campo-rotulo">Ação</span>
                     <select
                        className="campo-controle"
                        value={sAcaoFiltro}
                        onChange={(oEvento) => setAcaoFiltro(oEvento.target.value)}
                     >
                        <option value="">Todas as ações</option>
                        {aAcoes.map((oAcao) => (
                           <option key={oAcao.tipAcao} value={oAcao.tipAcao}>
                              {oAcao.desAcao}
                           </option>
                        ))}
                     </select>
                  </label>

                  <label className="campo">
                     <span className="campo-rotulo">Data inicial</span>
                     <input
                        type="text"
                        className="campo-controle"
                        placeholder="DD/MM/AAAA"
                        value={sDataInicio}
                        onChange={(oEvento) => setDataInicio(oEvento.target.value)}
                     />
                  </label>

                  <label className="campo">
                     <span className="campo-rotulo">Data final</span>
                     <input
                        type="text"
                        className="campo-controle"
                        placeholder="DD/MM/AAAA"
                        value={sDataFim}
                        onChange={(oEvento) => setDataFim(oEvento.target.value)}
                     />
                  </label>

                  <div className="filtro-acao">
                     <button type="button" className="btn btn-primario" onClick={carrega} disabled={bCarregando}>
                        {bCarregando ? <Loader2 size={14} className="girando" /> : <Search size={14} />}
                        Consultar
                     </button>
                     <button
                        type="button"
                        className="btn btn-neutro"
                        onClick={() => {
                           setAcaoFiltro('');
                           setDataInicio('');
                           setDataFim('');
                        }}
                     >
                        <RefreshCw size={14} />
                        Limpar
                     </button>
                  </div>
               </div>

               {aResumo.length > 0 ? (
                  <div className="linha-saldos">
                     {aResumo.map((oItem) => (
                        <div className="card-saldo" key={oItem.tipAcao}>
                           <div>
                              <div className="card-saldo-rotulo">{oItem.desAcao}</div>
                              <div className="card-saldo-valor">{oItem.iQuantidade}</div>
                           </div>
                        </div>
                     ))}
                  </div>
               ) : null}
            </div>
         </div>

         <div className="area-conciliacao" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' }}>
            {/* ---------- Eventos ---------- */}
            <div className="painel">
               <header className="painel-cabecalho">
                  <FileClock size={15} />
                  Eventos registrados
                  <span className="chip-contador" style={{ marginLeft: 'auto' }}>
                     {aEventos.length} registro(s)
                  </span>
               </header>

               <div className="grade-wrapper" style={{ maxHeight: 460 }}>
                  {bCarregando ? (
                     <div className="carregando">
                        <Loader2 size={20} className="girando" />
                        Consultando a trilha de auditoria...
                     </div>
                  ) : aEventos.length === 0 ? (
                     <div className="grade-vazia">Nenhum evento registrado para os filtros informados.</div>
                  ) : (
                     <table className="grade">
                        <thead>
                           <tr>
                              <th>Data / hora</th>
                              <th>Usuário</th>
                              <th>Ação</th>
                              <th className="col-historico">Detalhe</th>
                              <th className="col-valor">Valor</th>
                           </tr>
                        </thead>
                        <tbody>
                           {aEventos.map((oEvento) => (
                              <tr key={oEvento.idAuditoria} style={{ cursor: 'default' }}>
                                 <td>{formataDataHora(oEvento.datEvento)}</td>
                                 <td>{oEvento.nomUsuario}</td>
                                 <td>
                                    <span className="selo selo-neutro">{oEvento.desAcao}</span>
                                 </td>
                                 <td className="col-historico">{oEvento.desDetalhe}</td>
                                 <td className="col-valor">
                                    {oEvento.valReferencia === null ? '—' : formataMoeda(oEvento.valReferencia)}
                                 </td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  )}
               </div>
            </div>

            {/* ---------- Arquivos enviados ---------- */}
            <div className="painel">
               <header className="painel-cabecalho">
                  <FileUp size={15} />
                  Arquivos importados
                  <span className="chip-contador" style={{ marginLeft: 'auto' }}>
                     {aArquivos.length}
                  </span>
               </header>

               <div className="grade-wrapper" style={{ maxHeight: 460 }}>
                  {aArquivos.length === 0 ? (
                     <div className="grade-vazia">Nenhum arquivo de extrato foi enviado para esta conta.</div>
                  ) : (
                     <table className="grade">
                        <thead>
                           <tr>
                              <th>Data</th>
                              <th className="col-historico">Arquivo</th>
                              <th>Formato</th>
                              <th className="col-valor">Novos</th>
                           </tr>
                        </thead>
                        <tbody>
                           {aArquivos.map((oArquivo, iIndice) => (
                              <tr key={`${oArquivo.nomArquivo}-${iIndice}`} style={{ cursor: 'default' }}>
                                 <td>{formataDataHora(oArquivo.datImportacao)}</td>
                                 <td className="col-historico" title={oArquivo.nomArquivo}>
                                    {oArquivo.nomArquivo}
                                 </td>
                                 <td>
                                    <span className="selo selo-neutro">{oArquivo.tipFormato}</span>
                                 </td>
                                 <td className="col-valor">
                                    {oArquivo.qtdImportados} / {oArquivo.qtdLidos}
                                 </td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  )}
               </div>
            </div>
         </div>
      </AppShell>
   );
} // PainelAuditoria
