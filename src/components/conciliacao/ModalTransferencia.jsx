'use client';
// ============================================================================
// ModalTransferencia.jsx - Transferência entre contas
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Item 6.1.3.8 — ação 2 do documento de visão: "Abrir caixa para informar o
// banco/agência(conta) de contrapartida do movimento e gerar tanto o
// lançamento de débito como o de crédito."
//
// Campos previstos: Data Emissão, Número Documento, Descrição (Histórico),
// Valor do Movimento, Subgrupo, Banco/Agência entrada e Banco/Agência saída.
//
// Aberta a partir de um movimento do banco, a caixa aproveita data, documento,
// histórico e valor da linha, e já posiciona a conta em conciliação no lado
// correto: crédito no banco significa entrada nesta conta.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Power } from 'lucide-react';
import { Modal } from '../comum/Modal.jsx';
import { CampoData } from '../comum/CampoData.jsx';
import { converteTextoParaValor, formataMoeda, formataValor } from '../../utils/formatters.js';
import { subgruposFluxoCaixa } from '../../utils/mockData.js';

/** Estado inicial do formulário */
const FORMULARIO_VAZIO = {
   datMovimento: '',
   numDocumento: '',
   desHistorico: '',
   sValor: '',
   codSubgrupo: '',
   codContaSaida: '',
   codContaEntrada: '',
};

/**
 * Monta o rótulo de uma conta na lista de seleção.
 * @param {object} oConta
 * @returns {string}
 */
function descreveConta(oConta) {
   return `${oConta.codBanco} - ${oConta.nomBanco} · Ag. ${oConta.codAgencia} · C.C. ${oConta.numContaCorrente}`;
} // descreveConta

/**
 * @param {object} oPropriedades
 * @param {boolean} oPropriedades.aberto
 * @param {Array<object>} oPropriedades.aContas Contas cadastradas
 * @param {object|null} oPropriedades.oContaAtual Conta em conciliação
 * @param {object|null} oPropriedades.oMovimentoBase Linha do banco de origem
 * @param {string} oPropriedades.sDataSugerida Data usada sem movimento base
 * @param {(dados: object) => Promise<boolean>} oPropriedades.aoConfirmar
 * @param {() => void} oPropriedades.aoFechar
 */
