'use client';
// ============================================================================
// ModalBaixarTitulo.jsx - Busca e baixa de títulos
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Item 6.1.3.8 — ação 3 do documento de visão: "Abrir tela que exibe o valor
// das entradas e saídas selecionadas na grade de lançamentos e busca todos os
// títulos (a pagar e a receber) abertos e adiantamentos a efetivar (de cliente
// e para fornecedor) até a data do movimento. Permitir informar data e valores
// de baixa, multa, juros, desconto, tarifa para um ou mais documentos. Ao
// confirmar, realizar a baixa do documento atualizando sua origem e gerando o
// lançamento no extrato do sistema."
//
// Colunas conforme o documento: Data Emissão, Número Documento, Descrição
// (Histórico), Valor do título (Parcela), Juros, Multa, Desconto, Valor Pago
// total, Tipo Movimento e Origem.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, HandCoins, Loader2, Power, Search } from 'lucide-react';
import { Modal } from '../comum/Modal.jsx';
import { CampoData } from '../comum/CampoData.jsx';
import { buscaTitulosAbertos } from '../../services/conciliacaoService.js';
import { converteTextoParaValor, formataMoeda, formataValor } from '../../utils/formatters.js';

/** Campos de valor editáveis por título */
const CAMPOS_VALOR = ['sValJuros', 'sValMulta', 'sValDesconto', 'sValTarifa', 'sValPago'];

/**
 * Arredonda para duas casas, evitando resíduo binário nas somas de moeda.
 * @param {number} nValor
 * @returns {number}
 */
function arredonda(nValor) {
   return Math.round(nValor * 100) / 100;
} // arredonda

/**
 * Monta o estado editável de um título a partir dos dados vindos do servidor.
 * @param {object} oTitulo
 * @param {string} sDataBaixaPadrao
 * @returns {object}
 */
function montaEdicao(oTitulo, sDataBaixaPadrao) {
   return {
      datBaixa: sDataBaixaPadrao,
      sValJuros: formataValor(oTitulo.valJuros),
      sValMulta: formataValor(oTitulo.valMulta),
      sValDesconto: formataValor(oTitulo.valDesconto),
      sValTarifa: formataValor(0),
      sValPago: formataValor(oTitulo.valPagoSugerido),
      bValPagoManual: false,
   };
} // montaEdicao

/**
 * @param {object} oPropriedades
 * @param {boolean} oPropriedades.aberto
 * @param {string} oPropriedades.sCodConta
 * @param {string} oPropriedades.sDataMovimento Data limite / data da baixa
 * @param {object} oPropriedades.oResumoSelecao Entradas e saídas selecionadas na grade
 * @param {(baixas: Array<object>) => Promise<boolean>} oPropriedades.aoConfirmar
 * @param {() => void} oPropriedades.aoFechar
 */
