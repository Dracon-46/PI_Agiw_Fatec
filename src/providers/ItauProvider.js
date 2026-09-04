// ============================================================================
// ItauProvider.js - Provider para o Banco Itaú
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Baseado na collection "itau-ep9-api-extrato-v1-externo" (API Boletos —
// Extrato Boleto Cobrança) do Itaú for Developers:
//
//   Token (sandbox) ... POST {ITAU_SANDBOX_URL}/api/oauth/jwt
//                       (grant_type=client_credentials + client_id + secret)
//   Posições .......... GET  /francesas?agencia&conta&dac&mesReferencia
//   Movimentações ..... GET  /francesas/{francesaId}/movimentacoes?data
//   Resumo ............ GET  /francesas/{francesaId}/movimentacoes-resumidas?data
//
// A "francesa" é a posição DIÁRIA da carteira de cobrança. Diferente do
// Bradesco e do Safra, esta API não aceita um período: cada consulta devolve um
// único dia. Por isso fetchExtrato() primeiro descobre em /francesas quais dias
// têm posição dentro do período e depois percorre um a um.
//
// ATENÇÃO — escopo desta API: é o extrato da COBRANÇA, não o da conta corrente.
// Aparecem aqui apenas eventos de títulos (entradas na carteira, liquidações e
// baixas). TED, PIX, tarifas avulsas e pagamentos a fornecedores não transitam
// por ela; para esses movimentos o Itaú publica um produto de Conta Corrente
// separado, ainda não contratado. É a mesma limitação registrada para o Safra
// em docs/SOLICITACAO-EXTRATO-SAFRA.md.
// ============================================================================

import { BankProvider } from './BankProvider.js';
import { separaComponentesData } from '../lib/conciliacao/valorUtils.js';

/** Geração de token do sandbox (item "Recupera token de acesso ao sandbox") */
const TOKEN_PATH = '/api/oauth/jwt';

/** Raiz dos recursos de francesa */
const FRANCESAS_PATH = '/francesas';

/** Endereço de produção (variável "baseUrl" da collection, já resolvida) */
const BASE_URL_PRODUCAO = 'https://boleto.api.itau.com/extrato/v1';

/** Host do sandbox (variável "sandboxBaseUrl" da collection) */
const SANDBOX_HOST = 'https://sandbox.devportal.itau.com.br';

/** Caminho da API no sandbox (variável "apiName" da collection) */
const SANDBOX_API_NAME = 'itau-ep9-api-extrato-v1-externo/v1';

/**
 * Folga para renovar o token antes de expirar.
 *
 * O token do sandbox vale 5 minutos (documentação do portal), bem menos que a
 * hora usual dos outros bancos — daí a folga curta.
 */
const FOLGA_RENOVACAO_MS = 30_000;

/** Registros por página em /movimentacoes */
const TAMANHO_PAGINA = 100;

/** Trava contra laço infinito caso a paginação venha inconsistente */
const MAX_PAGINAS = 200;

/**
 * Máximo de dias com posição consultados em uma importação.
 *
 * Cada dia é uma chamada à API; sem um teto, um período de anos dispararia
 * centenas de requisições contra o gateway do banco.
 */
const MAX_DIAS_POSICAO = 62;

/**
 * Tipos de movimentação previstos no parâmetro "tipoMovimentacao".
 * @readonly
 */
export const TIPO_ENTRADAS = 'entradas';
export const TIPO_LIQUIDACOES = 'liquidacoes';
export const TIPO_BAIXAS = 'baixas';

/**
 * Códigos de "codigoStatus" que identificam movimentos que NÃO são liquidação.
 *
 * As respostas reais do gateway não trazem o campo "tipoMovimentacao" descrito
 * na documentação — só "codigoStatus" ("E" nos exemplos de entrada, "L" nas
 * liquidações). "B" para baixa é dedução pela mesma lógica, ainda não observada
 * em resposta real. A lista serve para descartar o que se identifica como outro
 * tipo, e não para exigir um código conhecido: o filtro é feito pelo servidor, e
 * uma lista de permitidos descartaria movimentos válidos com código novo.
 */
const STATUS_NAO_LIQUIDACAO = new Set(['E', 'B']);

/**
 * Mantém apenas dígitos — agência, conta e DAC trafegam como números na API.
 * @param {string|number} sValor
 * @returns {string}
 */
function soDigitos(sValor) {
   return String(sValor ?? '').replace(/\D/g, '');
} // soDigitos

/**
 * Converte a data da tela para AAAA-MM-DD, formato aceito pela API do Itaú.
 * @param {string} sData Aceita DD/MM/AAAA, AAAA-MM-DD, DDMMAAAA ou AAAAMMDD
 * @returns {string}
 */
export function formataDataItau(sData) {
   const oPartes = separaComponentesData(sData);
   if (!oPartes) {
      throw new Error(`Data inválida: "${sData}". Use DD/MM/AAAA.`);
   }
   return `${oPartes.sAno}-${oPartes.sMes}-${oPartes.sDia}`;
} // formataDataItau

/**
 * Relaciona os meses de referência (MMAAAA) que cobrem o período.
 *
 * /francesas consulta um mês por vez, então um período que atravessa a virada
 * do mês exige uma chamada para cada mês envolvido.
 *
 * @param {string} sDataInicioIso AAAA-MM-DD
 * @param {string} sDataFimIso AAAA-MM-DD
 * @returns {string[]} Meses no formato MMAAAA, em ordem cronológica
 */
export function listaMesesReferencia(sDataInicioIso, sDataFimIso) {
   const [nAnoIni, nMesIni] = sDataInicioIso.split('-').map(Number);
   const [nAnoFim, nMesFim] = sDataFimIso.split('-').map(Number);

   const aMeses = [];
   let nAno = nAnoIni;
   let nMes = nMesIni;

   // Percorre mês a mês somando 1 e virando o ano quando passa de dezembro
   while (nAno < nAnoFim || (nAno === nAnoFim && nMes <= nMesFim)) {
      aMeses.push(`${String(nMes).padStart(2, '0')}${nAno}`);
      nMes += 1;
      if (nMes > 12) {
         nMes = 1;
         nAno += 1;
      }
   }

   return aMeses;
} // listaMesesReferencia

/**
 * Indica se a movimentação é uma liquidação — o único evento da francesa que
 * credita a conta corrente.
 *
 * A conferência é feita no cliente porque o gateway não é confiável nesse
 * ponto: o sandbox devolve os mesmos registros para tipoMovimentacao=entradas e
 * =liquidacoes, ou seja, o filtro pedido na URL pode simplesmente ser ignorado.
 *
 * @param {object} oMov Movimentação bruta da API
 * @returns {boolean}
 */
export function ehLiquidacao(oMov) {
   const sTipo = String(oMov?.tipoMovimentacao ?? '').trim().toLowerCase();
   if (sTipo) {
      return sTipo === TIPO_LIQUIDACOES;
   }

   // Sem o tipo declarado, o codigoStatus é o que resta
   const sStatus = String(oMov?.codigoStatus ?? '').trim().toUpperCase();
   return !STATUS_NAO_LIQUIDACAO.has(sStatus);
} // ehLiquidacao

/**
 * Extrai a data de uma posição devolvida por /francesas.
 *
 * O gateway aninha o campo em "posicao" ({ posicao: { dataPosicao } }), embora
 * os exemplos da collection o mostrem no nível de cima ({ posicao: null,
 * dataPosicao }). Os dois formatos são aceitos para que a integração não quebre
 * quando o contrato for corrigido de um lado ou do outro.
 *
 * @param {object} oPosicao
 * @returns {string} AAAA-MM-DD, ou string vazia quando ausente
 */
export function leDataPosicao(oPosicao) {
   const sData = oPosicao?.posicao?.dataPosicao ?? oPosicao?.dataPosicao ?? '';
   return String(sData).slice(0, 10);
} // leDataPosicao

/**
 * Converte um valor monetário devolvido pelo Itaú em número.
 *
 * A API entrega os valores como texto com PONTO decimal e sem separador de
 * milhar ("128847.13", "-4.23"). Por isso a conversão é direta, sem passar por
 * limpaSeparadores(): aquele utilitário atende ao formato pt-BR do Bradesco e
 * trataria "1234.567" como separador de milhar, multiplicando o valor por mil.
 *
 * @param {string|number|null|undefined} oValor
 * @returns {number} 0 quando o campo vem vazio ou ilegível
 */
export function leValorItau(oValor) {
   if (oValor === null || oValor === undefined || oValor === '') {
      return 0;
   }
   const nValor = Number(String(oValor).trim());
   return Number.isFinite(nValor) ? nValor : 0;
} // leValorItau

/**
 * Provider do Banco Itaú (API Boletos — Extrato Boleto Cobrança).
 */
export class ItauProvider extends BankProvider {
   constructor() {
      super();
      this._tokenCache = null;
   }

   getName() {
      return 'Banco Itaú';
   }

   getSlug() {
      return 'itau';
   }

   getColor() {
      // Mesmo laranja cadastrado em database/schema.sql para o banco 341
      return '#ec7000';
   }

   getConfig() {
      const leEnv = (...aChaves) => {
         for (const sChave of aChaves) {
            const sValor = process.env[sChave];
            if (sValor && sValor.trim()) {
               return sValor.trim();
            }
         }
         return '';
      };

      // O .env recebido do portal traz "base_path" e "sandbox_path"; os nomes
      // ITAU_* são os preferidos e têm precedência quando informados.
      const sUrlProducao = leEnv('ITAU_BASE_URL', 'base_path') || BASE_URL_PRODUCAO;
      const sUrlSandbox =
         leEnv('ITAU_SANDBOX_URL', 'sandbox_path') || `${SANDBOX_HOST}/${SANDBOX_API_NAME}`;

      const bSandbox = leEnv('ITAU_AMBIENTE').toLowerCase() !== 'producao';

      // ITAU_API_URL, quando preenchido, vence a escolha por ambiente
      const sApiUrl = leEnv('ITAU_API_URL') || (bSandbox ? sUrlSandbox : sUrlProducao);

      // O token do sandbox mora no host do portal, fora do caminho da API;
      // em produção o próprio gateway responde pela geração.
      const sTokenUrl = leEnv('ITAU_TOKEN_URL') || `${bSandbox ? SANDBOX_HOST : sApiUrl}${TOKEN_PATH}`;

      const sClientId = leEnv('ITAU_CLIENT_ID');

      return {
         bSandbox,
         sApiUrl,
         sTokenUrl,
         sClientId,
         sClientSecret: leEnv('ITAU_CLIENT_SECRET'),
         // O gateway identifica a aplicação por x-itau-apikey. Quando não há uma
         // chave própria, o client_id cumpre esse papel no sandbox.
         sApiKey: leEnv('ITAU_API_KEY') || sClientId,
         sAgencia: leEnv('ITAU_AGENCIA'),
         sConta: leEnv('ITAU_CONTA'),
         sDac: leEnv('ITAU_DAC'),
         sFrancesasUrl: `${sApiUrl}${FRANCESAS_PATH}`,
      };
   }

   isConfigured() {
      return this.verificaConfiguracao().length === 0;
   }

   /**
    * Relaciona as pendências de configuração antes de qualquer chamada externa.
    * @returns {string[]} Lista vazia quando está tudo pronto
    */
   verificaConfiguracao() {
      const cfg = this.getConfig();
      const aPendencias = [];

      if (!cfg.sClientId) {
         aPendencias.push('ITAU_CLIENT_ID não informado no .env.');
      }
      if (!cfg.sClientSecret) {
         aPendencias.push('ITAU_CLIENT_SECRET não informado no .env.');
      }
      if (!cfg.sApiUrl) {
         aPendencias.push('ITAU_API_URL / sandbox_path não informado no .env.');
      }

      return aPendencias;
   }

   /**
    * Verifica se a conta informada tem o que a API exige para ser consultada.
    *
    * Agência, conta e DAC são obrigatórios em /francesas, mas podem vir do
    * cadastro da conta OU do .env — por isso a conferência é por conta, e não
    * global. Antes ela não existia: o provider se declarava configurado só com
    * as credenciais, a conta aparecia como pronta na tela inicial e o erro só
    * surgia na hora de buscar o extrato.
    *
    * @param {object|null} oConta Conta corrente cadastrada
    * @returns {string[]} Lista vazia quando a conta pode ser consultada
    */
   verificaConta(oConta) {
      try {
         this._resolveIdentificacao(oConta);
         return [];
      } catch (oErro) {
         return [oErro.message];
      }
   }

   // ───────── Autenticação ─────────

   /**
    * Obtém o access token do Itaú (OAuth 2.0 client_credentials).
    *
    * No sandbox basta o par client_id/client_secret. Em produção o fluxo exige
    * private_key_jwt + mTLS (certificado assinado pelo Itaú); quando o projeto
    * chegar lá, é aqui que a assinatura entra — a interface pública do provider
    * não muda.
    *
    * @returns {Promise<string>} Access token
    */
   async authenticate() {
      const aPendencias = this.verificaConfiguracao();
      if (aPendencias.length > 0) {
         throw new Error(`Itaú não configurado: ${aPendencias.join(' ')}`);
      }

      const cfg = this.getConfig();
      const nAgora = Date.now();

      // Reaproveita o token enquanto houver folga na validade
      if (this._tokenCache && this._tokenCache.nExpiraEm > nAgora + FOLGA_RENOVACAO_MS) {
         return this._tokenCache.sAccessToken;
      }

      const sBody = new URLSearchParams({
         grant_type: 'client_credentials',
         client_id: cfg.sClientId,
         client_secret: cfg.sClientSecret,
      }).toString();

      let oResposta;
      try {
         oResposta = await fetch(cfg.sTokenUrl, {
            method: 'POST',
            headers: {
               'Content-Type': 'application/x-www-form-urlencoded',
               Accept: 'application/json',
            },
            body: sBody,
         });
      } catch (oErro) {
         throw new Error(
            `Não foi possível alcançar o gateway do Itaú (${cfg.sTokenUrl}): ${oErro.message}`
         );
      }

      const { oCorpo, sTexto } = await this._leCorpo(oResposta);

      if (!oResposta.ok || !oCorpo.access_token) {
         this._tokenCache = null;
         throw new Error(
            `Token Itaú não obtido (Status ${oResposta.status}): ` +
               `${this._extraiMensagemErro(oCorpo, sTexto)}`
         );
      }

      this._tokenCache = {
         sAccessToken: oCorpo.access_token,
         // O sandbox devolve tokens de 5 minutos; expires_in é a fonte da verdade
         nExpiraEm: nAgora + Number(oCorpo.expires_in ?? 300) * 1000,
      };

      return oCorpo.access_token;
   }

   // ───────── Chamada autenticada ─────────

   /**
    * Lê o corpo da resposta tolerando 204 e payloads não-JSON.
    * @param {Response} oResposta
    * @returns {Promise<{ oCorpo: object, sTexto: string }>}
    */
   async _leCorpo(oResposta) {
      const sTexto = await oResposta.text();
      try {
         return { oCorpo: sTexto ? JSON.parse(sTexto) : {}, sTexto };
      } catch {
         return { oCorpo: {}, sTexto };
      }
   }

   /**
    * Executa uma chamada autenticada ao gateway do Itaú.
    *
    * Um 303 indica processamento assíncrono e traz o recurso final no header
    * Location; o fetch segue esse redirecionamento por conta própria.
    *
    * @param {string} sUrl Endereço completo
    * @returns {Promise<{ nStatus: number, oCorpo: object, sTexto: string }>}
    */
   async _requisita(sUrl) {
      const sToken = await this.authenticate();
      const cfg = this.getConfig();

      let oResposta;
      try {
         oResposta = await fetch(sUrl, {
            method: 'GET',
            headers: {
               Authorization: `Bearer ${sToken}`,
               Accept: 'application/json',
               // Ambos são obrigatórios em todas as rotas da API
               'x-itau-apikey': cfg.sApiKey,
               'x-itau-correlationID': crypto.randomUUID(),
            },
         });
      } catch (oErro) {
         throw new Error(`Falha de comunicação com o Itaú (${sUrl}): ${oErro.message}`);
      }

      const { oCorpo, sTexto } = await this._leCorpo(oResposta);
      return { nStatus: oResposta.status, oCorpo, sTexto };
   }

   /**
    * Formata um bloco de erro do Itaú ({ codigo, mensagem, campos }).
    * @param {object} oErro
    * @returns {string}
    */
   _formataBlocoErro(oErro) {
      const sBase = [oErro?.codigo || oErro?.code, oErro?.mensagem || oErro?.message]
         .filter(Boolean)
         .join(' - ');

      const sCampos = Array.isArray(oErro?.campos)
         ? oErro.campos
              .map((oCampo) => `${oCampo.campo}: ${oCampo.mensagem}`)
              .filter((sItem) => sItem.trim() !== ':')
              .join('; ')
         : '';

      return sCampos ? `${sBase} (${sCampos})` : sBase;
   }

   /**
    * Extrai a mensagem de erro devolvida pelo gateway.
    *
    * São dois formatos em uso: a documentação descreve a lista "messages", mas
    * o gateway responde com um objeto único em "error" — ambos com
    * "codigo"/"mensagem" em português e a lista "campos" nas validações.
    *
    * @param {object} oCorpo
    * @param {string} sTexto
    * @returns {string}
    */
   _extraiMensagemErro(oCorpo, sTexto) {
      if (Array.isArray(oCorpo?.messages) && oCorpo.messages.length > 0) {
         return oCorpo.messages
            .map((oItem) => this._formataBlocoErro(oItem))
            .filter(Boolean)
            .join(' | ');
      }

      // Objeto único em "error" — formato observado no gateway
      if (oCorpo?.error && typeof oCorpo.error === 'object') {
         const sFormatado = this._formataBlocoErro(oCorpo.error);
         // Falhas internas do gateway vêm sem codigo/mensagem (só
         // VirtualResponseCode); nesse caso o JSON cru diz mais
         return sFormatado || JSON.stringify(oCorpo.error);
      }

      return (
         oCorpo?.mensagem ||
         oCorpo?.message ||
         oCorpo?.error_description ||
         (typeof oCorpo?.error === 'string' ? oCorpo.error : '') ||
         sTexto ||
         'erro não detalhado'
      );
   }

   /**
    * Traduz os status de erro da API em mensagens acionáveis.
    * @param {number} nStatus
    * @param {object} oCorpo
    * @param {string} sTexto
    * @param {string} sOperacao Descrição da consulta, para o texto do erro
    */
   _validaStatus(nStatus, oCorpo, sTexto, sOperacao) {
      if (nStatus < 400) {
         return;
      }

      const sDetalhe = this._extraiMensagemErro(oCorpo, sTexto);
      const cfg = this.getConfig();

      // 401/403 aqui costumam ser produto não liberado para o client_id, e não
      // credencial errada: a mensagem precisa dizer o que fazer.
      if (nStatus === 401 || nStatus === 403) {
         throw new Error(
            `O Itaú recusou ${sOperacao} (${nStatus}): ${sDetalhe}. ` +
               'Confirme se a API "Extrato Boleto Cobrança" está habilitada para o client_id ' +
               `"${cfg.sClientId}" e se o escopo boletoscash-francesas.read foi concedido.`
         );
      }

      if (nStatus === 404) {
         throw new Error(
            `O Itaú não localizou ${sOperacao} (404): ${sDetalhe}. ` +
               `Confira agência, conta e DAC e o caminho da API (atual: ${cfg.sApiUrl}).`
         );
      }

      if (nStatus === 428) {
         throw new Error(
            `O Itaú exige um pré-requisito para ${sOperacao} (428): ${sDetalhe}. ` +
               'Normalmente é a consulta a /francesas antes de pedir a movimentação de um dia.'
         );
      }

      throw new Error(`Erro da API Itaú em ${sOperacao} (Status ${nStatus}): ${sDetalhe}`);
   }

   // ───────── Identificação da conta ─────────

   /**
    * Monta o identificador da francesa e valida agência, conta e DAC.
    *
    * O francesaId é a concatenação exigida pela API: 4 dígitos de agência,
    * 7 de conta e 1 de DAC. O DAC não existe como coluna em conta_corrente, por
    * isso é aceito de três formas: no próprio objeto da conta, embutido no
    * número da conta ("0001560-1" ou 8 dígitos) ou em ITAU_DAC.
    *
    * @param {{ codAgencia?: string, numContaCorrente?: string, dac?: string }|null} oConta
    * @returns {{ sAgencia: string, sConta: string, sDac: string, sFrancesaId: string }}
    */
   _resolveIdentificacao(oConta = null) {
      const cfg = this.getConfig();

      const sAgencia = soDigitos(oConta?.codAgencia || cfg.sAgencia);
      const sContaBruta = String(oConta?.numContaCorrente || cfg.sConta || '').trim();

      if (!sAgencia || !sContaBruta) {
         throw new Error(
            'Agência e conta são obrigatórias para consultar a cobrança no Itaú. ' +
               'Cadastre a conta na tela inicial ou defina ITAU_AGENCIA/ITAU_CONTA no .env.'
         );
      }

      const { sConta, sDac } = this._separaContaDac(sContaBruta, oConta?.dac || cfg.sDac);

      if (sAgencia.length > 4) {
         throw new Error(
            `Agência inválida (${sAgencia}): a API do Itaú aceita no máximo 4 dígitos.`
         );
      }
      if (sConta.length > 7) {
         throw new Error(`Conta inválida (${sConta}): a API do Itaú aceita no máximo 7 dígitos.`);
      }

      const sAgenciaApi = sAgencia.padStart(4, '0');
      const sContaApi = sConta.padStart(7, '0');

      return {
         sAgencia: sAgenciaApi,
         sConta: sContaApi,
         sDac,
         sFrancesaId: `${sAgenciaApi}${sContaApi}${sDac}`,
      };
   }

   /**
    * Separa o número da conta do seu dígito verificador (DAC).
    *
    * @param {string} sContaBruta Número da conta como cadastrado
    * @param {string} sDacInformado DAC vindo da conta ou de ITAU_DAC
    * @returns {{ sConta: string, sDac: string }}
    */
   _separaContaDac(sContaBruta, sDacInformado) {
      // O DAC informado à parte só decide o DÍGITO; o número da conta continua
      // saindo do próprio cadastro. Deixar o explícito curto-circuitar tudo
      // fazia "15386-1" com ITAU_DAC=9 virar conta 153861.
      const sDacExplicito = soDigitos(sDacInformado).slice(-1);

      // 1. Conta cadastrada com separador ("15386-1", "15386.1", "15386/1")
      const oComSeparador = /^(\d+)\s*[-./]\s*(\d)$/.exec(String(sContaBruta).trim());
      if (oComSeparador) {
         return { sConta: oComSeparador[1], sDac: sDacExplicito || oComSeparador[2] };
      }

      // 2. Oito dígitos corridos: a conta do Itaú tem no máximo 7, então o
      //    último dígito é o DAC
      const sDigitos = soDigitos(sContaBruta);
      if (sDigitos.length === 8) {
         return { sConta: sDigitos.slice(0, 7), sDac: sDacExplicito || sDigitos.slice(7) };
      }

      // 3. Conta sem dígito no cadastro: só o DAC configurado resolve
      if (sDacExplicito) {
         return { sConta: sDigitos, sDac: sDacExplicito };
      }

      throw new Error(
         `Não foi possível determinar o DAC da conta "${sContaBruta}". ` +
            'A API do Itaú exige agência (4) + conta (7) + DAC (1). ' +
            'Cadastre a conta com o dígito ("15386-1") ou defina ITAU_DAC no .env.'
      );
   }

   // ───────── Rotas da API ─────────

   /**
    * Lista as posições (dias) disponíveis para um mês de referência.
    *
    * @param {object} oParametros
    * @param {string} oParametros.sAgencia
    * @param {string} oParametros.sConta
    * @param {string} oParametros.sDac
    * @param {string} oParametros.sMesReferencia MMAAAA
    * @returns {Promise<Array<{ dataPosicao: string, posicao: * }>>}
    */
   async listaPosicoes({ sAgencia, sConta, sDac, sMesReferencia }) {
      const cfg = this.getConfig();

      const oParams = new URLSearchParams({
         agencia: sAgencia,
         conta: sConta,
         dac: sDac,
         mesReferencia: sMesReferencia,
      });

      const { nStatus, oCorpo, sTexto } = await this._requisita(`${cfg.sFrancesasUrl}?${oParams}`);

      // 204 é resposta válida: o mês simplesmente não tem posição
      if (nStatus === 204) {
         return [];
      }

      this._validaStatus(nStatus, oCorpo, sTexto, `as posições de ${sMesReferencia}`);

      return Array.isArray(oCorpo?.data) ? oCorpo.data : [];
   }

   /**
    * Consulta as movimentações detalhadas de um dia, percorrendo a paginação.
    *
    * @param {object} oParametros
    * @param {string} oParametros.sFrancesaId
    * @param {string} oParametros.sData AAAA-MM-DD
    * @param {string} [oParametros.sTipoMovimentacao] entradas | liquidacoes | baixas
    * @param {string} [oParametros.sTipoCobranca] boleto | bolecode | boleto_descontado
    * @returns {Promise<Array<object>>} Movimentações brutas da API
    */
   async consultaMovimentacoes({ sFrancesaId, sData, sTipoMovimentacao, sTipoCobranca }) {
      const cfg = this.getConfig();
      const aMovimentacoes = [];

      let nPagina = 0;
      let nTotalPaginas = 1;

      while (nPagina < nTotalPaginas && nPagina < MAX_PAGINAS) {
         const oParams = new URLSearchParams({
            data: sData,
            page: String(nPagina),
            pageSize: String(TAMANHO_PAGINA),
         });
         if (sTipoMovimentacao) {
            oParams.set('tipoMovimentacao', sTipoMovimentacao);
         }
         if (sTipoCobranca) {
            oParams.set('tipoCobranca', sTipoCobranca);
         }

         const sUrl = `${cfg.sFrancesasUrl}/${sFrancesaId}/movimentacoes?${oParams}`;
         const { nStatus, oCorpo, sTexto } = await this._requisita(sUrl);

         // Dia sem movimentação no filtro pedido
         if (nStatus === 204) {
            break;
         }

         this._validaStatus(nStatus, oCorpo, sTexto, `as movimentações de ${sData}`);

         const aPagina = Array.isArray(oCorpo?.data) ? oCorpo.data : [];
         aMovimentacoes.push(...aPagina);

         const oPaginacao = oCorpo?.pagination;

         // Quem manda no tamanho da página é o gateway, não o pageSize pedido:
         // ele reduz o valor solicitado (pedimos 100 e recebemos 10). Por isso a
         // parada olha total_pages, e não a quantidade de registros da página —
         // comparar com TAMANHO_PAGINA encerraria o laço na primeira página
         // cheia do servidor, perdendo o restante silenciosamente.
         nTotalPaginas = Number(oPaginacao?.total_pages ?? 1) || 1;

         if (aPagina.length === 0) {
            break;
         }

         // O sandbox ignora o parâmetro "page" e devolve sempre a primeira
         // página. Sem esta checagem, um total_pages maior que 1 faria o laço
         // reler a mesma página e duplicar os movimentos.
         const nPaginaDevolvida = Number(oPaginacao?.page ?? nPagina);
         if (nPaginaDevolvida !== nPagina) {
            break;
         }

         nPagina += 1;
      }

      return aMovimentacoes;
   }

   /**
    * Consulta a posição resumida do dia (saldos da carteira, tarifas do mês).
    *
    * Não participa da conciliação — serve para conferência e para o
    * diagnóstico da integração.
    *
    * @param {object} oParametros
    * @param {string} oParametros.sFrancesaId
    * @param {string} oParametros.sData AAAA-MM-DD
    * @returns {Promise<object|null>} null quando o dia não tem posição
    */
   async consultaPosicaoResumida({ sFrancesaId, sData }) {
      const cfg = this.getConfig();
      const oParams = new URLSearchParams({ data: sData });

      const { nStatus, oCorpo, sTexto } = await this._requisita(
         `${cfg.sFrancesasUrl}/${sFrancesaId}/movimentacoes-resumidas?${oParams}`
      );

      if (nStatus === 204) {
         return null;
      }

      this._validaStatus(nStatus, oCorpo, sTexto, `o resumo de ${sData}`);

      return Array.isArray(oCorpo?.data) ? (oCorpo.data[0] ?? null) : (oCorpo?.data ?? null);
   }

   // ───────── Extrato para a conciliação ─────────

   /**
    * Busca os movimentos do período para a tela de conciliação.
    *
    * Traz apenas as LIQUIDAÇÕES. Dos três tipos de movimentação da francesa,
    * só a liquidação credita a conta corrente: "entradas" registra um título na
    * carteira e "baixas" o retira dela, sem dinheiro envolvido. Importá-las
    * como crédito criaria movimentos inexistentes no extrato e quebraria a
    * conciliação. Quem precisar da visão completa da carteira usa
    * consultaMovimentacoes() diretamente.
    *
    * @param {string} dataInicio Data inicial (DD/MM/AAAA)
    * @param {string} dataFim Data final (DD/MM/AAAA)
    * @param {{ codAgencia?: string, numContaCorrente?: string, dac?: string }|null} oConta
    * @returns {Promise<Array<object>>} Movimentos normalizados
    */
   async fetchExtrato(dataInicio, dataFim, oConta = null) {
      const oIdent = this._resolveIdentificacao(oConta);

      let sDataInicioIso;
      let sDataFimIso;
      try {
         sDataInicioIso = formataDataItau(dataInicio);
         sDataFimIso = formataDataItau(dataFim);
      } catch (oErro) {
         throw new Error(`Período inválido para a API Itaú: ${oErro.message}`);
      }

      // Datas em AAAA-MM-DD comparam corretamente como texto
      if (sDataInicioIso > sDataFimIso) {
         throw new Error(
            `Período invertido: a data inicial (${dataInicio}) é posterior à final (${dataFim}).`
         );
      }

      const aDatas = await this._listaDatasComPosicao(oIdent, sDataInicioIso, sDataFimIso);
      if (aDatas.length === 0) {
         return [];
      }

      if (aDatas.length > MAX_DIAS_POSICAO) {
         throw new Error(
            `O período informado tem ${aDatas.length} dias com posição na carteira e a API do ` +
               `Itaú consulta um dia por vez (limite de ${MAX_DIAS_POSICAO} por importação). ` +
               'Reduza o período — normalmente um mês por vez.'
         );
      }

      const aMovimentos = [];

      // Sequencial de propósito: são chamadas ao gateway do banco, e o paralelo
      // aqui só aumentaria o risco de throttling.
      for (const sData of aDatas) {
         const aBrutas = await this.consultaMovimentacoes({
            sFrancesaId: oIdent.sFrancesaId,
            sData,
            sTipoMovimentacao: TIPO_LIQUIDACOES,
         });
         aMovimentos.push(...this._normalizaMovimentos(aBrutas, sData));
      }

      return aMovimentos;
   }

   /**
    * Descobre, mês a mês, quais dias do período têm posição na carteira.
    *
    * @param {{ sAgencia: string, sConta: string, sDac: string }} oIdent
    * @param {string} sDataInicioIso AAAA-MM-DD
    * @param {string} sDataFimIso AAAA-MM-DD
    * @returns {Promise<string[]>} Datas AAAA-MM-DD, sem repetição e ordenadas
    */
   async _listaDatasComPosicao(oIdent, sDataInicioIso, sDataFimIso) {
      const oDatas = new Set();

      for (const sMesReferencia of listaMesesReferencia(sDataInicioIso, sDataFimIso)) {
         const aPosicoes = await this.listaPosicoes({
            sAgencia: oIdent.sAgencia,
            sConta: oIdent.sConta,
            sDac: oIdent.sDac,
            sMesReferencia,
         });

         for (const oPosicao of aPosicoes) {
            const sData = leDataPosicao(oPosicao);
            // O mês de referência traz o mês inteiro; o período pedido pode
            // começar ou terminar no meio dele
            if (sData >= sDataInicioIso && sData <= sDataFimIso) {
               oDatas.add(sData);
            }
         }
      }

      return [...oDatas].sort();
   }

   // ───────── Normalização ─────────

   /**
    * Monta o histórico do movimento com o que identifica o título na tela.
    * @param {object} oMov Movimentação bruta da API
    * @returns {string}
    */
   _montaHistorico(oMov) {
      const sTipoCobranca = String(oMov.tipoCobranca ?? 'Boleto').trim();
      const sPagador = String(oMov.pagador ?? '').trim();
      const sNossoNumero = String(oMov.nossoNumero ?? '').trim();

      const aPartes = [`LIQUIDACAO ${sTipoCobranca || 'BOLETO'}`.toUpperCase()];
      if (sPagador) {
         aPartes.push(sPagador);
      }
      if (sNossoNumero) {
         aPartes.push(`NN ${sNossoNumero}`);
      }

      return aPartes.join(' - ');
   }

   /**
    * Converte as movimentações da API no formato comum aos providers.
    *
    * O valor usado é "valorLiquidoLancado" — o que efetivamente foi creditado,
    * já com juros, multa e descontos aplicados. "valorTitulo" (valor de face)
    * entra apenas como reserva, quando o líquido não vem preenchido.
    *
    * As tarifas de cobrança (operacoesCobranca / operacoesDesconto) NÃO geram
    * movimentos próprios: o nome do campo indica que o líquido já está
    * descontado delas, e criar um débito adicional contaria a tarifa duas
    * vezes. Confirmar na homologação com a movimentação real da conta.
    *
    * Registros que não são liquidação são descartados aqui, e não só na URL da
    * consulta — ver ehLiquidacao().
    *
    * @param {Array<object>} aMovimentacoes
    * @param {string} sDataConsulta AAAA-MM-DD do dia consultado
    * @returns {Array<object>}
    */
   _normalizaMovimentos(aMovimentacoes, sDataConsulta) {
      const [sAno, sMes, sDia] = sDataConsulta.split('-');
      const sDataPadrao = `${sDia}/${sMes}/${sAno}`;

      return aMovimentacoes
         .filter((oMov) => ehLiquidacao(oMov))
         .map((oMov, iIndice) => {
            const nLiquido = leValorItau(oMov.valorLiquidoLancado);
            const nValor = Math.abs(nLiquido || leValorItau(oMov.valorTitulo));

            // A data que vale é a do DIA CONSULTADO: /movimentacoes?data=X
            // devolve, por definição, as movimentações de X.
            //
            // "dataMovimentacao" do registro só é usada quando coincide com o
            // dia consultado. O sandbox devolve um valor fixo (03/05/2022) para
            // qualquer data pedida, e confiar nele fazia todo movimento nascer
            // fora do período — o recorte de extratoBanco.js descartava tudo e
            // a grade ficava vazia sem erro aparente.
            const oPartes = separaComponentesData(oMov.dataMovimentacao);
            const sDataRegistro = oPartes
               ? `${oPartes.sDia}/${oPartes.sMes}/${oPartes.sAno}`
               : '';
            const sData = sDataRegistro === sDataPadrao ? sDataRegistro : sDataPadrao;

            return {
               datMovimento: sData,
               desHistorico: this._montaHistorico(oMov),
               // "seuNumero" é o número do documento no sistema da empresa, e é
               // por ele que a conciliação automática casa título e movimento
               numDocumento: String(oMov.seuNumero ?? oMov.nossoNumero ?? ''),
               codigoLancamento: String(oMov.codigoStatus ?? ''),
               // A API não expõe id de transação. Duas liquidações de mesmo
               // título, dia e valor são indistinguíveis pelos campos de
               // negócio, então a posição na resposta do dia entra na chave —
               // é o que impede que uma sobrescreva a outra ao serem gravadas.
               idTransacao: [
                  String(oMov.nossoNumero ?? ''),
                  sDataConsulta,
                  String(iIndice),
               ].join('-'),
               // Liquidação é sempre crédito; um líquido negativo indicaria
               // estorno, e aí o valor vai para a saída
               valEntrada: nLiquido < 0 ? null : nValor,
               valSaida: nLiquido < 0 ? nValor : null,
               staConciliado: false,
            };
         })
         .filter((oMov) => Boolean(oMov.datMovimento) && (oMov.valEntrada || oMov.valSaida));
   }

   clearCache() {
      this._tokenCache = null;
   }
}