export function ModalTransferencia({
   aberto,
   aContas,
   oContaAtual,
   oMovimentoBase,
   sDataSugerida,
   aoConfirmar,
   aoFechar,
}) {
   const [oFormulario, setFormulario] = useState(FORMULARIO_VAZIO);
   const [bGravando, setGravando] = useState(false);
   const [sErro, setErro] = useState('');

   useEffect(() => {
      if (!aberto) {
         return;
      }

      setErro('');
      const sCodAtual = oContaAtual?.codConta ?? '';

      // Crédito no extrato do banco = dinheiro entrando nesta conta; nesse
      // caso ela é o destino e a contrapartida fica em aberto para o usuário
      const bEntradaNestaConta = Boolean(oMovimentoBase?.bEntrada);

      setFormulario({
         ...FORMULARIO_VAZIO,
         datMovimento: oMovimentoBase?.datMovimento || sDataSugerida,
         numDocumento: oMovimentoBase?.numDocumento ?? '',
         desHistorico: oMovimentoBase?.desHistorico ?? '',
         sValor: oMovimentoBase ? formataValor(oMovimentoBase.valMovimento) : '',
         codContaEntrada: bEntradaNestaConta ? sCodAtual : '',
         codContaSaida: bEntradaNestaConta ? '' : sCodAtual,
      });
   }, [aberto, oContaAtual, oMovimentoBase, sDataSugerida]);

   /**
    * Altera um campo do formulário.
    * @param {string} sCampo
    * @param {any} oValor
    */
   function alteraCampo(sCampo, oValor) {
      setFormulario((oAtual) => ({ ...oAtual, [sCampo]: oValor }));
      setErro('');
   } // alteraCampo

   const nValorInformado = converteTextoParaValor(oFormulario.sValor);

   const oContaSaida = useMemo(
      () => aContas.find((oItem) => oItem.codConta === oFormulario.codContaSaida) ?? null,
      [aContas, oFormulario.codContaSaida]
   );
   const oContaEntrada = useMemo(
      () => aContas.find((oItem) => oItem.codConta === oFormulario.codContaEntrada) ?? null,
      [aContas, oFormulario.codContaEntrada]
   );

   /** Valida os campos e dispara a transferência. */
   async function confirma() {
      setErro('');

      // Todas as validações antes de acionar o servidor
      if (!oFormulario.codContaSaida || !oFormulario.codContaEntrada) {
         setErro('Informe a conta de saída e a conta de entrada.');
         return;
      }
      if (oFormulario.codContaSaida === oFormulario.codContaEntrada) {
         setErro('As contas de origem e destino devem ser diferentes.');
         return;
      }
      if (!oFormulario.datMovimento) {
         setErro('Informe a data da transferência.');
         return;
      }
      if (!oFormulario.desHistorico.trim()) {
         setErro('Informe o histórico da transferência.');
         return;
      }
      if (nValorInformado <= 0) {
         setErro('O valor da transferência deve ser maior que zero.');
         return;
      }

      setGravando(true);
      try {
         const bSucesso = await aoConfirmar({
            contaSaida: oFormulario.codContaSaida,
            contaEntrada: oFormulario.codContaEntrada,
            datMovimento: oFormulario.datMovimento,
            numDocumento: oFormulario.numDocumento.trim(),
            desHistorico: oFormulario.desHistorico.trim(),
            valMovimento: nValorInformado,
            codSubgrupo: oFormulario.codSubgrupo,
         });

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
         titulo="Transferência entre Contas"
         icone={<ArrowLeftRight size={17} />}
         largura="g"
         aoFechar={aoFechar}
         rodape={
            <>
               <button type="button" className="btn btn-primario" onClick={confirma} disabled={bGravando}>
                  <ArrowLeftRight size={14} />
                  {bGravando ? 'Gerando...' : 'Gerar transferência'}
               </button>
               <button type="button" className="btn btn-neutro" onClick={aoFechar} disabled={bGravando}>
                  <Power size={14} />
                  Cancelar
               </button>
            </>
         }
      >
         {aContas.length < 2 ? (
            <div className="alerta alerta-atencao" style={{ marginBottom: 12 }}>
               É necessário ter ao menos duas contas cadastradas para transferir entre elas.
            </div>
         ) : null}

         {oMovimentoBase ? (
            <div className="alerta alerta-info" style={{ marginBottom: 12 }}>
               Dados aproveitados do movimento bancário de {oMovimentoBase.datMovimento} —{' '}
               {formataMoeda(oMovimentoBase.valMovimento)}.
            </div>
         ) : null}

         {sErro ? (
            <div className="alerta alerta-erro" style={{ marginBottom: 12 }}>
               {sErro}
            </div>
         ) : null}

         <div className="grupo-campos">
            <div className="linha-campos col-2">
               <label className="campo">
                  <span className="campo-rotulo">
                     <span className="obrigatorio">*</span>Banco / Agência de saída (débito)
                  </span>
                  <select
                     className="campo-controle"
                     value={oFormulario.codContaSaida}
                     onChange={(oEvento) => alteraCampo('codContaSaida', oEvento.target.value)}
                  >
                     <option value="">Selecione a conta debitada</option>
                     {aContas.map((oConta) => (
                        <option key={oConta.codConta} value={oConta.codConta}>
                           {descreveConta(oConta)}
                        </option>
                     ))}
                  </select>
               </label>

               <label className="campo">
                  <span className="campo-rotulo">
                     <span className="obrigatorio">*</span>Banco / Agência de entrada (crédito)
                  </span>
                  <select
                     className="campo-controle"
                     value={oFormulario.codContaEntrada}
                     onChange={(oEvento) => alteraCampo('codContaEntrada', oEvento.target.value)}
                  >
                     <option value="">Selecione a conta creditada</option>
                     {aContas.map((oConta) => (
                        <option key={oConta.codConta} value={oConta.codConta}>
                           {descreveConta(oConta)}
                        </option>
                     ))}
                  </select>
               </label>
            </div>

            <div className="linha-campos col-3">
               <CampoData
                  rotulo="Data de emissão"
                  obrigatorio
                  valor={oFormulario.datMovimento}
                  aoAlterar={(sData) => alteraCampo('datMovimento', sData)}
               />

               <label className="campo">
                  <span className="campo-rotulo">Número do documento</span>
                  <input
                     type="text"
                     className="campo-controle"
                     placeholder="Ex.: 000123"
                     value={oFormulario.numDocumento}
                     onChange={(oEvento) => alteraCampo('numDocumento', oEvento.target.value)}
                  />
               </label>

               <label className="campo">
                  <span className="campo-rotulo">
                     <span className="obrigatorio">*</span>Valor do movimento
                  </span>
                  <input
                     type="text"
                     className="campo-controle campo-controle-valor"
                     placeholder="0,00"
                     value={oFormulario.sValor}
                     onChange={(oEvento) => alteraCampo('sValor', oEvento.target.value)}
                  />
               </label>
            </div>

            <label className="campo">
               <span className="campo-rotulo">
                  <span className="obrigatorio">*</span>Descrição (histórico)
               </span>
               <input
                  type="text"
                  className="campo-controle"
                  placeholder="Ex.: Transferência para cobrir folha"
                  value={oFormulario.desHistorico}
                  onChange={(oEvento) => alteraCampo('desHistorico', oEvento.target.value)}
               />
            </label>

            <label className="campo">
               <span className="campo-rotulo">Subgrupo</span>
               <select
                  className="campo-controle"
                  value={oFormulario.codSubgrupo}
                  onChange={(oEvento) => alteraCampo('codSubgrupo', oEvento.target.value)}
               >
                  <option value="">Não informado</option>
                  {subgruposFluxoCaixa.map((oSubgrupo) => (
                     <option key={oSubgrupo.codSubgrupo} value={oSubgrupo.codSubgrupo}>
                        {oSubgrupo.codSubgrupo} — {oSubgrupo.desSubgrupo}
                     </option>
                  ))}
               </select>
            </label>
         </div>

         <div className="alerta alerta-info" style={{ marginTop: 12 }}>
            Serão gerados <strong>dois lançamentos</strong> de {formataMoeda(nValorInformado)}: saída em{' '}
            <strong>{oContaSaida ? descreveConta(oContaSaida) : 'conta de origem'}</strong> e entrada em{' '}
            <strong>{oContaEntrada ? descreveConta(oContaEntrada) : 'conta de destino'}</strong>. Excluir
            um deles remove o par inteiro.
         </div>
      </Modal>
   );
} // ModalTransferencia
