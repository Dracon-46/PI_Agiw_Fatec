'use client';
// ============================================================================
// ModalLancamento.jsx - Caixa de lançamento bancário (inclusão, detalhes e
// edição)
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Atende a ação 1 do menu do botão direito (item 6.1.3.8): "Abrir caixa para
// informar dados e gerar novo lançamento na grade de Lançamentos no Sistema".
// Quando aberta a partir de um movimento do banco, os campos já vêm
// preenchidos com os dados da linha, conforme previsto no documento.
//
// Ata de 24/09/2026:
//   - tela de detalhes do lançamento no MESMO padrão da tela de criação, e a
//     edição a partir dela — por isso as três situações são a mesma caixa;
//   - asterisco (*) nos campos obrigatórios;
//   - origem bloqueada para edição em lançamento já existente;
//   - subgrupo obrigatório, trocado automaticamente conforme o tipo de
//     movimento (Entrada/Saída), e o tipo de movimento sugerido pelo
//     subgrupo (débito sugere Entrada, crédito sugere Saída);
//   - rateio do valor por centro de custo;
//   - tipo de documento com pesquisa (autocomplete) e, escolhido o documento,
//     a lista de bancos filtrada pelas contas que o usam — filtro que só entra
//     depois da escolha e que pode ser desligado.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { CircleDollarSign, Eye, Pencil, PlusCircle, Power, Save } from 'lucide-react';
import { Modal } from '../comum/Modal.jsx';
import { CampoData } from '../comum/CampoData.jsx';
import { CampoAutocomplete } from '../comum/CampoAutocomplete.jsx';
import { RateioCentroCusto, linhasParaRateio, rateioParaLinhas } from './RateioCentroCusto.jsx';
import { useBankContext } from '../../contexts/BankContext.jsx';
import { buscaContasDoDocumentoApi, buscaLancamentoApi } from '../../services/conciliacaoService.js';
import { ORIGENS_LANCAMENTO } from '../../utils/origens.js';
import { validaRateio } from '../../utils/rateio.js';
import {
   buscaSubgrupoPorChave,
   chaveSubgrupo,
   localizaSubgrupo,
   sentidoDaCategoria,
   subgrupoAtendeSentido,
   trocaSubgrupoPorSentido,
} from '../../utils/subgrupos.js';
import {
   converteTextoParaValor,
   formataContaCorrente,
   formataMoeda,
   formataValor,
} from '../../utils/formatters.js';

/** Situações da caixa */
export const MODO_NOVO = 'novo';
export const MODO_DETALHE = 'detalhe';
export const MODO_EDICAO = 'edicao';

/** Títulos da caixa em cada situação */
const TITULOS = {
   [MODO_NOVO]: 'Novo Lançamento Bancário',
   [MODO_DETALHE]: 'Detalhes do Lançamento',
   [MODO_EDICAO]: 'Editar Lançamento',
};

/** Estado inicial do formulário */
const FORMULARIO_VAZIO = {
   datMovimento: '',
   datCompensacao: '',
   tipDocumento: '',
   numDocumento: '',
   desHistorico: '',
   sValor: '',
   bEntrada: false,
   sChaveSubgrupo: '',
   codContaContabil: '',
   tipOrigem: 'Conciliação',
   codConta: '',
   aRateio: [],
};

/**
 * Rótulo do subgrupo na lista, com o sentido que ele sugere.
 * @param {object} oSubgrupo
 * @returns {string}
 */
function descreveSubgrupo(oSubgrupo) {
   const bSentido = sentidoDaCategoria(oSubgrupo.categoria);
   const sSentido = bSentido === null ? '' : bSentido ? ' · sugere Entrada' : ' · sugere Saída';
   return `${oSubgrupo.codSubgrupo} — ${oSubgrupo.desSubgrupo}${sSentido}`;
} // descreveSubgrupo

/**
 * Rótulo da conta na lista de bancos.
 * @param {object} oConta
 * @returns {string}
 */
