'use client';
// ============================================================================
// ModalNovoLancamento.jsx - Caixa de inclusão de lançamento bancário
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Atende a ação 1 do menu do botão direito (item 6.1.3.8): "Abrir caixa para
// informar dados e gerar novo lançamento na grade de Lançamentos no Sistema".
//
// Quando aberta a partir de um movimento do banco, os campos já vêm
// preenchidos com os dados da linha, conforme previsto no documento.
// ============================================================================

import { useEffect, useState } from 'react';
import { CircleDollarSign, PlusCircle, Power } from 'lucide-react';
import { Modal } from '../comum/Modal.jsx';
import { converteTextoParaValor, formataMoeda, formataValor } from '../../utils/formatters.js';

/** Origens que o usuário pode atribuir ao lançamento */
const ORIGENS = ['Conciliação', 'Contas a Pagar', 'Contas a Receber', 'Transferência'];

/** Estado inicial do formulário */
const FORMULARIO_VAZIO = {
   datMovimento: '',
   datCompensacao: '',
   numDocumento: '',
   desHistorico: '',
   sValor: '',
   bEntrada: false,
   tipOrigem: 'Conciliação',
};

/**
 * @param {object} oPropriedades
 * @param {boolean} oPropriedades.aberto
 * @param {object|null} oPropriedades.oMovimentoBase Movimento do banco de origem
 * @param {string} oPropriedades.sDataSugerida Data usada quando não há movimento
 * @param {(dados: object) => Promise<boolean>} oPropriedades.aoConfirmar
 * @param {() => void} oPropriedades.aoFechar
 */
export function ModalNovoLancamento({ aberto, oMovimentoBase, sDataSugerida, aoConfirmar, aoFechar }) {
   const [oFormulario, setFormulario] = useState(FORMULARIO_VAZIO);
   const [bGravando, setGravando] = useState(false);
   const [sErro, setErro] = useState('');

   // Aproveita as informações da linha do banco quando existir
   useEffect(() => {
      if (!aberto) {
         return;
      }

      setErro('');

      if (oMovimentoBase) {
         setFormulario({
            datMovimento: oMovimentoBase.datMovimento,
            datCompensacao: oMovimentoBase.datMovimento,
            numDocumento: oMovimentoBase.numDocumento ?? '',
            desHistorico: oMovimentoBase.desHistorico ?? '',
            sValor: formataValor(oMovimentoBase.valMovimento),
            bEntrada: Boolean(oMovimentoBase.bEntrada),
            tipOrigem: 'Conciliação',
         });
         return;
      }

      setFormulario({ ...FORMULARIO_VAZIO, datMovimento: sDataSugerida, datCompensacao: sDataSugerida });
   }, [aberto, oMovimentoBase, sDataSugerida]);

   /**
    * Altera um campo do formulário.
    * @param {string} sCampo
    * @param {any} oValor
    */
   function alteraCampo(sCampo, oValor) {
      setFormulario((oAtual) => ({ ...oAtual, [sCampo]: oValor }));
   } // alteraCampo

   const nValorInformado = converteTextoParaValor(oFormulario.sValor);

   /** Valida os campos e dispara a inclusão. */
   async function confirma() {
      setErro('');

      // Validação na tela antes de acionar o servidor
      if (!oFormulario.datMovimento.trim()) {
         setErro('Informe a data do movimento.');
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

      setGravando(true);
      try {
         const bSucesso = await aoConfirmar({
            datMovimento: oFormulario.datMovimento.trim(),
            datCompensacao: oFormulario.datCompensacao.trim() || oFormulario.datMovimento.trim(),
            numDocumento: oFormulario.numDocumento.trim(),
            desHistorico: oFormulario.desHistorico.trim(),
            valMovimento: nValorInformado,
            bEntrada: oFormulario.bEntrada,
            tipOrigem: oFormulario.tipOrigem,
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
         titulo="Lançamento Bancário"
         icone={<CircleDollarSign size={17} />}
         largura="g"
         aoFechar={aoFechar}
         rodape={
            <>
               <button type="button" className="btn btn-primario" onClick={confirma} disabled={bGravando}>
                  <PlusCircle size={14} />
                  {bGravando ? 'Inserindo...' : 'Inserir'}
               </button>
               <button type="button" className="btn btn-neutro" onClick={aoFechar} disabled={bGravando}>
                  <Power size={14} />
                  Cancelar
               </button>
            </>
         }
      >
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
            <div className="linha-campos col-3">
               <label className="campo">
                  <span className="campo-rotulo">
                     <span className="obrigatorio">*</span>Data do movimento
                  </span>
                  <input
                     type="text"
                     className="campo-controle"
                     placeholder="DD/MM/AAAA"
                     value={oFormulario.datMovimento}
                     onChange={(oEvento) => alteraCampo('datMovimento', oEvento.target.value)}
                  />
               </label>

               <label className="campo">
                  <span className="campo-rotulo">Data de compensação</span>
                  <input
                     type="text"
                     className="campo-controle"
                     placeholder="DD/MM/AAAA"
                     value={oFormulario.datCompensacao}
                     onChange={(oEvento) => alteraCampo('datCompensacao', oEvento.target.value)}
                  />
               </label>

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
                     onChange={(oEvento) => alteraCampo('sValor', oEvento.target.value)}
                  />
               </label>

               <label className="campo">
                  <span className="campo-rotulo">Tipo do movimento</span>
                  <select
                     className="campo-controle"
                     value={oFormulario.bEntrada ? 'entrada' : 'saida'}
                     onChange={(oEvento) => alteraCampo('bEntrada', oEvento.target.value === 'entrada')}
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
                     onChange={(oEvento) => alteraCampo('tipOrigem', oEvento.target.value)}
                  >
                     {ORIGENS.map((sOrigem) => (
                        <option key={sOrigem} value={sOrigem}>
                           {sOrigem}
                        </option>
                     ))}
                  </select>
               </label>
            </div>
         </div>

         <div className="alerta alerta-info" style={{ marginTop: 12 }}>
            Será gravado como{' '}
            <strong>
               {oFormulario.bEntrada ? 'entrada' : 'saída'} de {formataMoeda(nValorInformado)}
            </strong>
            . Somente lançamentos com origem &quot;Conciliação&quot; podem ser excluídos depois.
         </div>
      </Modal>
   );
} // ModalNovoLancamento
