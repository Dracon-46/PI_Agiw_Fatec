// ============================================================================
// BancoBrasilProvider.js - Provider para o Banco do Brasil
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// API Extratos v2 — extrato de conta corrente de Pessoa Jurídica:
//
//   Token ..... POST {BB_TOKEN_URL}/oauth/token
//               (grant_type=client_credentials + Basic base64(id:secret))
//   Extrato ... GET  {BB_EXTRATO_URL}/conta-corrente/agencia/{ag}/conta/{cc}
//
// Diferente do Bradesco e do Safra, esta API pagina o resultado e devolve
// saldos e limites MISTURADOS aos lançamentos, na mesma lista: quem separa é
// o campo "indicadorTipoLancamento" (ver TIPOS_MOVIMENTO abaixo).
//
// ATENÇÃO — a API exige mTLS nos dois ambientes (os hosts têm ".mtls." no
// nome). Sem certificado de cliente a conexão é recusada antes de qualquer
// resposta HTTP; por isso o provider só se declara configurado quando o
// certificado existe em disco.
// ============================================================================

import fs from 'fs';
import https from 'https';
import path from 'path';
import { BankProvider } from './BankProvider.js';
import { separaComponentesData } from '../lib/conciliacao/valorUtils.js';

/** Caminho de geração de token (OAuth2 client_credentials) */
const TOKEN_PATH = '/oauth/token';

/** Escopo exigido pela API de extratos */
const ESCOPO_TOKEN = 'extrato-info';

/** Hosts de token, por ambiente */
const TOKEN_URL_HOMOLOGACAO = 'https://oauth.hm.bb.com.br';
const TOKEN_URL_PRODUCAO = 'https://oauth.bb.com.br';

/** Hosts do extrato, por ambiente (ambos exigem mTLS) */
const EXTRATO_URL_HOMOLOGACAO = 'https://extratos.mtls.api.hm.bb.com.br/v2';
const EXTRATO_URL_PRODUCAO = 'https://extratos.mtls.api.bb.com.br/v2';

/** Folga para renovar o token antes de expirar */
const FOLGA_RENOVACAO_MS = 60_000;

/**
 * Registros por página. A documentação aceita de 50 a 120 e manda repetir o
 * mesmo valor nas páginas seguintes — por isso é constante, e não parâmetro.
 */
const TAMANHO_PAGINA = 120;

/** Trava contra laço infinito caso a paginação venha inconsistente */
const MAX_PAGINAS = 200;

/** Período máximo aceito pela API, em dias */
export const MAX_DIAS_PERIODO = 31;

/** Quantos anos a data inicial pode retroceder */
export const MAX_ANOS_RETROATIVO = 5;

/**
 * Indicadores que representam um lançamento de verdade.
 *
 * A lista devolvida traz, além dos lançamentos, linhas de saldo e de limite
 * (SA saldo atual, SD disponível, LC limite contratado, LU utilizado, e as
 * demais) — informativas, exatamente como o grupo "saldo anterior" do
 * Bradesco. Só o tipo 1 (contabilizado) movimentou a conta: 2 (futuro) e
 * 3 (em processamento) ainda não afetaram o saldo e não podem ser conciliados.
 */
const TIPOS_MOVIMENTO = new Set(['1']);

/** Sinal que identifica crédito na conta */
const SINAL_CREDITO = 'C';

/**
 * Mantém apenas dígitos.
 * @param {string|number} sValor
 * @returns {string}
 */
function soDigitos(sValor) {
   return String(sValor ?? '').replace(/\D/g, '');
} // soDigitos

/**
 * Remove os zeros à esquerda exigido pela API ("0297" vira "297").
 * @param {string|number} sValor
 * @returns {string} String vazia quando não há dígito algum
 */
export function semZerosAEsquerda(sValor) {
   const sDigitos = soDigitos(sValor);
   if (!sDigitos) {
      return '';
   }
   const sLimpo = sDigitos.replace(/^0+/, '');
   return sLimpo || '0';
} // semZerosAEsquerda

/**
 * Converte a data da tela para o formato da API: DDMMAAAA sem zeros à esquerda.
 * @param {string} sData Aceita DD/MM/AAAA, AAAA-MM-DD, DDMMAAAA ou AAAAMMDD
 * @returns {string}
 */
