'use client';
// ============================================================================
// CadastroContaModal.jsx - Cadastro e edição de banco/agência/conta (MySQL)
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// A mesma caixa atende as duas operações: sem oContaEdicao ela cadastra, com
// ela altera. O catálogo de bancos vem do MySQL (tabela banco / TBGENE015) —
// antes estava fixo em utils/mockData.js, o que impedia o cliente de manter os
// próprios bancos.
// ============================================================================

import { useEffect, useState } from 'react';
import { Landmark, Plus, Save } from 'lucide-react';
import { Modal } from './Modal.jsx';
import { CampoData } from './CampoData.jsx';
import { useBankContext } from '../../contexts/BankContext.jsx';
import { buscaBancosApi } from '../../services/conciliacaoService.js';
import { formataValor } from '../../utils/formatters.js';

const FORMULARIO_VAZIO = {
   slugProvider: '',
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
 * @param {object|null} [oPropriedades.oContaEdicao] Conta a alterar; ausente cadastra
 * @param {() => void} oPropriedades.aoFechar
 * @param {(codConta: string) => void} [oPropriedades.aoGravar]
 */
export function CadastroContaModal({ aberto, oContaEdicao = null, aoFechar, aoGravar }) {
   const { cadastraConta, atualizaConta } = useBankContext();
   const [aBancos, setBancos] = useState([]);
   const [oForm, setForm] = useState(FORMULARIO_VAZIO);
   const [sErro, setErro] = useState('');
   const [bSalvando, setSalvando] = useState(false);

   const bEdicao = Boolean(oContaEdicao);

   // O catálogo é lido uma vez, na primeira abertura da caixa
   useEffect(() => {
      if (!aberto || aBancos.length > 0) {
         return;
      }

      let bAtivo = true;
      buscaBancosApi()
         .then((oRetorno) => {
            if (bAtivo) {
               setBancos(oRetorno.bancos ?? []);
            }
         })
         .catch((oErro) => {
            if (bAtivo) {
               setErro(`Não foi possível carregar o catálogo de bancos: ${oErro.message}`);
            }
         });

      return () => {
         bAtivo = false;
      };
   }, [aberto, aBancos.length]);

   // Preenche o formulário conforme a operação
   useEffect(() => {
      if (!aberto) {
         return;
      }
      setErro('');

      if (oContaEdicao) {
         setForm({
            slugProvider: oContaEdicao.slugProvider ?? '',
            tipConta: oContaEdicao.tipConta ?? 'cc',
            codAgencia: oContaEdicao.codAgencia ?? '',
            numContaCorrente: oContaEdicao.numContaCorrente ?? '',
            desAgencia: oContaEdicao.desAgencia ?? '',
            valSaldoSistema: oContaEdicao.valSaldoSistema
               ? formataValor(oContaEdicao.valSaldoSistema)
               : '',
            datUltimoBloqueio: oContaEdicao.datUltimoBloqueio ?? '',
         });
         return;
      }

      setForm({ ...FORMULARIO_VAZIO, slugProvider: aBancos[0]?.slugProvider ?? '' });
   }, [aberto, oContaEdicao, aBancos]);

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
      if (!oForm.slugProvider) {
         setErro('Selecione o banco.');
         return;
      }
      if (!oForm.codAgencia.trim() || !oForm.numContaCorrente.trim()) {
         setErro('Informe a agência e a conta corrente.');
         return;
      }

      setSalvando(true);
      try {
         const oDados = {
            slugProvider: oForm.slugProvider,
            tipConta: oForm.tipConta,
            codAgencia: oForm.codAgencia.trim(),
            numContaCorrente: oForm.numContaCorrente.trim(),
            desAgencia: oForm.desAgencia.trim(),
            valSaldoSistema: oForm.valSaldoSistema
               ? Number(String(oForm.valSaldoSistema).replace(/\./g, '').replace(',', '.'))
               : 0,
            datUltimoBloqueio: oForm.datUltimoBloqueio,
         };

         const oResultado = bEdicao
            ? await atualizaConta(oContaEdicao.codConta, oDados)
            : await cadastraConta(oDados);

         if (!oResultado.ok) {
            setErro(oResultado.erro);
            return;
         }

         aoGravar?.(oResultado.conta.codConta);
         fecha();
      } finally {
         setSalvando(false);
      }
   } // salva

   return (
      <Modal
         aberto={aberto}
         titulo={bEdicao ? 'Alterar conta corrente' : 'Cadastrar conta corrente'}
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
                  {bEdicao ? <Save size={14} /> : <Plus size={14} />}
                  {bSalvando ? 'Salvando...' : bEdicao ? 'Salvar alterações' : 'Cadastrar conta'}
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

         {bEdicao ? (
            <div className="alerta alerta-info" style={{ marginBottom: 12 }}>
               Alterar banco, agência ou C.C. muda o código da conta. O histórico de conciliação
               é preservado.
            </div>
         ) : null}

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
                  <option value="">Selecione o banco</option>
                  {aBancos.map((oBanco) => (
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

            <CampoData
               rotulo="Data do último bloqueio"
               valor={oForm.datUltimoBloqueio}
               aoAlterar={(sData) => alteraCampo('datUltimoBloqueio', sData)}
               titulo="O período da tela de conciliação começa no dia seguinte a esta data"
            />
         </div>
      </Modal>
   );
} // CadastroContaModal
