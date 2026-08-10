// BradescoProvider.js - Provider concreto para o Bradesco
// Ticket 37060 - Refatoração Strategy/Factory
//
// API: fornecimento-extratos-contas
// Parâmetros: agencia, conta, tipo (cc|cp), dataInicio/dataFim em DDMMAAAA

import fs from 'fs';
import https from 'https';
import path from 'path';
import { BankProvider } from './BankProvider.js';
import {
  formataDataBradescoParaDDMMAAAA,
  limpaSeparadores,
  normalizaDataExibicao,
} from '../lib/conciliacao/valorUtils.js';

/** Códigos de retorno que indicam consulta bem-sucedida */
const CODIGOS_RETORNO_OK = new Set(['', '0', '00', '000']);

/** Nome do grupo de lançamentos que traz o saldo anterior, não um movimento */
const GRUPO_SALDO_ANTERIOR = 'saldo anterior';

// Caminho do token. O ambiente de sandbox (openapisandbox.prebanco.com.br)
// responde 401 "SSL with client authentication is required" neste endpoint e
// 404 em todos os demais: o certificado de cliente é obrigatório, não opcional.
const TOKEN_PATH_MTLS = '/auth/server-mtls/v2/token';

/**
 * Mantém apenas dígitos (agência/conta da API Bradesco são inteiros).
 * @param {string|number} sValor
 * @returns {string}
 */
function soDigitos(sValor) {
  return String(sValor ?? '').replace(/\D/g, '');
}

/**
 * Provider para integração com o Bradesco via OAuth2 + mTLS.
 */
export class BradescoProvider extends BankProvider {
  constructor() {
    super();
    this._tokenCache = null;
    this._mtlsAgent = null;
  }

  getName() {
    return 'Bradesco';
  }

  getSlug() {
    return 'bradesco';
  }

  getColor() {
    return '#cc092f';
  }

  getConfig() {
    const leEnv = (...chaves) => {
      for (const chave of chaves) {
        const valor = process.env[chave];
        if (valor && valor.trim()) return valor.trim();
      }
      return '';
    };

    const sClientId = leEnv('BRADESCO_CLIENT_ID', 'bradesco_Client_Id');
    const sClientSecret = leEnv('BRADESCO_CLIENT_SECRET', 'bradesco_Client_Secret');
    const sAppKey = leEnv('BRADESCO_APP_KEY', 'bradesco_App_Key');
    const sAgencia = leEnv('BRADESCO_AGENCIA', 'bradesco_Agencia');
    const sConta = leEnv('BRADESCO_CONTA', 'bradesco_Conta');
    const sCertPath = leEnv('BRADESCO_CERT_PATH', 'bradesco_Cert_Path');
    const sKeyPath = leEnv('BRADESCO_KEY_PATH', 'bradesco_Key_Path');
    const sBaseUrl = leEnv('BRADESCO_BASE_URL', 'bradesco_Base_Url') || 'https://apihom-bradescorip.bradesco.com.br';
    const sApiUrl = leEnv('BRADESCO_API_URL', 'bradesco_Api_Url') || `${sBaseUrl}/v1/fornecimento-extratos-contas`;
    const sFiltroSinal = leEnv('BRADESCO_FILTRO_SINAL', 'bradesco_Filtro_Sinal');
    const sTokenPath = leEnv('BRADESCO_TOKEN_PATH');

    // Indica se os arquivos de certificado estão realmente disponíveis
    const bUsaMtls = Boolean(
      sCertPath && sKeyPath && fs.existsSync(path.resolve(sCertPath)) && fs.existsSync(path.resolve(sKeyPath))
    );

    return {
      sClientId,
      sClientSecret,
      sAppKey,
      sAgencia,
      sConta,
      sCertPath,
      sKeyPath,
      sBaseUrl,
      sApiUrl,
      sFiltroSinal,
      bUsaMtls,
      sTokenPath: sTokenPath || TOKEN_PATH_MTLS,
    };
  }

  isConfigured() {
    // O certificado é parte da configuração mínima: sem ele a API do
    // Bradesco recusa a autenticação antes de validar as credenciais.
    return this.verificaConfiguracao().length === 0;
  }