export function formataDataBB(sData) {
   const oPartes = separaComponentesData(sData);
   if (!oPartes) {
      throw new Error(`Data inválida: "${sData}". Use DD/MM/AAAA.`);
   }
   return semZerosAEsquerda(`${oPartes.sDia}${oPartes.sMes}${oPartes.sAno}`);
} // formataDataBB

/**
 * Converte a data devolvida pela API (DDMMAAAA, possivelmente sem o zero
 * inicial do dia) para DD/MM/AAAA.
 *
 * "5042026" tem 7 dígitos e não passa pela leitura comum de 8; completar à
 * esquerda devolve "05042026", que já é interpretável.
 *
 * @param {string|number} sData
 * @returns {string} String vazia quando não for possível interpretar
 */
export function leDataBB(sData) {
   const sDigitos = soDigitos(sData);
   if (!sDigitos || /^0+$/.test(sDigitos)) {
      return '';
   }

   const oPartes = separaComponentesData(sDigitos.padStart(8, '0'));
   if (!oPartes) {
      return '';
   }
   return `${oPartes.sDia}/${oPartes.sMes}/${oPartes.sAno}`;
} // leDataBB

/**
 * Converte o valor devolvido pela API em número.
 *
 * A API entrega o valor com PONTO decimal e sem separador de milhar
 * ("1079.00"), como o Itaú — daí a conversão direta, sem passar pelo
 * utilitário pt-BR usado no Bradesco.
 *
 * @param {string|number|null|undefined} oValor
 * @returns {number} 0 quando o campo vem vazio ou ilegível
 */
export function leValorBB(oValor) {
   if (oValor === null || oValor === undefined || oValor === '') {
      return 0;
   }
   const nValor = Number(String(oValor).trim());
   return Number.isFinite(nValor) ? nValor : 0;
} // leValorBB

/**
 * Indica se o registro é um lançamento, e não uma linha de saldo ou limite.
 * @param {object} oLancamento
 * @returns {boolean}
 */
export function ehLancamento(oLancamento) {
   return TIPOS_MOVIMENTO.has(String(oLancamento?.indicadorTipoLancamento ?? '').trim());
} // ehLancamento

/**
 * Calcula a diferença, em dias, entre duas datas DD/MM/AAAA.
 * @param {string} sDataInicio
 * @param {string} sDataFim
 * @returns {number}
 */
function calculaDiferencaEmDias(sDataInicio, sDataFim) {
   const oIni = separaComponentesData(sDataInicio);
   const oFim = separaComponentesData(sDataFim);
   if (!oIni || !oFim) {
      return 0;
   }
   const dtIni = new Date(Number(oIni.sAno), Number(oIni.sMes) - 1, Number(oIni.sDia));
   const dtFim = new Date(Number(oFim.sAno), Number(oFim.sMes) - 1, Number(oFim.sDia));
   return Math.round((dtFim - dtIni) / 86400000);
} // calculaDiferencaEmDias

/**
 * Provider do Banco do Brasil (API Extratos v2).
 */
export class BancoBrasilProvider extends BankProvider {
   constructor() {
      super();
      this._tokenCache = null;
      this._mtlsAgent = null;
   }

   getName() {
      return 'Banco do Brasil';
   }

   getSlug() {
      return 'bb';
   }

   getColor() {
      return '#ffef00';
   }

   /**
    * Configuração lida do .env.
    * @returns {object}
    */
   getConfig() {
      const bProducao = (process.env.BB_AMBIENTE ?? 'homologacao').trim().toLowerCase() === 'producao';

      return {
         bProducao,
         sTokenUrl:
            (process.env.BB_TOKEN_URL || '').trim() ||
            (bProducao ? TOKEN_URL_PRODUCAO : TOKEN_URL_HOMOLOGACAO),
         sExtratoUrl:
            (process.env.BB_EXTRATO_URL || '').trim() ||
            (bProducao ? EXTRATO_URL_PRODUCAO : EXTRATO_URL_HOMOLOGACAO),
         sClientId: (process.env.BB_CLIENT_ID || '').trim(),
         sClientSecret: (process.env.BB_CLIENT_SECRET || '').trim(),
         // O portal entrega o Basic pronto; na falta dele, é montado do par
         sBasic: (process.env.BB_BASIC || '').trim(),
         sAppKey: (process.env.BB_APP_KEY || '').trim(),
         sAgencia: (process.env.BB_AGENCIA || '').trim(),
         sConta: (process.env.BB_CONTA || '').trim(),
         // Massa de teste de homologação (header x-br-com-bb-ipa-mciteste)
         sMciTeste: (process.env.BB_MCI_TESTE || '').trim(),
         sCertPath: (process.env.BB_CERT_PATH || '').trim(),
         sKeyPath: (process.env.BB_KEY_PATH || '').trim(),
         // Cadeia do servidor, opcional (ver _getMtlsAgent)
         sCaPath: (process.env.BB_CA_PATH || '').trim(),
      };
   }

