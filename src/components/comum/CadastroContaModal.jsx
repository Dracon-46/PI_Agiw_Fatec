'use client';
// ============================================================================
// CadastroContaModal.jsx - Cadastro de banco/agência/conta corrente (MySQL)
// Projeto Banco - Ticket 37060 | Agiw Sistemas
// ============================================================================

import { useState } from 'react';
import { Landmark, Plus } from 'lucide-react';
import { Modal } from './Modal.jsx';
import { useBankContext } from '../../contexts/BankContext.jsx';
import { bancosDisponiveis } from '../../utils/mockData.js';

const FORMULARIO_VAZIO = {
   slugProvider: 'bradesco',
   tipConta: 'cc',
   codAgencia: '',
   numContaCorrente: '',
   desAgencia: '',
   valSaldoSistema: '',
   datUltimoBloqueio: '',
};

/**
 * @param {object} oPropriedades
 * @param {boolean} oPropriedades.aberto
 * @param {() => void} oPropriedades.aoFechar
 * @param {(codConta: string) => void} [oPropriedades.aoCadastrar]
 */
export function CadastroContaModal({ aberto, aoFechar, aoCadastrar }) {
   const { cadastraConta } = useBankContext();
   const [oForm, setForm] = useState(FORMULARIO_VAZIO);
   const [sErro, setErro] = useState('');
   const [bSalvando, setSalvando] = useState(false);

   function alteraCampo(sCampo, sValor) {
      setForm((oAtual) => ({ ...oAtual, [sCampo]: sValor }));
      setErro('');
   } // alteraCampo

   function fecha() {
      setForm(FORMULARIO_VAZIO);
      setErro('');
      aoFechar();
   } // fecha

   async function salva() {
      setSalvando(true);
      try {
         const oResultado = await cadastraConta({
            slugProvider: oForm.slugProvider,
            tipConta: oForm.tipConta,
            codAgencia: oForm.codAgencia,
            numContaCorrente: oForm.numContaCorrente,
            desAgencia: oForm.desAgencia,
            valSaldoSistema: oForm.valSaldoSistema
               ? Number(String(oForm.valSaldoSistema).replace(/\./g, '').replace(',', '.'))
               : 0,
            datUltimoBloqueio: oForm.datUltimoBloqueio,
         });

         if (!oResultado.ok) {
            setErro(oResultado.erro);
            return;
         }

         aoCadastrar?.(oResultado.conta.codConta);
         fecha();
      } finally {
         setSalvando(false);
      }
   } // salva

   return (
      <Modal
         aberto={aberto}
         titulo="Cadastrar conta corrente"
         icone={<Landmark size={15} />}
         largura="m"
         aoFechar={fecha}
         rodapeEspacado
         rodape={
            <>
               <button type="button" className="btn btn-neutro" onClick={fecha} disabled={bSalvando}>
                  Cancelar
               </button>
               <button type="button" className="btn btn-primario" onClick={salva} disabled={bSalvando}>
                  <Plus size={14} />
                  {bSalvando ? 'Salvando...' : 'Salvar no MySQL'}
               </button>
            </>
         }
      >
         <p style={{ marginBottom: 14, fontSize: 12, color: 'var(--cor-texto-secundario)' }}>
            Os dados são gravados no MySQL (<code>conta_corrente</code>). Credenciais da API
            (client id/secret/certificado) ficam no <code>.env</code> do servidor — não no navegador.
            Para Bradesco, use agência e conta só com dígitos (ex.: agência 3750, conta 75557) e um
            período em que a conta tenha movimento real.
         </p>

         {sErro ? <div className="alerta alerta-erro" style={{ marginBottom: 12 }}>{sErro}</div> : null}

         <div className="linha-campos col-2">
            <label className="campo">
               <span className="campo-rotulo">
                  Banco <span className="obrigatorio">*</span>
               </span>
               <select
                  className="campo-controle"
                  value={oForm.slugProvider}
                  onChange={(oEvento) => alteraCampo('slugProvider', oEvento.target.value)}
               >
                  {bancosDisponiveis.map((oBanco) => (
                     <option key={oBanco.slugProvider} value={oBanco.slugProvider}>
                        {oBanco.codBanco} — {oBanco.nomBanco}
                     </option>
                  ))}
               </select>
            </label>

            <label className="campo">
               <span className="campo-rotulo">
                  Tipo <span className="obrigatorio">*</span>
               </span>
               <select
                  className="campo-controle"
                  value={oForm.tipConta}
                  onChange={(oEvento) => alteraCampo('tipConta', oEvento.target.value)}
               >
                  <option value="cc">Conta corrente (cc)</option>
                  <option value="cp">Conta poupança (cp)</option>
               </select>
            </label>

            <label className="campo">
               <span className="campo-rotulo">
                  Agência <span className="obrigatorio">*</span>
               </span>
               <input
                  type="text"
                  className="campo-controle"
                  placeholder="Ex.: 3750 (máx. 5 dígitos na API)"
                  value={oForm.codAgencia}
                  onChange={(oEvento) => alteraCampo('codAgencia', oEvento.target.value)}
                  autoComplete="off"
               />
            </label>

            <label className="campo">
               <span className="campo-rotulo">
                  Conta corrente <span className="obrigatorio">*</span>
               </span>
               <input
                  type="text"
                  className="campo-controle"
                  placeholder="Ex.: 75557 (máx. 13 dígitos na API)"
                  value={oForm.numContaCorrente}
                  onChange={(oEvento) => alteraCampo('numContaCorrente', oEvento.target.value)}
                  autoComplete="off"
               />
            </label>

            <label className="campo">
               <span className="campo-rotulo">Descrição da agência</span>
               <input
                  type="text"
                  className="campo-controle"
                  placeholder="Ex.: Agência matriz"
                  value={oForm.desAgencia}
                  onChange={(oEvento) => alteraCampo('desAgencia', oEvento.target.value)}
               />
            </label>

            <label className="campo">
               <span className="campo-rotulo">Data do último bloqueio</span>
               <input
                  type="text"
                  className="campo-controle"
                  placeholder="DD/MM/AAAA — início do período = dia seguinte"
                  value={oForm.datUltimoBloqueio}
                  onChange={(oEvento) => alteraCampo('datUltimoBloqueio', oEvento.target.value)}
               />
            </label>
         </div>
      </Modal>
   );
} // CadastroContaModal