  /**
   * Relaciona os problemas de configuração antes de qualquer chamada externa,
   * permitindo que a tela exiba uma mensagem acionável ao usuário.
   * @returns {string[]} Lista de pendências (vazia quando está tudo pronto)
   */
  verificaConfiguracao() {
    const cfg = this.getConfig();
    const aPendencias = [];

    if (!cfg.sClientId) {
      aPendencias.push('BRADESCO_CLIENT_ID não informado no .env.');
    }
    if (!cfg.sClientSecret) {
      aPendencias.push('BRADESCO_CLIENT_SECRET não informado no .env.');
    }

    // O certificado de cliente é exigido pelo próprio endpoint de token
    if (!cfg.sCertPath) {
      aPendencias.push('BRADESCO_CERT_PATH não informado no .env (certificado .crt do portal do desenvolvedor).');
    } else if (!fs.existsSync(path.resolve(cfg.sCertPath))) {
      aPendencias.push(`Certificado não encontrado em "${path.resolve(cfg.sCertPath)}".`);
    }

    if (!cfg.sKeyPath) {
      aPendencias.push('BRADESCO_KEY_PATH não informado no .env (chave privada .key do certificado).');
    } else if (!fs.existsSync(path.resolve(cfg.sKeyPath))) {
      aPendencias.push(`Chave privada não encontrada em "${path.resolve(cfg.sKeyPath)}".`);
    }

    return aPendencias;
  }

  // ───────── mTLS Agent ─────────

  /**
   * Monta o agente HTTPS com o certificado do cliente.
   * @param {string} sCertPath
   * @param {string} sKeyPath
   * @returns {https.Agent|undefined} undefined quando o mTLS não está em uso
   */
  _getMtlsAgent(sCertPath, sKeyPath) {
    if (this._mtlsAgent) return this._mtlsAgent;

    // A API do Bradesco recusa a conexão sem certificado de cliente
    // (401 "SSL with client authentication is required")
    if (!sCertPath || !sKeyPath) {
      throw new Error(
        'A API do Bradesco exige certificado de cliente (mTLS). ' +
          'Baixe o certificado no portal do desenvolvedor, salve os arquivos em certs/ ' +
          'e preencha BRADESCO_CERT_PATH e BRADESCO_KEY_PATH no .env.'
      );
    }

    const sCertAbs = path.resolve(sCertPath);
    const sKeyAbs = path.resolve(sKeyPath);

    if (!fs.existsSync(sCertAbs)) {
      throw new Error(
        `Certificado Bradesco não encontrado em "${sCertAbs}". ` +
          'Baixe o certificado no portal do desenvolvedor e salve o arquivo nesse caminho.'
      );
    }
    if (!fs.existsSync(sKeyAbs)) {
      throw new Error(
        `Chave privada Bradesco não encontrada em "${sKeyAbs}". ` +
          'Salve a chave privada (.key) gerada junto com o certificado nesse caminho.'
      );
    }

    this._mtlsAgent = new https.Agent({
      cert: fs.readFileSync(sCertAbs),
      key: fs.readFileSync(sKeyAbs),
      keepAlive: true,
      rejectUnauthorized: true,
    });

    return this._mtlsAgent;
  }