   /**
    * Pendências que impedem a geração do token.
    *
    * Separadas das do certificado porque o host de token NÃO exige mTLS (o
    * ".mtls." aparece só no host do extrato): dá para validar as credenciais
    * mesmo antes de o certificado chegar.
    *
    * @returns {string[]}
    */
   _pendenciasCredencial() {
      const cfg = this.getConfig();
      const aPendencias = [];

      if (!cfg.sClientId && !cfg.sBasic) {
         aPendencias.push('BB_CLIENT_ID não informado no .env.');
      }
      if (!cfg.sClientSecret && !cfg.sBasic) {
         aPendencias.push('BB_CLIENT_SECRET (ou BB_BASIC) não informado no .env.');
      }
      if (!cfg.sAppKey) {
         aPendencias.push('BB_APP_KEY não informado no .env — a API exige o parâmetro gw-dev-app-key.');
      }

      return aPendencias;
   }

   /**
    * Pendências do certificado de cliente, exigido apenas no extrato.
    * @returns {string[]}
    */
   _pendenciasCertificado() {
      const cfg = this.getConfig();

      // A conexão é recusada no handshake TLS, antes de qualquer HTTP: sem o
      // certificado não há sequer mensagem de erro da API para exibir
      if (!cfg.sCertPath || !cfg.sKeyPath) {
         return [
            'A API de extrato do Banco do Brasil exige certificado de cliente (mTLS). ' +
               'Preencha BB_CERT_PATH e BB_KEY_PATH no .env.',
         ];
      }
      if (!fs.existsSync(path.resolve(cfg.sCertPath)) || !fs.existsSync(path.resolve(cfg.sKeyPath))) {
         return [
            `Certificado mTLS do Banco do Brasil não encontrado em "${cfg.sCertPath}" / "${cfg.sKeyPath}".`,
         ];
      }

      return [];
   }

   /**
    * Relaciona as pendências de configuração antes de qualquer chamada externa.
    * @returns {string[]} Lista vazia quando está tudo pronto
    */
   verificaConfiguracao() {
      return [...this._pendenciasCredencial(), ...this._pendenciasCertificado()];
   }

   isConfigured() {
      return this.verificaConfiguracao().length === 0;
   }

   // ───────── mTLS ─────────

   /**
    * Monta (uma vez) o agente HTTPS com o certificado de cliente.
    * @returns {import('https').Agent}
    */
   _getMtlsAgent() {
      if (this._mtlsAgent) {
         return this._mtlsAgent;
      }

      const cfg = this.getConfig();
      const aPendencias = this._pendenciasCertificado();
      if (aPendencias.length > 0) {
         throw new Error(`Integração Banco do Brasil incompleta: ${aPendencias.join(' ')}`);
      }

      const oOpcoes = {
         cert: fs.readFileSync(path.resolve(cfg.sCertPath)),
         key: fs.readFileSync(path.resolve(cfg.sKeyPath)),
         keepAlive: true,
         rejectUnauthorized: true,
         // Os endpoints do BB recusam qualquer coisa abaixo de TLS 1.2 —
         // é a primeira causa de handshake_failure listada na documentação
         minVersion: 'TLSv1.2',
      };

      // Cadeia do SERVIDOR do BB (DigiCert Global Root G2 + GeoTrust TLS RSA
      // CA G1). Só é necessária quando o Node não confia na cadeia por conta
      // própria; não substitui o certificado de cliente acima, que é o que
      // autentica a aplicação.
      if (cfg.sCaPath && fs.existsSync(path.resolve(cfg.sCaPath))) {
         oOpcoes.ca = fs.readFileSync(path.resolve(cfg.sCaPath));
      }

      this._mtlsAgent = new https.Agent(oOpcoes);

      return this._mtlsAgent;
   }