function descreveConta(oConta) {
   return `${oConta.codBanco} - ${oConta.nomBanco} · Ag. ${oConta.codAgencia} · C.C. ${oConta.numContaCorrente}`;
} // descreveConta

/**
 * @param {object} oPropriedades
 * @param {boolean} oPropriedades.aberto
 * @param {'novo'|'detalhe'|'edicao'} [oPropriedades.sModo] Situação da caixa
 * @param {object|null} [oPropriedades.oLancamentoBase] Linha da grade (detalhe/edição)
 * @param {object|null} [oPropriedades.oMovimentoBase] Movimento do banco de origem (inclusão)
 * @param {string} oPropriedades.sDataSugerida Data usada quando não há movimento
 * @param {(dados: object, sCodConta: string) => Promise<boolean>} oPropriedades.aoConfirmar Inclusão
 * @param {(sCodLancamento: string, dados: object) => Promise<boolean>} [oPropriedades.aoAlterar] Edição
 * @param {() => void} oPropriedades.aoFechar
 */
export function ModalLancamento({
   aberto,
   sModo = MODO_NOVO,
   oLancamentoBase = null,
   oMovimentoBase = null,
   sDataSugerida,
   aoConfirmar,
   aoAlterar,
   aoFechar,
}) {
   const { aContas, oCatalogos, oContaSelecionada } = useBankContext();
   const [sModoAtual, setModoAtual] = useState(sModo);
   const [oFormulario, setFormulario] = useState(FORMULARIO_VAZIO);
   const [oLancamentoLido, setLancamentoLido] = useState(null);
   const [bLendo, setLendo] = useState(false);
   const [bGravando, setGravando] = useState(false);
   const [sErro, setErro] = useState('');
   // Filtro de bancos pelo documento: null = sem filtro (nada escolhido ainda)
   const [bFiltraBancos, setFiltraBancos] = useState(true);
   const [aContasDoDocumento, setContasDoDocumento] = useState(null);

   const bNovo = sModoAtual === MODO_NOVO;
   const bSomenteLeitura = sModoAtual === MODO_DETALHE;
   const bTransferencia = Boolean(oLancamentoLido?.codTransferencia);

   // Prepara o formulário a cada abertura
   useEffect(() => {
      if (!aberto) {
         return undefined;
      }

      setErro('');
      setModoAtual(sModo);
      setLancamentoLido(null);
      setContasDoDocumento(null);
      setFiltraBancos(true);

      if (sModo !== MODO_NOVO && oLancamentoBase && oContaSelecionada) {
         // Detalhe e edição leem o lançamento da base: a linha da grade não
         // traz o rateio, e pode estar desatualizada
         let bAtivo = true;
         setLendo(true);
         buscaLancamentoApi(oContaSelecionada.codConta, oLancamentoBase.codLancamento)
            .then((oRetorno) => {
               if (!bAtivo) {
                  return;
               }
               const oLanc = oRetorno.lancamento;
               const oSubgrupo = localizaSubgrupo(
                  oCatalogos.aSubgrupos,
                  oLanc.codSubgrupo,
                  oLanc.categoriaSubgrupo,
                  oLanc.bEntrada
               );
               setLancamentoLido(oLanc);
               setFormulario({
                  datMovimento: oLanc.datMovimento,
                  datCompensacao: oLanc.datCompensacao || oLanc.datMovimento,
                  tipDocumento: oLanc.tipDocumento,
                  numDocumento: oLanc.numDocumento,
                  desHistorico: oLanc.desHistorico,
                  sValor: formataValor(oLanc.valMovimento),
                  bEntrada: Boolean(oLanc.bEntrada),
                  sChaveSubgrupo: chaveSubgrupo(oSubgrupo),
                  codContaContabil: oLanc.codContaContabil ?? '',
                  tipOrigem: oLanc.tipOrigem,
                  codConta: oContaSelecionada.codConta,
                  aRateio: rateioParaLinhas(oLanc.aRateio),
               });
               // Pedir edição de um lançamento que não aceita alteração abre
               // os detalhes, com o motivo
               if (sModo === MODO_EDICAO && !oLanc.bEditavel) {
                  setModoAtual(MODO_DETALHE);
                  setErro(
                     oLanc.staConciliado
                        ? 'Lançamento conciliado não pode ser alterado. Estorne a conciliação antes.'
                        : `Lançamento com origem "${oLanc.tipOrigem}" pertence ao ERP e não pode ser alterado aqui.`
                  );
               }
            })
            .catch((oErro) => bAtivo && setErro(oErro.message))
            .finally(() => bAtivo && setLendo(false));

         return () => {
            bAtivo = false;
         };
      }

      if (oMovimentoBase) {
         setFormulario({
            ...FORMULARIO_VAZIO,
            datMovimento: oMovimentoBase.datMovimento,
            datCompensacao: oMovimentoBase.datMovimento,
            numDocumento: oMovimentoBase.numDocumento ?? '',
            desHistorico: oMovimentoBase.desHistorico ?? '',
            sValor: formataValor(oMovimentoBase.valMovimento),
            bEntrada: Boolean(oMovimentoBase.bEntrada),
            // Lançamento nascido de um movimento do banco na conciliação
            tipDocumento: 'MC',
            codConta: oContaSelecionada?.codConta ?? '',
         });
         return undefined;
      }

      setFormulario({
         ...FORMULARIO_VAZIO,
         datMovimento: sDataSugerida,
         datCompensacao: sDataSugerida,
         codConta: oContaSelecionada?.codConta ?? '',
      });
      return undefined;
      // A caixa é preparada na abertura; o catálogo e a conta são lidos ali
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [aberto, sModo, oLancamentoBase, oMovimentoBase, sDataSugerida]);

   // Filtro de bancos pelo documento: só depois da escolha do documento, e
   // só na inclusão (o lançamento existente não troca de conta)
   useEffect(() => {
      if (!aberto || !bNovo || !bFiltraBancos || !oFormulario.tipDocumento) {
         setContasDoDocumento(null);
         return undefined;
      }

      let bAtivo = true;
      buscaContasDoDocumentoApi(oFormulario.tipDocumento)
         .then((oRetorno) => bAtivo && setContasDoDocumento(oRetorno.contas ?? []))
         .catch(() => bAtivo && setContasDoDocumento(null));

      return () => {
         bAtivo = false;
      };
   }, [aberto, bNovo, bFiltraBancos, oFormulario.tipDocumento]);

   const bFiltroAplicado = Array.isArray(aContasDoDocumento) && aContasDoDocumento.length > 0;
   const aContasOferecidas = useMemo(
      () => (bFiltroAplicado ? aContas.filter((oConta) => aContasDoDocumento.includes(oConta.codConta)) : aContas),
      [aContas, aContasDoDocumento, bFiltroAplicado]
   );

   // Conta fora do filtro passa para a primeira que usa o documento
   useEffect(() => {
      if (!bFiltroAplicado || aContasOferecidas.length === 0) {
         return;
      }
      if (!aContasOferecidas.some((oConta) => oConta.codConta === oFormulario.codConta)) {
         setFormulario((oAtual) => ({ ...oAtual, codConta: aContasOferecidas[0].codConta }));
      }
   }, [bFiltroAplicado, aContasOferecidas, oFormulario.codConta]);

   /**
    * Altera um campo do formulário.
    * @param {string} sCampo
    * @param {any} oValor
    */
   function alteraCampo(sCampo, oValor) {
      setFormulario((oAtual) => ({ ...oAtual, [sCampo]: oValor }));
      setErro('');
   } // alteraCampo

   /**
    * Escolha do subgrupo: o tipo de movimento acompanha a categoria
    * (débito sugere Entrada, crédito sugere Saída). É sugestão — o usuário
    * ainda pode trocar o tipo depois.
    * @param {string} sChave
    */
   function alteraSubgrupo(sChave) {
      const oSubgrupo = buscaSubgrupoPorChave(oCatalogos.aSubgrupos, sChave);
      const bSugerido = sentidoDaCategoria(oSubgrupo?.categoria);

      setFormulario((oAtual) => ({
         ...oAtual,
         sChaveSubgrupo: sChave,
         // A perna da transferência não troca de sentido
         bEntrada: bSugerido === null || bTransferencia ? oAtual.bEntrada : bSugerido,
      }));
      setErro('');
   } // alteraSubgrupo

   /**
    * Troca do tipo de movimento: o subgrupo passa para o equivalente do outro
    * sentido, quando existe.
    * @param {boolean} bEntrada
    */
   function alteraTipoMovimento(bEntrada) {
      setFormulario((oAtual) => {
         const oAtualSubgrupo = buscaSubgrupoPorChave(oCatalogos.aSubgrupos, oAtual.sChaveSubgrupo);
         const oNovoSubgrupo = trocaSubgrupoPorSentido(oCatalogos.aSubgrupos, oAtualSubgrupo, bEntrada);
         return { ...oAtual, bEntrada, sChaveSubgrupo: chaveSubgrupo(oNovoSubgrupo) };
      });
      setErro('');
   } // alteraTipoMovimento

   const nValorInformado = converteTextoParaValor(oFormulario.sValor);
   const oSubgrupoSelecionado = buscaSubgrupoPorChave(oCatalogos.aSubgrupos, oFormulario.sChaveSubgrupo);

   // Subgrupos do sentido escolhido; o selecionado fica sempre na lista, mesmo
   // quando o usuário manteve um tipo de movimento diferente da sugestão
   const aSubgruposOferecidos = useMemo(
      () =>
         oCatalogos.aSubgrupos.filter(
            (oItem) =>
               subgrupoAtendeSentido(oItem, oFormulario.bEntrada) ||
               chaveSubgrupo(oItem) === oFormulario.sChaveSubgrupo
         ),
      [oCatalogos.aSubgrupos, oFormulario.bEntrada, oFormulario.sChaveSubgrupo]
   );

   const aOpcoesDocumento = useMemo(
      () =>
         oCatalogos.aTiposDocumento.map((oTipo) => ({
            sValor: oTipo.codTipoDocumento,
            sRotulo: `${oTipo.codTipoDocumento} — ${oTipo.desTipoDocumento}`,
         })),
      [oCatalogos.aTiposDocumento]
   );

   /** Valida os campos e dispara a inclusão ou a alteração. */
   async function confirma() {
      setErro('');

      // Validação na tela antes de acionar o servidor
      if (!oFormulario.datMovimento.trim()) {
         setErro('Informe a data do movimento.');
         return;
      }
      if (bNovo && !oFormulario.tipDocumento) {
         setErro('Selecione o tipo do documento.');
         return;
      }
      if (bNovo && !oFormulario.codConta) {
         setErro('Selecione o banco / agência / conta corrente do lançamento.');
         return;
      }
      if (!oFormulario.desHistorico.trim()) {
         setErro('Informe o histórico do lançamento.');
         return;
      }
      if (nValorInformado <= 0) {
         setErro('O valor do lançamento deve ser maior que zero.');
         return;
      }
      if (!oSubgrupoSelecionado) {
         setErro('Selecione o subgrupo. O subgrupo é obrigatório no ERP.');
         return;
      }
      const aRateio = linhasParaRateio(oFormulario.aRateio);
      const sErroRateio = validaRateio(aRateio, nValorInformado);
      if (sErroRateio) {
         setErro(sErroRateio);
         return;
      }

      const oDados = {
         datMovimento: oFormulario.datMovimento.trim(),
         datCompensacao: oFormulario.datCompensacao.trim() || oFormulario.datMovimento.trim(),
         tipDocumento: oFormulario.tipDocumento,
         numDocumento: oFormulario.numDocumento.trim(),
         desHistorico: oFormulario.desHistorico.trim(),
         valMovimento: nValorInformado,
         bEntrada: oFormulario.bEntrada,
         codSubgrupo: oSubgrupoSelecionado.codSubgrupo,
         categoriaSubgrupo: oSubgrupoSelecionado.categoria,
         codContaContabil: oFormulario.codContaContabil,
         tipOrigem: oFormulario.tipOrigem,
         aRateio,
      };

      setGravando(true);
      try {
         const bSucesso = bNovo
            ? await aoConfirmar(oDados, oFormulario.codConta)
            : await aoAlterar?.(oLancamentoLido.codLancamento, oDados);

         if (bSucesso) {
            aoFechar();
         }
      } finally {
         setGravando(false);
      }
   } // confirma

   /** Rodapé conforme a situação da caixa. */
   function montaRodape() {
      if (bSomenteLeitura) {
         return (
            <>
               {oLancamentoLido?.bEditavel ? (
                  <button
                     type="button"
                     className="btn btn-primario"
                     onClick={() => setModoAtual(MODO_EDICAO)}
                     disabled={bLendo}
                  >
                     <Pencil size={14} />
                     Editar
                  </button>
               ) : null}
               <button type="button" className="btn btn-neutro" onClick={aoFechar}>
                  <Power size={14} />
                  Fechar
               </button>
            </>
         );
      }

      return (
         <>
            <button type="button" className="btn btn-primario" onClick={confirma} disabled={bGravando || bLendo}>
               {bNovo ? <PlusCircle size={14} /> : <Save size={14} />}
               {bGravando ? 'Gravando...' : bNovo ? 'Inserir' : 'Salvar alterações'}
            </button>
            <button
               type="button"
               className="btn btn-neutro"
               onClick={() => (bNovo || sModo === MODO_EDICAO ? aoFechar() : setModoAtual(MODO_DETALHE))}
               disabled={bGravando}
            >
               <Power size={14} />
               Cancelar
            </button>
         </>
      );
   } // montaRodape

   const oContaDoLancamento = aContas.find((oConta) => oConta.codConta === oFormulario.codConta) ?? oContaSelecionada;

   return (
      <Modal
         aberto={aberto}
         titulo={TITULOS[sModoAtual]}
         icone={bSomenteLeitura ? <Eye size={17} /> : <CircleDollarSign size={17} />}
         largura="g"
         aoFechar={aoFechar}
         rodape={montaRodape()}
      >
         {bNovo && oMovimentoBase ? (
            <div className="alerta alerta-info" style={{ marginBottom: 12 }}>
               Dados aproveitados do movimento bancário de {oMovimentoBase.datMovimento} —{' '}
               {formataMoeda(oMovimentoBase.valMovimento)}.
            </div>
         ) : null}

         {!bNovo && bTransferencia ? (
            <div className="alerta alerta-info" style={{ marginBottom: 12 }}>
               Lançamento de transferência: data, valor, subgrupo e rateio são alterados nas duas contas.
            </div>
         ) : null}

         {sErro ? (
            <div className="alerta alerta-erro" style={{ marginBottom: 12 }}>
               {sErro}
            </div>
         ) : null}

         {bLendo ? (
            <div className="grade-vazia">Carregando o lançamento...</div>
         ) : (
            <>
               <div className="grupo-campos">
                  <div className="linha-campos col-3">
                     <CampoData
                        rotulo="Data do movimento"
                        obrigatorio
                        valor={oFormulario.datMovimento}
                        aoAlterar={(sData) => alteraCampo('datMovimento', sData)}
                        desabilitado={bSomenteLeitura}
                     />

                     <CampoData
                        rotulo="Data de compensação"
                        valor={oFormulario.datCompensacao}
                        aoAlterar={(sData) => alteraCampo('datCompensacao', sData)}
                        datMinima={oFormulario.datMovimento}
                        desabilitado={bSomenteLeitura}
                     />

                     {/* Tipo e número do documento são chave do lançamento no
                         ERP: escolhidos na inclusão, fixos depois */}
                     <CampoAutocomplete
                        rotulo="Tipo do documento"
                        obrigatorio
                        aOpcoes={aOpcoesDocumento}
                        valor={oFormulario.tipDocumento}
                        aoAlterar={(sValor) => alteraCampo('tipDocumento', sValor)}
                        placeholder="Pesquise pelo código ou descrição"
                        desabilitado={!bNovo}
                        titulo={!bNovo ? 'O tipo do documento faz parte da chave do lançamento' : undefined}
                     />
                  </div>

                  <div className="linha-campos col-2">
                     <label className="campo">
                        <span className="campo-rotulo">Número do documento</span>
                        <input
                           type="text"
                           className="campo-controle"
                           placeholder={bNovo ? 'Gerado automaticamente se vazio' : ''}
                           value={oFormulario.numDocumento}
                           readOnly={!bNovo}
                           onChange={(oEvento) => alteraCampo('numDocumento', oEvento.target.value)}
                        />
                     </label>

                     <div className="campo">
                        <span className="campo-rotulo">
                           {bNovo ? <span className="obrigatorio">*</span> : null}
                           Banco / Agência / C.C.
                        </span>
                        {bNovo ? (
                           <select
                              className="campo-controle"
                              value={oFormulario.codConta}
                              onChange={(oEvento) => alteraCampo('codConta', oEvento.target.value)}
                           >
                              <option value="">Selecione a conta</option>
                              {aContasOferecidas.map((oConta) => (
                                 <option key={oConta.codConta} value={oConta.codConta}>
                                    {descreveConta(oConta)}
                                 </option>
                              ))}
                           </select>
                        ) : (
                           <input
                              type="text"
                              className="campo-controle"
                              value={formataContaCorrente(oContaDoLancamento)}
                              readOnly
                           />
                        )}
                        {bNovo ? (
                           <span className="campo-ajuda">
                              <label className="campo-ajuda-opcao">
                                 <input
                                    type="checkbox"
                                    className="checkbox"
                                    checked={bFiltraBancos}
                                    onChange={(oEvento) => setFiltraBancos(oEvento.target.checked)}
                                 />
                                 Filtrar bancos pelo documento
                              </label>
                              {!oFormulario.tipDocumento || !bFiltraBancos
                                 ? null
                                 : bFiltroAplicado
                                   ? ` · ${aContasOferecidas.length} conta(s) usam este documento`
                                   : Array.isArray(aContasDoDocumento)
                                     ? ' · nenhuma conta usa este documento ainda; todas exibidas'
                                     : ''}
                           </span>
                        ) : null}
                     </div>
                  </div>

                  <label className="campo">
                     <span className="campo-rotulo">
                        <span className="obrigatorio">*</span>Histórico
                     </span>
                     <input
                        type="text"
                        className="campo-controle"
                        placeholder="Descrição do lançamento"
                        value={oFormulario.desHistorico}
                        readOnly={bSomenteLeitura}
                        onChange={(oEvento) => alteraCampo('desHistorico', oEvento.target.value)}
                     />
                  </label>

                  <div className="linha-campos col-3">
                     <label className="campo">
                        <span className="campo-rotulo">
                           <span className="obrigatorio">*</span>Valor
                        </span>
                        <input
                           type="text"
                           className="campo-controle campo-controle-valor"
                           placeholder="0,00"
                           value={oFormulario.sValor}
                           readOnly={bSomenteLeitura}
                           onChange={(oEvento) => alteraCampo('sValor', oEvento.target.value)}
                        />
                     </label>

                     <label className="campo">
                        <span className="campo-rotulo">
                           <span className="obrigatorio">*</span>Tipo do movimento
                        </span>
                        <select
                           className="campo-controle"
                           value={oFormulario.bEntrada ? 'entrada' : 'saida'}
                           disabled={bSomenteLeitura || bTransferencia}
                           title={
                              bTransferencia ? 'O sentido de cada ponta da transferência é fixo' : undefined
                           }
                           onChange={(oEvento) => alteraTipoMovimento(oEvento.target.value === 'entrada')}
                        >
                           <option value="entrada">Entrada (crédito)</option>
                           <option value="saida">Saída (débito)</option>
                        </select>
                     </label>

                     <label className="campo">
                        <span className="campo-rotulo">Origem</span>
                        <select
                           className="campo-controle"
                           value={oFormulario.tipOrigem}
                           disabled={!bNovo}
                           title={!bNovo ? 'A origem não pode ser alterada em lançamento existente' : undefined}
                           onChange={(oEvento) => alteraCampo('tipOrigem', oEvento.target.value)}
                        >
                           {/* O lançamento existente pode ter origem fora da
                               lista de inclusão (Manual, por exemplo) */}
                           {[...new Set([...ORIGENS_LANCAMENTO, oFormulario.tipOrigem])].map((sOrigem) => (
                              <option key={sOrigem} value={sOrigem}>
                                 {sOrigem}
                              </option>
                           ))}
                        </select>
                     </label>
                  </div>

                  <div className="linha-campos col-2">
                     <label className="campo">
                        <span className="campo-rotulo">
                           <span className="obrigatorio">*</span>Subgrupo
                        </span>
                        <select
                           className="campo-controle"
                           value={oFormulario.sChaveSubgrupo}
                           disabled={bSomenteLeitura}
                           onChange={(oEvento) => alteraSubgrupo(oEvento.target.value)}
                        >
                           <option value="">Selecione o subgrupo</option>
                           {aSubgruposOferecidos.map((oSubgrupo) => (
                              <option key={chaveSubgrupo(oSubgrupo)} value={chaveSubgrupo(oSubgrupo)}>
                                 {descreveSubgrupo(oSubgrupo)}
                              </option>
                           ))}
                        </select>
                     </label>

                     <label className="campo">
                        <span className="campo-rotulo">Conta contábil</span>
                        <select
                           className="campo-controle"
                           value={oFormulario.codContaContabil}
                           disabled={bSomenteLeitura}
                           onChange={(oEvento) => alteraCampo('codContaContabil', oEvento.target.value)}
                        >
                           <option value="">Não informada</option>
                           {oCatalogos.aContasContabeis.map((oConta) => (
                              <option key={oConta.codContaContabil} value={oConta.codContaContabil}>
                                 {oConta.codContaContabil} — {oConta.desContaContabil}
                              </option>
                           ))}
                        </select>
                     </label>
                  </div>
               </div>

               <div className="grupo-campos">
                  <RateioCentroCusto
                     aLinhas={oFormulario.aRateio}
                     aoAlterar={(aLinhas) => alteraCampo('aRateio', aLinhas)}
                     nValorTotal={nValorInformado}
                     aCentrosCusto={oCatalogos.aCentrosCusto}
                     somenteLeitura={bSomenteLeitura}
                  />
               </div>

               {/* O texto vai num span: .alerta é flex, e cada trecho solto
                   viraria uma coluna */}
               <div className="alerta alerta-info" style={{ marginTop: 12 }}>
                  <span>
                     {bSomenteLeitura ? 'Gravado' : 'Será gravado'} como{' '}
                     <strong>
                        {oFormulario.bEntrada ? 'entrada' : 'saída'} de {formataMoeda(nValorInformado)}
                     </strong>
                     . Somente lançamentos com origem &quot;Conciliação&quot; ou &quot;Transferência&quot; podem
                     ser alterados ou excluídos depois.
                  </span>
               </div>
            </>
         )}
      </Modal>
   );
} // ModalLancamento