  // ───────── HTTP Helper ─────────

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
          oRes.on('data', (chunk) => { sData += chunk; });
          oRes.on('end', () => {
            const nStatus = oRes.statusCode ?? 0;
            try {
              const oCorpo = sData ? JSON.parse(sData) : {};
              resolve({ nStatus, oCorpo, sTexto: sData });
            } catch {
              resolve({ nStatus, oCorpo: {}, sTexto: sData });
            }
          });
        }
      );
      oReq.on('error', reject);
      if (sBody) oReq.write(sBody);
      oReq.end();
    });
  }

  // ───────── Autenticação ─────────

  async authenticate() {
    const cfg = this.getConfig();
    const agora = Date.now();

    if (this._tokenCache && this._tokenCache.nExpiraEm > agora + 60_000) {
      return this._tokenCache.sAccessToken;
    }

    const agent = this._getMtlsAgent(cfg.sCertPath, cfg.sKeyPath);

    const sBody = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: cfg.sClientId,
      client_secret: cfg.sClientSecret,
    }).toString();

    const sUrl = `${cfg.sBaseUrl}${cfg.sTokenPath}`;

    console.log('[BradescoProvider] Autenticando...', sUrl, cfg.bUsaMtls ? '(mTLS)' : '(sem mTLS)');

    const { nStatus, oCorpo, sTexto } = await this._requisicaoHttps(
      sUrl,
      {
        agent,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(sBody),
          Accept: 'application/json',
          // O gateway do sandbox identifica a aplicação por esta chave
          ...(cfg.sAppKey ? { 'gw-dev-app-key': cfg.sAppKey } : {}),
        },
      },
      sBody
    );

    console.log('[BradescoProvider] Token status:', nStatus);

    if (nStatus >= 400 || !oCorpo.access_token) {
      throw new Error(
        `Token Bradesco não obtido (Status ${nStatus}): ${oCorpo.error_description || oCorpo.error || oCorpo.message || sTexto}`
      );
    }

    this._tokenCache = {
      sAccessToken: oCorpo.access_token,
      nExpiraEm: agora + (oCorpo.expires_in ?? 3600) * 1000,
    };

    console.log('[BradescoProvider] Token obtido com sucesso. Expira em:', oCorpo.expires_in, 's');

    return oCorpo.access_token;
  }

  // ───────── Busca de Extrato ─────────

  /**
   * Busca o extrato no período.
   * @param {string} dataInicio DD/MM/AAAA ou DDMMAAAA
   * @param {string} dataFim DD/MM/AAAA ou DDMMAAAA
   * @param {{ codAgencia?: string, numContaCorrente?: string, tipConta?: string }|null} oConta
   * @returns {Promise<Array<object>>}
   */
  async fetchExtrato(dataInicio, dataFim, oConta = null) {
    const cfg = this.getConfig();
    const sToken = await this.authenticate();
    const agent = this._getMtlsAgent(cfg.sCertPath, cfg.sKeyPath);

    const sAgencia = soDigitos(oConta?.codAgencia || cfg.sAgencia);
    const sConta = soDigitos(oConta?.numContaCorrente || cfg.sConta);
    const sTipo = oConta?.tipConta === 'cp' ? 'cp' : 'cc';

    if (!sAgencia || !sConta) {
      throw new Error(
        'Agência e conta são obrigatórias para consultar o extrato Bradesco. Cadastre a conta ou defina BRADESCO_AGENCIA/BRADESCO_CONTA no .env.'
      );
    }

    if (sAgencia.length > 5) {
      throw new Error(`Agência inválida (${sAgencia}): a API Bradesco aceita no máximo 5 dígitos.`);
    }
    if (sConta.length > 13) {
      throw new Error(`Conta inválida (${sConta}): a API Bradesco aceita no máximo 13 dígitos.`);
    }

    let sDataInicioApi;
    let sDataFimApi;
    try {
      sDataInicioApi = formataDataBradescoParaDDMMAAAA(dataInicio);
      sDataFimApi = formataDataBradescoParaDDMMAAAA(dataFim);
    } catch (oErro) {
      throw new Error(`Período inválido para a API Bradesco: ${oErro.message}`);
    }

    const oParams = new URLSearchParams();
    oParams.set('agencia', sAgencia);
    oParams.set('conta', sConta);
    oParams.set('tipo', sTipo);
    oParams.set('dataInicio', sDataInicioApi);
    oParams.set('dataFim', sDataFimApi);
    oParams.set('tipoOperacao', '1');

    const sUrl = `${cfg.sApiUrl}/extratos?${oParams}`;
    const sNonce = String(Date.now());
    const sTimestamp = new Date().toISOString().replace(/\.\d{3}Z$/, '-00:00');

    console.log('[BradescoProvider] Buscando extrato:', {
      url: sUrl,
      agencia: sAgencia,
      conta: sConta,
      tipo: sTipo,
      dataInicio: sDataInicioApi,
      dataFim: sDataFimApi,
    });

    const { nStatus, oCorpo, sTexto } = await this._requisicaoHttps(sUrl, {
      agent,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${sToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(cfg.sAppKey ? { 'gw-dev-app-key': cfg.sAppKey } : {}),
        'X-Brad-Nonce': sNonce,
        'X-Brad-Timestamp': sTimestamp,
        'X-Brad-Algorithm': 'SHA256',
        'x-bradesco-correlationID': `conciliacao-${sNonce}`,
      },
    });

    // O mock do sandbox devolve 404 com "Erro de estrutura" quando a
    // combinação agência/conta/período não corresponde a um cenário cadastrado
    if (nStatus === 404) {
      const sCenario = String(oCorpo?.cenario ?? '').toUpperCase();
      if (sCenario === 'ERRO' || oCorpo?.mensagem) {
        throw new Error(
          `Bradesco não reconheceu a consulta (404): ${oCorpo.mensagem || 'Erro de estrutura.'} ` +
            `Confira agência (${sAgencia}), conta (${sConta}) e o período — ` +
            'no sandbox apenas combinações previamente cadastradas retornam extrato.'
        );
      }
      return [];
    }

    if (nStatus === 422) {
      const sMsg = oCorpo?.descricao_amigavel || oCorpo?.mensagem || oCorpo?.codigo || sTexto;
      throw new Error(`Bradesco (422): ${sMsg}`);
    }

    if (nStatus === 401 || nStatus === 403) {
      const sMsg = oCorpo?.message || oCorpo?.mensagem || sTexto;
      throw new Error(`Bradesco não autorizado (${nStatus}): ${sMsg}`);
    }

    if (nStatus >= 400) {
      const sMsg = oCorpo?.mensagem || oCorpo?.message || oCorpo?.errosValidacao?.mensagem || sTexto;
      throw new Error(`Erro da API Bradesco (Status ${nStatus}): ${sMsg}`);
    }

    const { aLancamentos, sErroNegocial } = this._extraiLancamentos(oCorpo);
    if (sErroNegocial && aLancamentos.length === 0) {
      throw new Error(`Bradesco: ${sErroNegocial}`);
    }

    console.log('[BradescoProvider] Lançamentos extraídos:', aLancamentos.length);

    return this._normalizaMovimentos(aLancamentos, cfg.sFiltroSinal);
  }

  /**
   * Converte um campo que pode vir como objeto único ou como array
   * em uma lista de blocos, uniformizando o tratamento.
   * @param {object|Array|undefined} oValor
   * @returns {Array<object>}
   */
  _comoListaDeBlocos(oValor) {
    if (Array.isArray(oValor)) return oValor;
    if (oValor && typeof oValor === 'object') return [oValor];
    return [];
  }

  /**
   * Percorre "listaLancamentos", que na resposta do Bradesco é um OBJETO cujas
   * chaves são grupos ("Saldo Anterior", "Ultimos Lancamentos",
   * "Lancamentos Dia"), cada um contendo um array de lançamentos.
   * Também aceita o formato em array usado por outros ambientes.
   * @param {object|Array|undefined} oListaLancamentos
   * @param {Array<object>} aDestino Recebe os lançamentos encontrados
   * @returns {string} Saldo anterior bruto, quando presente no grupo próprio
   */
  _coletaGruposDeLancamentos(oListaLancamentos, aDestino) {
    let sSaldoAnterior = '';

    for (const oGrupo of this._comoListaDeBlocos(oListaLancamentos)) {
      for (const [sChave, oItens] of Object.entries(oGrupo)) {
        if (!Array.isArray(oItens)) {
          continue;
        }

        // O grupo de saldo anterior não representa movimentação
        if (String(sChave).toLowerCase().includes(GRUPO_SALDO_ANTERIOR)) {
          sSaldoAnterior = oItens[0]?.valorSaldoAposLancamento ?? '';
          continue;
        }

        aDestino.push(...oItens);
      }
    }

    return sSaldoAnterior;
  }

  /**
   * Extrai os lançamentos da resposta da API, cobrindo os dois contratos:
   * "extratoPorPeriodo" (com lstLancamentoMensal) e
   * "extratoUltimosLancamentos" (com listaLancamentos agrupada).
   * @param {object} oCorpo
   * @returns {{ aLancamentos: Array, sErroNegocial: string, sSaldoAnterior: string }}
   */
  _extraiLancamentos(oCorpo) {
    const aBlocos = [
      ...this._comoListaDeBlocos(oCorpo?.extratoPorPeriodo),
      ...this._comoListaDeBlocos(oCorpo?.extratoUltimosLancamentos),
    ];

    const aLancamentos = [];
    const aErros = [];
    let sSaldoAnterior = '';

    for (const oBloco of aBlocos) {
      // "00" e "0" indicam sucesso; qualquer outro código é erro negocial
      const sCodigo = String(oBloco?.codigoRetorno ?? '').trim();
      if (!CODIGOS_RETORNO_OK.has(sCodigo)) {
        aErros.push(oBloco.mensagem || `código de retorno ${sCodigo}`);
        continue;
      }

      // Contrato por período
      if (Array.isArray(oBloco?.lstLancamentoMensal)) {
        aLancamentos.push(...oBloco.lstLancamentoMensal);
      }

      // Contrato de últimos lançamentos (grupos nomeados)
      const sSaldoDoBloco = this._coletaGruposDeLancamentos(oBloco?.listaLancamentos, aLancamentos);
      if (sSaldoDoBloco && !sSaldoAnterior) {
        sSaldoAnterior = sSaldoDoBloco;
      }
    }

    return {
      aLancamentos,
      sErroNegocial: aErros.join(' | '),
      sSaldoAnterior,
    };
  }

  // ───────── Normalização ─────────

  _normalizaMovimentos(aLancBrutos, sFiltroSinal = '') {
    return aLancBrutos
      .filter((oLanc) => {
        const sDesc = String(
          oLanc.descritivoLancamentoCompleto ?? oLanc.descritivoLancamentoAbreviado ?? ''
        ).toLowerCase();
        const nValor = this._parseValor(oLanc);
        // Ignora linha técnica de saldo anterior zerada
        if (sDesc.includes('saldo anterior') && nValor === 0) return false;
        if (nValor === 0) return false;
        if (sFiltroSinal && this._obtemSinal(oLanc) !== sFiltroSinal) return false;
        return true;
      })
      .map((oLanc) => {
        const nValor = this._parseValor(oLanc);
        const sSinal = this._obtemSinal(oLanc);
        const sData = normalizaDataExibicao(
          String(oLanc.dataLancamento ?? oLanc.dataMovimento ?? '')
        );
        const sDescricao =
          oLanc.descritivoLancamentoCompleto ??
          oLanc.descritivoLancamentoAbreviado ??
          oLanc.descricao ??
          oLanc.historico ??
          'Movimento Bradesco';
        const sDocumento = String(oLanc.numeroDocumento ?? oLanc.numDocumento ?? '');

        return {
          datMovimento: sData,
          desHistorico: String(sDescricao),
          numDocumento: sDocumento,
          codigoLancamento: String(oLanc.codigoLancamento ?? ''),
          valEntrada: sSinal === 'C' ? nValor : null,
          valSaida: sSinal === 'D' ? nValor : null,
          staConciliado: false,
        };
      })
      .filter((oMov) => Boolean(oMov.datMovimento));
  }

  /**
   * Converte o valor do lançamento para número.
   * A API devolve o valor formatado em pt-BR ("6.759,00"), por isso a
   * conversão usa limpaSeparadores — um replace simples de vírgula por ponto
   * transformaria "6.759,00" em 6.759, errando a grandeza em mil vezes.
   * @param {object} oLanc
   * @returns {number} Valor absoluto do lançamento
   */
  _parseValor(oLanc) {
    const oValor = oLanc.valor ?? oLanc.valorLancamento ?? 0;

    if (typeof oValor === 'number') {
      return Math.abs(Number.isNaN(oValor) ? 0 : oValor);
    }

    try {
      return Math.abs(limpaSeparadores(oValor));
    } catch {
      return 0;
    }
  }

  /**
   * Determina se o lançamento é crédito (C) ou débito (D).
   * O campo "sinalLancamento" traz "+" ou "-" na resposta do Bradesco.
   * @param {object} oLanc
   * @returns {'C'|'D'}
   */
  _obtemSinal(oLanc) {
    const sSinal = String(
      oLanc.sinalLancamento ?? oLanc.indicadorSinal ?? oLanc.indicadorSinalLancamento ?? ''
    ).trim().toUpperCase();

    if (sSinal === 'C' || sSinal === 'CREDITO' || sSinal === '+') return 'C';
    if (sSinal === 'D' || sSinal === 'DEBITO' || sSinal === '-') return 'D';

    // Sem sinal explícito, um valor negativo indica débito
    const oValorBruto = oLanc.valor ?? oLanc.valorLancamento ?? 0;
    const bNegativo =
      typeof oValorBruto === 'string' ? oValorBruto.trim().startsWith('-') : Number(oValorBruto) < 0;

    return bNegativo ? 'D' : 'C';
  }

  clearCache() {
    this._tokenCache = null;
    this._mtlsAgent = null;
  }
}