   // ───────── HTTP ─────────

   /**
    * Executa uma requisição HTTPS devolvendo status e corpo já convertido.
    * @param {string} sUrl
    * @param {object} oOpcoes Opções nativas de https.request
    * @param {string} [sBody]
    * @returns {Promise<{ nStatus: number, oCorpo: object, sTexto: string }>}
    */
   _requisicaoHttps(sUrl, oOpcoes, sBody) {
      return new Promise((resolve, reject) => {
         const oUrl = new URL(sUrl);
         const oReq = https.request(
            {
               ...oOpcoes,
               hostname: oUrl.hostname,
               port: oUrl.port || 443,
               path: oUrl.pathname + oUrl.search,
            },
            (oRes) => {
               let sData = '';
               oRes.on('data', (oChunk) => {
                  sData += oChunk;
               });
               oRes.on('end', () => {
                  const nStatus = oRes.statusCode ?? 0;
                  try {
                     resolve({ nStatus, oCorpo: sData ? JSON.parse(sData) : {}, sTexto: sData });
                  } catch {
                     resolve({ nStatus, oCorpo: {}, sTexto: sData });
                  }
               });
            }
         );
         oReq.on('error', reject);
         if (sBody) {
            oReq.write(sBody);
         }
         oReq.end();
      });
   }

   // ───────── Autenticação ─────────

   /**
    * Obtém o access token (OAuth 2.0 client_credentials).
    * @returns {Promise<string>}
    */
   async authenticate() {
      const cfg = this.getConfig();
      const iAgora = Date.now();

      if (this._tokenCache && this._tokenCache.nExpiraEm > iAgora + FOLGA_RENOVACAO_MS) {
         return this._tokenCache.sAccessToken;
      }

      const aPendencias = this._pendenciasCredencial();
      if (aPendencias.length > 0) {
         throw new Error(`Integração Banco do Brasil incompleta: ${aPendencias.join(' ')}`);
      }

      const sBasic =
         cfg.sBasic || Buffer.from(`${cfg.sClientId}:${cfg.sClientSecret}`).toString('base64');

      const sBody = new URLSearchParams({
         grant_type: 'client_credentials',
         scope: ESCOPO_TOKEN,
      }).toString();

      const { nStatus, oCorpo, sTexto } = await this._requisicaoHttps(
         `${cfg.sTokenUrl}${TOKEN_PATH}`,
         {
            method: 'POST',
            headers: {
               Authorization: `Basic ${sBasic}`,
               'Content-Type': 'application/x-www-form-urlencoded',
               'Content-Length': Buffer.byteLength(sBody),
            },
         },
         sBody
      );

      if (nStatus !== 200 || !oCorpo.access_token) {
         throw new Error(
            `Falha na autenticação do Banco do Brasil (HTTP ${nStatus}): ` +
               `${oCorpo.error_description || oCorpo.error || sTexto || 'resposta sem access_token'}`
         );
      }

      // expires_in vem em segundos; sem ele, assume os 10 minutos usuais
      const iValidadeMs = Number(oCorpo.expires_in ?? 600) * 1000;
      this._tokenCache = {
         sAccessToken: oCorpo.access_token,
         nExpiraEm: iAgora + iValidadeMs,
      };

      return oCorpo.access_token;
   }

   // ───────── Extrato ─────────

   /**
    * Resolve agência e conta, no formato exigido pela API (sem DV e sem zeros
    * à esquerda). A conta selecionada na tela tem precedência sobre o .env.
    *
    * @param {object|null} oConta
    * @returns {{ sAgencia: string, sConta: string }}
    */
   _resolveIdentificacao(oConta) {
      const cfg = this.getConfig();

      // A conta cadastrada costuma trazer o DV ("1348-5"): a API o rejeita
      const sContaCadastro = String(oConta?.numContaCorrente ?? '').split('-')[0];

      const sAgencia = semZerosAEsquerda(oConta?.codAgencia || cfg.sAgencia);
      const sConta = semZerosAEsquerda(sContaCadastro || cfg.sConta);

      if (!sAgencia || !sConta) {
         throw new Error(
            'Agência e conta do Banco do Brasil não informadas. ' +
               'Cadastre a conta na tela inicial ou preencha BB_AGENCIA e BB_CONTA no .env.'
         );
      }

      return { sAgencia, sConta };
   }