export function ModalBaixarTitulo({
   aberto,
   sCodConta,
   sDataMovimento,
   oResumoSelecao,
   aoConfirmar,
   aoFechar,
}) {
   const [aTitulos, setTitulos] = useState([]);
   const [oEdicoes, setEdicoes] = useState({});
   const [aSelecionados, setSelecionados] = useState([]);
   const [sDataLimite, setDataLimite] = useState('');
   const [sTipoFiltro, setTipoFiltro] = useState('');
   const [bCarregando, setCarregando] = useState(false);
   const [bGravando, setGravando] = useState(false);
   const [sErro, setErro] = useState('');

   const carrega = useCallback(
      async (sLimite, sTipo) => {
         if (!sCodConta) {
            return;
         }

         setCarregando(true);
         setErro('');
         try {
            const oRetorno = await buscaTitulosAbertos(sCodConta, sLimite, sTipo);
            const aLista = oRetorno.titulos ?? [];
            setTitulos(aLista);
            setSelecionados([]);

            const oNovasEdicoes = {};
            for (const oTitulo of aLista) {
               oNovasEdicoes[oTitulo.codTitulo] = montaEdicao(oTitulo, sLimite);
            }
            setEdicoes(oNovasEdicoes);
         } catch (oErro) {
            setErro(oErro.message);
            setTitulos([]);
         } finally {
            setCarregando(false);
         }
      },
      [sCodConta]
   );

   // Ao abrir, busca os títulos vencidos até a data do movimento
   useEffect(() => {
      if (!aberto) {
         return;
      }
      setDataLimite(sDataMovimento);
      setTipoFiltro('');
      carrega(sDataMovimento, '');
   }, [aberto, sDataMovimento, carrega]);

   /**
    * Altera um campo editável de um título.
    * @param {string} sCodTitulo
    * @param {string} sCampo
    * @param {string} sValor
    */
   function alteraCampo(sCodTitulo, sCampo, sValor) {
      setEdicoes((oAtual) => {
         const oTituloEdicao = { ...oAtual[sCodTitulo], [sCampo]: sValor };

         // Editar o valor pago manualmente congela o cálculo automático; sem
         // isso, ajustar juros logo depois apagaria o valor digitado
         if (sCampo === 'sValPago') {
            oTituloEdicao.bValPagoManual = true;
         } else if (!oTituloEdicao.bValPagoManual && CAMPOS_VALOR.includes(sCampo)) {
            const oTitulo = aTitulos.find((oItem) => oItem.codTitulo === sCodTitulo);
            if (oTitulo) {
               const nCalculado =
                  oTitulo.valTitulo +
                  converteTextoParaValor(oTituloEdicao.sValMulta) +
                  converteTextoParaValor(oTituloEdicao.sValJuros) -
                  converteTextoParaValor(oTituloEdicao.sValDesconto);
               oTituloEdicao.sValPago = formataValor(arredonda(Math.max(nCalculado, 0)));
            }
         }

         return { ...oAtual, [sCodTitulo]: oTituloEdicao };
      });
      setErro('');
   } // alteraCampo

   /**
    * Marca ou desmarca um título.
    * @param {string} sCodTitulo
    */
   function alternaSelecao(sCodTitulo) {
      setSelecionados((aAtual) =>
         aAtual.includes(sCodTitulo)
            ? aAtual.filter((sItem) => sItem !== sCodTitulo)
            : [...aAtual, sCodTitulo]
      );
      setErro('');
   } // alternaSelecao

   /** Marca ou desmarca todos os títulos listados. */
   function alternaSelecaoTotal() {
      setSelecionados((aAtual) =>
         aAtual.length === aTitulos.length ? [] : aTitulos.map((oItem) => oItem.codTitulo)
      );
   } // alternaSelecaoTotal

   /** Totais dos títulos marcados, para conferir com a seleção da grade */
   const oTotais = useMemo(() => {
      let nEntradas = 0;
      let nSaidas = 0;

      for (const sCodTitulo of aSelecionados) {
         const oTitulo = aTitulos.find((oItem) => oItem.codTitulo === sCodTitulo);
         const oEdicao = oEdicoes[sCodTitulo];
         if (!oTitulo || !oEdicao) {
            continue;
         }

         const nPago = converteTextoParaValor(oEdicao.sValPago);
         const nTarifa = converteTextoParaValor(oEdicao.sValTarifa);

         if (oTitulo.bEntrada) {
            nEntradas += nPago;
         } else {
            nSaidas += nPago;
         }
         // A tarifa é sempre um custo, independentemente do sentido do título
         nSaidas += nTarifa;
      }

      return {
         valEntradas: arredonda(nEntradas),
         valSaidas: arredonda(nSaidas),
         valLiquido: arredonda(nEntradas - nSaidas),
      };
   }, [aSelecionados, aTitulos, oEdicoes]);

   /** Diferença entre o que foi selecionado na grade e o que será baixado */
   const nDiferenca = useMemo(
      () => arredonda((oResumoSelecao?.valLiquido ?? 0) - oTotais.valLiquido),
      [oResumoSelecao, oTotais]
   );

   /** Valida e confirma as baixas. */
   async function confirma() {
      setErro('');

      if (aSelecionados.length === 0) {
         setErro('Selecione ao menos um título para baixar.');
         return;
      }

      const aBaixas = [];
      for (const sCodTitulo of aSelecionados) {
         const oEdicao = oEdicoes[sCodTitulo];
         const nPago = converteTextoParaValor(oEdicao?.sValPago);

         if (!oEdicao?.datBaixa) {
            setErro(`Informe a data de baixa do título ${sCodTitulo}.`);
            return;
         }
         if (nPago <= 0) {
            setErro(`O valor pago do título ${sCodTitulo} deve ser maior que zero.`);
            return;
         }

         aBaixas.push({
            codTitulo: sCodTitulo,
            datBaixa: oEdicao.datBaixa,
            valPago: nPago,
            valMulta: converteTextoParaValor(oEdicao.sValMulta),
            valJuros: converteTextoParaValor(oEdicao.sValJuros),
            valDesconto: converteTextoParaValor(oEdicao.sValDesconto),
            valTarifa: converteTextoParaValor(oEdicao.sValTarifa),
         });
      }

      setGravando(true);
      try {
         const bSucesso = await aoConfirmar(aBaixas);
         if (bSucesso) {
            aoFechar();
         }
      } finally {
         setGravando(false);
      }
   } // confirma

   return (
      <Modal
         aberto={aberto}
         titulo="Baixar Título"
         icone={<HandCoins size={17} />}
         largura="gg"
         aoFechar={aoFechar}
         rodape={
            <>
               <button
                  type="button"
                  className="btn btn-primario"
                  onClick={confirma}
                  disabled={bGravando || bCarregando}
               >
                  <CheckCircle2 size={14} />
                  {bGravando ? 'Baixando...' : `Baixar ${aSelecionados.length} título(s)`}
               </button>
               <button type="button" className="btn btn-neutro" onClick={aoFechar} disabled={bGravando}>
                  <Power size={14} />
                  Cancelar
               </button>
            </>
         }
      >
         {/* ---------- Valor selecionado na grade de lançamentos ---------- */}
         <div className="linha-saldos" style={{ marginBottom: 12 }}>
            <div className="card-saldo">
               <div>
                  <div className="card-saldo-rotulo">Entradas selecionadas na grade</div>
                  <div className="card-saldo-valor">{formataMoeda(oResumoSelecao?.valEntradas ?? 0)}</div>
               </div>
            </div>
            <div className="card-saldo">
               <div>
                  <div className="card-saldo-rotulo">Saídas selecionadas na grade</div>
                  <div className="card-saldo-valor">{formataMoeda(oResumoSelecao?.valSaidas ?? 0)}</div>
               </div>
            </div>
            <div className="card-saldo">
               <div>
                  <div className="card-saldo-rotulo">Total a baixar</div>
                  <div className="card-saldo-valor">{formataMoeda(oTotais.valLiquido)}</div>
               </div>
            </div>
            <div className="card-saldo">
               <div>
                  <div className="card-saldo-rotulo">Diferença</div>
                  <div className={`card-saldo-valor ${nDiferenca === 0 ? '' : 'negativo'}`}>
                     {formataMoeda(nDiferenca)}
                  </div>
               </div>
            </div>
         </div>

         {/* ---------- Filtros da busca de títulos ---------- */}
         <div className="linha-campos col-3" style={{ marginBottom: 12 }}>
            <CampoData
               rotulo="Títulos vencidos até"
               valor={sDataLimite}
               aoAlterar={setDataLimite}
               titulo="Traz os títulos em aberto até a data do movimento"
            />

            <label className="campo">
               <span className="campo-rotulo">Tipo de movimento</span>
               <select
                  className="campo-controle"
                  value={sTipoFiltro}
                  onChange={(oEvento) => setTipoFiltro(oEvento.target.value)}
               >
                  <option value="">A pagar e a receber</option>
                  <option value="Entrada">Somente a receber (entrada)</option>
                  <option value="Saída">Somente a pagar (saída)</option>
               </select>
            </label>

            <div className="filtro-acao">
               <button
                  type="button"
                  className="btn btn-secundario"
                  onClick={() => carrega(sDataLimite, sTipoFiltro)}
                  disabled={bCarregando}
               >
                  {bCarregando ? <Loader2 size={14} className="girando" /> : <Search size={14} />}
                  Buscar títulos
               </button>
            </div>
         </div>

         {sErro ? (
            <div className="alerta alerta-erro" style={{ marginBottom: 12 }}>
               {sErro}
            </div>
         ) : null}

         {/* ---------- Relação de títulos em aberto ---------- */}
         <div className="grade-wrapper" style={{ maxHeight: 340 }}>
            {bCarregando ? (
               <div className="carregando">
                  <Loader2 size={20} className="girando" />
                  Buscando títulos em aberto...
               </div>
            ) : aTitulos.length === 0 ? (
               <div className="grade-vazia">
                  Nenhum título em aberto até {sDataLimite || 'a data informada'}.
               </div>
            ) : (
               <table className="grade">
                  <thead>
                     <tr>
                        <th className="col-selecao">
                           <input
                              type="checkbox"
                              className="checkbox"
                              checked={aTitulos.length > 0 && aSelecionados.length === aTitulos.length}
                              onChange={alternaSelecaoTotal}
                              aria-label="Selecionar todos os títulos"
                           />
                        </th>
                        <th>Emissão</th>
                        <th>Vencimento</th>
                        <th>Documento</th>
                        <th className="col-historico">Descrição</th>
                        <th className="col-valor">Parcela</th>
                        <th className="col-valor">Juros</th>
                        <th className="col-valor">Multa</th>
                        <th className="col-valor">Desconto</th>
                        <th className="col-valor">Tarifa</th>
                        <th className="col-valor">Valor pago</th>
                        <th>Data baixa</th>
                        <th>Tipo</th>
                        <th>Origem</th>
                     </tr>
                  </thead>
                  <tbody>
                     {aTitulos.map((oTitulo) => {
                        const oEdicao = oEdicoes[oTitulo.codTitulo] ?? {};
                        const bSel = aSelecionados.includes(oTitulo.codTitulo);

                        return (
                           <tr key={oTitulo.codTitulo} className={bSel ? 'selecionada' : ''}>
                              <td className="col-selecao">
                                 <input
                                    type="checkbox"
                                    className="checkbox"
                                    checked={bSel}
                                    onChange={() => alternaSelecao(oTitulo.codTitulo)}
                                 />
                              </td>
                              <td>{oTitulo.datEmissao || '—'}</td>
                              <td>{oTitulo.datVencimento}</td>
                              <td>{oTitulo.numDocumento || oTitulo.codTitulo}</td>
                              <td className="col-historico" title={oTitulo.desHistorico ?? ''}>
                                 {oTitulo.nomEmitente}
                                 {oTitulo.numParcela ? ` · parcela ${oTitulo.numParcela}` : ''}
                              </td>
                              <td className="col-valor">{formataValor(oTitulo.valTitulo)}</td>

                              {['sValJuros', 'sValMulta', 'sValDesconto', 'sValTarifa', 'sValPago'].map(
                                 (sCampo) => (
                                    <td className="col-valor" key={sCampo}>
                                       <input
                                          type="text"
                                          className="campo-controle campo-controle-valor campo-grade"
                                          value={oEdicao[sCampo] ?? ''}
                                          onChange={(oEvento) =>
                                             alteraCampo(oTitulo.codTitulo, sCampo, oEvento.target.value)
                                          }
                                          disabled={!bSel}
                                          aria-label={`${sCampo} do título ${oTitulo.codTitulo}`}
                                       />
                                    </td>
                                 )
                              )}

                              <td>
                                 <CampoData
                                    valor={oEdicao.datBaixa ?? ''}
                                    aoAlterar={(sData) => alteraCampo(oTitulo.codTitulo, 'datBaixa', sData)}
                                    desabilitado={!bSel}
                                    classe="campo-data-grade"
                                 />
                              </td>
                              <td>
                                 <span className={`selo ${oTitulo.bEntrada ? 'selo-receber' : 'selo-pagar'}`}>
                                    {oTitulo.tipMovimento}
                                 </span>
                              </td>
                              <td>{oTitulo.tipOrigem}</td>
                           </tr>
                        );
                     })}
                  </tbody>
               </table>
            )}
         </div>

         <div className="alerta alerta-info" style={{ marginTop: 12 }}>
            Ao confirmar, cada título selecionado é marcado como baixado, tem a origem atualizada para
            &quot;Baixa de Título&quot; e gera o lançamento correspondente no extrato do sistema. Tarifas
            informadas geram um lançamento de saída próprio.
         </div>
      </Modal>
   );
} // ModalBaixarTitulo
