'use client';
// ============================================================================
// BankSelectorPage.jsx - Escolha da conta corrente a ser conciliada
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Tela inicial descrita no item 6.1.1 do documento de visão: ao acessar a
// opção "Bancos", o usuário escolhe a conta corrente. Cada cartão exibe o
// banco, a agência, o saldo previsto no sistema e a data do último bloqueio.
// Também permite cadastrar nova conta (banco/agência/C.C.).
// ============================================================================

import { useMemo, useState } from 'react';
import { CheckCircle2, CircleDashed, Landmark, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { useBankContext } from '../../contexts/BankContext.jsx';
import { MarcaBanco } from '../comum/MarcaBanco.jsx';
import { CadastroContaModal } from '../comum/CadastroContaModal.jsx';
import { formataMoeda, normalizaTexto, trataDataNula } from '../../utils/formatters.js';

/**
 * Tela de seleção da conta corrente.
 * @param {object} oPropriedades
 * @param {(codConta: string) => void} oPropriedades.aoSelecionar Callback da escolha
 */
export function BankSelectorPage({ aoSelecionar }) {
   const { aContas, bCarregando, sErro, selecionaConta, removeContaCadastrada } = useBankContext();
   const [sPesquisa, setPesquisa] = useState('');
   const [bCadastroAberto, setCadastroAberto] = useState(false);

   // Filtra pelo banco, agência, conta ou descrição da agência
   const aContasFiltradas = useMemo(() => {
      const sTermo = normalizaTexto(sPesquisa);
      if (!sTermo) {
         return aContas;
      }

      return aContas.filter((oConta) => {
         const sConteudo = normalizaTexto(
            `${oConta.codBanco} ${oConta.nomBanco} ${oConta.codAgencia} ${oConta.numContaCorrente} ${oConta.desAgencia}`
         );
         return sConteudo.includes(sTermo);
      });
   }, [aContas, sPesquisa]);

   /**
    * Registra a conta escolhida e avança para a tela de conciliação.
    * @param {string} sCodConta
    */
   function trataEscolha(sCodConta) {
      selecionaConta(sCodConta);
      aoSelecionar?.(sCodConta);
   } // trataEscolha

   /**
    * Remove conta cadastrada localmente sem selecioná-la.
    * @param {import('react').MouseEvent} oEvento
    * @param {string} sCodConta
    */
   function trataRemocao(oEvento, sCodConta) {
      oEvento.stopPropagation();
      void removeContaCadastrada(sCodConta);
   } // trataRemocao

   return (
      <div className="selecao-banco-pagina">
         <div className="selecao-banco-caixa">
            <header className="painel-cabecalho">
               <Landmark size={15} />
               Banco/Agência para Conciliação Bancária
               <div className="painel-acoes">
                  <button
                     type="button"
                     className="btn btn-primario btn-pequeno"
                     onClick={() => setCadastroAberto(true)}
                  >
                     <Plus size={13} />
                     Cadastrar conta
                  </button>
               </div>
            </header>

            <div className="selecao-banco-corpo">
               <div className="selecao-banco-busca">
                  <span className="campo-rotulo">Banco/Agência</span>
                  <div className="campo-busca">
                     <input
                        type="search"
                        className="campo-controle"
                        placeholder="Pesquisar por banco, agência ou conta corrente"
                        value={sPesquisa}
                        onChange={(oEvento) => setPesquisa(oEvento.target.value)}
                        aria-label="Pesquisar conta corrente"
                     />
                     <Search className="campo-busca-icone" />
                  </div>
               </div>

               {bCarregando ? (
                  <div className="carregando">
                     <Loader2 size={22} className="girando" />
                     Carregando contas correntes...
                  </div>
               ) : null}

               {!bCarregando && sErro ? <div className="alerta alerta-erro">{sErro}</div> : null}

               {!bCarregando && !sErro && aContasFiltradas.length === 0 ? (
                  <div className="grade-vazia">
                     Nenhuma conta corrente localizada.
                     {' '}
                     <button
                        type="button"
                        className="btn btn-primario btn-pequeno"
                        onClick={() => setCadastroAberto(true)}
                        style={{ marginTop: 10 }}
                     >
                        <Plus size={13} />
                        Cadastrar a primeira conta
                     </button>
                  </div>
               ) : null}

               {!bCarregando && aContasFiltradas.length > 0 ? (
                  <div className="selecao-banco-grade">
                     {aContasFiltradas.map((oConta) => (
                        <button
                           key={oConta.codConta}
                           type="button"
                           className="cartao-banco"
                           onClick={() => trataEscolha(oConta.codConta)}
                        >
                           <div className="cartao-banco-topo">
                              <MarcaBanco
                                 codBanco={oConta.codBanco}
                                 corBanco={oConta.corBanco}
                                 corTexto={oConta.corTexto}
                                 nomBanco={oConta.nomBanco}
                              />
                              <span className="cartao-banco-nome">
                                 {oConta.codBanco} - {oConta.nomBanco}
                              </span>
                              <span
                                 role="button"
                                 tabIndex={0}
                                 className="cartao-banco-remover"
                                 title="Remover conta do MySQL"
                                 onClick={(oEvento) => trataRemocao(oEvento, oConta.codConta)}
                                 onKeyDown={(oEvento) => {
                                    if (oEvento.key === 'Enter' || oEvento.key === ' ') {
                                       trataRemocao(oEvento, oConta.codConta);
                                    }
                                 }}
                              >
                                 <Trash2 size={12} />
                              </span>
                           </div>

                           <div className="cartao-banco-dados">
                              <span>
                                 Agência <span className="destaque">{oConta.codAgencia}</span>
                                 {'  ·  '}
                                 C.C.: <span className="destaque">{oConta.numContaCorrente}</span>
                              </span>
                              <span>{oConta.desAgencia}</span>
                              <span>
                                 Saldo previsto:{' '}
                                 <span className="destaque">{formataMoeda(oConta.valSaldoSistema)}</span>
                              </span>
                              <span>Último bloqueio: {trataDataNula(oConta.datUltimoBloqueio)}</span>
                           </div>

                           {oConta.bIntegracaoConfigurada ? (
                              <span className="cartao-banco-situacao situacao-configurado">
                                 <CheckCircle2 size={11} />
                                 Integração configurada
                              </span>
                           ) : (
                              <span className="cartao-banco-situacao situacao-pendente">
                                 <CircleDashed size={11} />
                                 Importação por arquivo ou homologação
                              </span>
                           )}
                        </button>
                     ))}
                  </div>
               ) : null}
            </div>
         </div>

         <CadastroContaModal
            aberto={bCadastroAberto}
            aoFechar={() => setCadastroAberto(false)}
            aoCadastrar={trataEscolha}
         />
      </div>
   );
} // BankSelectorPage