   /**
    * Verifica se a conta informada tem agência e conta utilizáveis.
    * @param {object|null} oConta
    * @returns {string[]}
    */
   verificaConta(oConta) {
      try {
         this._resolveIdentificacao(oConta);
         return [];
      } catch (oErro) {
         return [oErro.message];
      }
   }

   /**
    * Valida o período contra os limites documentados da API.
    * @param {string} sDataInicio DD/MM/AAAA
    * @param {string} sDataFim DD/MM/AAAA
    */
   _validaPeriodo(sDataInicio, sDataFim) {
      const iDias = calculaDiferencaEmDias(sDataInicio, sDataFim);

      if (iDias < 0) {
         throw new Error(
            `Período invertido: a data inicial (${sDataInicio}) é posterior à final (${sDataFim}).`
         );
      }
      if (iDias > MAX_DIAS_PERIODO) {
         throw new Error(
            `O Banco do Brasil aceita no máximo ${MAX_DIAS_PERIODO} dias por consulta, e o período ` +
               `informado tem ${iDias}. Reduza o intervalo — normalmente um mês por vez.`
         );
      }

      const iDiasRetroativo = calculaDiferencaEmDias(sDataInicio, this._hojeBr());
      if (iDiasRetroativo > MAX_ANOS_RETROATIVO * 366) {
         throw new Error(
            `O Banco do Brasil só devolve extrato dos últimos ${MAX_ANOS_RETROATIVO} anos, e ` +
               `${sDataInicio} está fora dessa janela.`
         );
      }
   }

   /**
    * Data do dia em DD/MM/AAAA.
    * @returns {string}
    */
   _hojeBr() {
      const dtHoje = new Date();
      const sDia = String(dtHoje.getDate()).padStart(2, '0');
      const sMes = String(dtHoje.getMonth() + 1).padStart(2, '0');
      return `${sDia}/${sMes}/${dtHoje.getFullYear()}`;
   }

   /**
    * Consulta uma página do extrato.
    * @param {object} oParametros
    * @returns {Promise<object>} Corpo da resposta
    */
   async _consultaPagina({ sAgencia, sConta, sDataInicio, sDataFim, iPagina }) {
      const cfg = this.getConfig();
      const sToken = await this.authenticate();

      const oQuery = new URLSearchParams({
         'gw-dev-app-key': cfg.sAppKey,
         dataInicioSolicitacao: formataDataBB(sDataInicio),
         dataFimSolicitacao: formataDataBB(sDataFim),
         numeroPaginaSolicitacao: String(iPagina),
         quantidadeRegistroPaginaSolicitacao: String(TAMANHO_PAGINA),
      });

      const oHeaders = {
         Authorization: `Bearer ${sToken}`,
         'Content-Type': 'application/json',
         Accept: 'application/json',
      };

      // Header exclusivo de homologação, para selecionar a massa de teste
      if (!cfg.bProducao && cfg.sMciTeste) {
         oHeaders['x-br-com-bb-ipa-mciteste'] = cfg.sMciTeste;
      }

      const sUrl =
         `${cfg.sExtratoUrl}/conta-corrente/agencia/${sAgencia}/conta/${sConta}?${oQuery.toString()}`;

      const { nStatus, oCorpo, sTexto } = await this._requisicaoHttps(sUrl, {
         method: 'GET',
         headers: oHeaders,
         agent: this._getMtlsAgent(),
      });

      // A documentação usa 404 tanto para conta inexistente quanto para
      // "sem lançamentos no período" — o segundo caso não é erro
      if (nStatus === 404) {
         return { listaLancamento: [], numeroPaginaProximo: 0 };
      }

      if (nStatus !== 200) {
         const sDetalhe =
            oCorpo?.erros?.[0]?.mensagem ||
            oCorpo?.message ||
            oCorpo?.erro ||
            sTexto ||
            'sem detalhe na resposta';
         throw new Error(`Erro da API Banco do Brasil (HTTP ${nStatus}): ${sDetalhe}`);
      }

      return oCorpo;
   }

