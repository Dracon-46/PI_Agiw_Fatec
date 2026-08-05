// BradescoProvider.js - Provider concreto para o Bradesco
// Ticket 37060 - Refatoração Strategy/Factory

import fs from 'fs';
import https from 'https';
import path from 'path';
import { BankProvider } from './BankProvider.js';

const TOKEN_PATH = '/auth/server-mtls/v2/token';

/**
 * Provider para integração com o Bradesco via OAuth2 + mTLS.
 * Encapsula toda a lógica de autenticação, busca de extrato e normalização.
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
    const sDataInicio = leEnv('BRADESCO_DATA_INICIO', 'bradesco_Data_Inicio');
    const sDataFim = leEnv('BRADESCO_DATA_FIM', 'bradesco_Data_Fim');
    const sFiltroSinal = leEnv('BRADESCO_FILTRO_SINAL', 'bradesco_Filtro_Sinal');

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
      sDataInicio,
      sDataFim,
      sFiltroSinal,
    };
  }

  isConfigured() {
    const cfg = this.getConfig();
    return Boolean(
      cfg.sClientId && cfg.sClientSecret && cfg.sAgencia && cfg.sConta && cfg.sCertPath && cfg.sKeyPath
    );
  }

  // ───────── mTLS Agent ─────────

  _getMtlsAgent(sCertPath, sKeyPath) {
    if (this._mtlsAgent) return this._mtlsAgent;

    const sCertAbs = path.resolve(sCertPath);
    const sKeyAbs = path.resolve(sKeyPath);

    if (!fs.existsSync(sCertAbs)) {
      throw new Error(`Certificado Bradesco não encontrado: "${sCertAbs}"`);
    }
    if (!fs.existsSync(sKeyAbs)) {
      throw new Error(`Chave privada Bradesco não encontrada: "${sKeyAbs}"`);
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

    const sUrl = `${cfg.sBaseUrl}${TOKEN_PATH}`;

    console.log('[BradescoProvider] Autenticando...', sUrl);

    const { nStatus, oCorpo, sTexto } = await this._requisicaoHttps(
      sUrl,
      {
        agent,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(sBody),
        },
      },
      sBody
    );

    console.log('[BradescoProvider] Token status:', nStatus);

    if (nStatus >= 400 || !oCorpo.access_token) {
      throw new Error(
        `Token Bradesco não obtido (Status ${nStatus}): ${oCorpo.error_description || oCorpo.error || sTexto}`
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

  async fetchExtrato(dataInicio, dataFim) {
    const cfg = this.getConfig();
    const sToken = await this.authenticate();
    const agent = this._getMtlsAgent(cfg.sCertPath, cfg.sKeyPath);

    const oParams = new URLSearchParams();
    oParams.set('agencia', cfg.sAgencia);
    oParams.set('conta', cfg.sConta);
    oParams.set('dataInicio', dataInicio.replace(/\D/g, ''));
    oParams.set('dataFim', dataFim.replace(/\D/g, ''));
    oParams.set('tipo', 'cc');
    oParams.set('tipoOperacao', '1');

    if (cfg.sAppKey) {
      oParams.set('gw-dev-app-key', cfg.sAppKey);
    }

    const sUrl = `${cfg.sApiUrl}/extratos?${oParams}`;
    const sNonce = String(Date.now());
    const sTimestamp = new Date().toISOString().replace(/\.\d{3}Z$/, '-00:00');

    console.log('[BradescoProvider] Buscando extrato:', sUrl);

    const { nStatus, oCorpo, sTexto } = await this._requisicaoHttps(sUrl, {
      agent,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${sToken}`,
        'Content-Type': 'application/json',
        'X-Brad-Nonce': sNonce,
        'X-Brad-Timestamp': sTimestamp,
        'X-Brad-Algorithm': 'SHA256',
        'x-bradesco-correlationID': `conciliacao-${sNonce}`,
      },
    });

    if (nStatus === 404) {
      return [];
    }

    if (nStatus >= 400) {
      throw new Error(`Erro da API Bradesco (Status ${nStatus}): ${sTexto}`);
    }

    console.log('[BradescoProvider] Resposta bruta da API:', JSON.stringify(oCorpo, null, 2));

    const aLancBrutos = oCorpo?.extratoPorPeriodo?.lstLancamentoMensal || oCorpo.transacoes || oCorpo.listaLancamento || oCorpo.lancamentos || [];

    return this._normalizaMovimentos(aLancBrutos, cfg.sFiltroSinal);
  }

  // ───────── Normalização ─────────

  _normalizaMovimentos(aLancBrutos, sFiltroSinal = '') {
    return aLancBrutos
      .filter((oLanc) => {
        const nValor = this._parseValor(oLanc);
        if (nValor === 0) return false;
        if (sFiltroSinal && this._obtemSinal(oLanc, nValor) !== sFiltroSinal) return false;
        return true;
      })
      .map((oLanc) => {
        const nValor = this._parseValor(oLanc);
        const sSinal = this._obtemSinal(oLanc, nValor);
        const sData = this._normalizaData(
          String(oLanc.dataLancamento ?? oLanc.dataMovimento ?? '')
        );
        const sDescricao = oLanc.descritivoLancamentoCompleto ?? oLanc.descritivoLancamentoAbreviado ?? oLanc.descricao ?? oLanc.historico ?? oLanc.textoDescricao ?? 'Movimento Bradesco';
        const sDocumento = String(oLanc.numeroDocumento ?? oLanc.numDocumento ?? '');

        return {
          datMovimento: sData,
          desHistorico: String(sDescricao),
          numDocumento: sDocumento,
          valEntrada: sSinal === 'C' ? nValor : null,
          valSaida: sSinal === 'D' ? nValor : null,
          staConciliado: false,
        };
      });
  }

  _parseValor(oLanc) {
    const oValor = oLanc.valor ?? oLanc.valorLancamento ?? 0;
    const nValor = typeof oValor === 'string' ? parseFloat(oValor.replace(',', '.')) : Number(oValor);
    return Math.abs(isNaN(nValor) ? 0 : nValor);
  }

  _obtemSinal(oLanc, nValor) {
    const sSinal = oLanc.sinalLancamento ?? oLanc.indicadorSinal ?? oLanc.indicadorSinalLancamento ?? oLanc.tipoLancamento ?? '';
    if (sSinal === 'C' || sSinal === 'CREDITO' || sSinal === '+') return 'C';
    if (sSinal === 'D' || sSinal === 'DEBITO' || sSinal === '-') return 'D';
    const oValorBruto = oLanc.valor ?? oLanc.valorLancamento ?? 0;
    const nBruto = typeof oValorBruto === 'string' ? parseFloat(oValorBruto.replace(',', '.')) : Number(oValorBruto);
    return nBruto < 0 ? 'D' : 'C';
  }

  _normalizaData(sData) {
    if (!sData || sData === '0') return '';
    const sPad = sData.replace(/\D/g, '').padStart(8, '0');
    if (sPad.length !== 8) return sData;
    const sDia = sPad.slice(0, 2);
    const sMes = sPad.slice(2, 4);
    const sAno = sPad.slice(4, 8);
    if (parseInt(sAno, 10) > 31) {
      return `${sPad.slice(6, 8)}/${sPad.slice(4, 6)}/${sPad.slice(0, 4)}`;
    }
    return `${sDia}/${sMes}/${sAno}`;
  }

  // ───────── Cache ─────────

  clearCache() {
    this._tokenCache = null;
    this._mtlsAgent = null;
  }
}