   /**
    * Busca o extrato do período, percorrendo todas as páginas.
    * @param {string} dataInicio DD/MM/AAAA
    * @param {string} dataFim DD/MM/AAAA
    * @param {object|null} oConta Conta selecionada na tela
    * @returns {Promise<Array<object>>} Movimentos normalizados
    */
   async fetchExtrato(dataInicio, dataFim, oConta = null) {
      const { sAgencia, sConta } = this._resolveIdentificacao(oConta);
      this._validaPeriodo(dataInicio, dataFim);

      const aLancamentos = [];
      let iPagina = 1;

      for (let iVolta = 0; iVolta < MAX_PAGINAS; iVolta += 1) {
         const oCorpo = await this._consultaPagina({
            sAgencia,
            sConta,
            sDataInicio: dataInicio,
            sDataFim: dataFim,
            iPagina,
         });

         const aPagina = Array.isArray(oCorpo.listaLancamento) ? oCorpo.listaLancamento : [];
         aLancamentos.push(...aPagina);

         // numeroPaginaProximo = 0 marca a última página
         const iProxima = Number(oCorpo.numeroPaginaProximo ?? 0);
         if (!iProxima || iProxima === iPagina) {
            break;
         }
         iPagina = iProxima;
      }

      return this._normalizaMovimentos(aLancamentos);
   }

   // ───────── Normalização ─────────

   /**
    * Monta o histórico exibido na grade.
    *
    * "textoDescricaoHistorico" traz a natureza do lançamento ("Pix - Recebido")
    * e "textoInformacaoComplementar" o que identifica a contraparte — juntos
    * formam a linha que o usuário reconhece ao conferir.
    *
    * @param {object} oLancamento
    * @returns {string}
    */
   _montaHistorico(oLancamento) {
      const sDescricao = String(oLancamento.textoDescricaoHistorico ?? '').trim();
      const sComplemento = String(oLancamento.textoInformacaoComplementar ?? '').trim();

      const aPartes = [sDescricao || 'Movimento bancário'];
      if (sComplemento && sComplemento !== sDescricao) {
         aPartes.push(sComplemento);
      }

      return aPartes.join(' - ');
   }

   /**
    * Converte os lançamentos da API no formato comum aos providers.
    *
    * Saldos e limites são descartados aqui (ver TIPOS_MOVIMENTO): eles vêm na
    * mesma lista dos lançamentos e, se entrassem na grade, seriam contados
    * como movimento na somatória.
    *
    * @param {Array<object>} aLancamentos
    * @returns {Array<object>}
    */
   _normalizaMovimentos(aLancamentos) {
      return aLancamentos
         .filter((oLancamento) => ehLancamento(oLancamento))
         .map((oLancamento) => {
            const nValor = Math.abs(leValorBB(oLancamento.valorLancamento));
            const bEntrada =
               String(oLancamento.indicadorSinalLancamento ?? '').trim().toUpperCase() === SINAL_CREDITO;

            // dataMovimento só vem preenchida em lançamento retroativo; a data
            // que vale para a conciliação é a do lançamento na conta
            const sData = leDataBB(oLancamento.dataLancamento) || leDataBB(oLancamento.dataMovimento);

            return {
               datMovimento: sData,
               desHistorico: this._montaHistorico(oLancamento),
               numDocumento: String(oLancamento.numeroDocumento ?? ''),
               codigoLancamento: String(oLancamento.codigoHistorico ?? ''),
               valEntrada: bEntrada ? nValor : null,
               valSaida: bEntrada ? null : nValor,
               // Identificador único da transação (v2). É o que distingue dois
               // lançamentos de mesmo dia, valor e histórico.
               idTransacao: String(oLancamento.TextoIdentificadorUnicoTransacao ?? '').trim(),
               staConciliado: false,
            };
         })
         .filter((oMovimento) => Boolean(oMovimento.datMovimento) && (oMovimento.valEntrada || oMovimento.valSaida));
   }

   clearCache() {
      this._tokenCache = null;
      this._mtlsAgent = null;
   }
}
