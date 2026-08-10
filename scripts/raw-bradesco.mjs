// raw-bradesco.mjs - Mostra a resposta bruta da API de extratos do Bradesco
// Uso: node scripts/raw-bradesco.mjs <agencia> <conta> <dataInicio> <dataFim>
import 'dotenv/config';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { BradescoProvider } from '../src/providers/BradescoProvider.js';

const sAgencia = process.argv[2] || '3750';
const sConta = process.argv[3] || '75557';
const sIni = process.argv[4] || '01092024';
const sFim = process.argv[5] || '30092024';

const oProvider = new BradescoProvider();
const cfg = oProvider.getConfig();
const sToken = await oProvider.authenticate();

const agent = new https.Agent({
   cert: fs.readFileSync(path.resolve(cfg.sCertPath)),
   key: fs.readFileSync(path.resolve(cfg.sKeyPath)),
   keepAlive: false,
});

const oParams = new URLSearchParams({
   agencia: sAgencia, conta: sConta, tipo: 'cc',
   dataInicio: sIni, dataFim: sFim, tipoOperacao: '1',
});
const sUrl = `${cfg.sApiUrl}/extratos?${oParams}`;
console.log('GET', sUrl, '\n');

const oUrl = new URL(sUrl);
await new Promise((res) => {
   const r = https.request({
      agent, hostname: oUrl.hostname, port: 443, path: oUrl.pathname + oUrl.search, method: 'GET',
      headers: {
         Authorization: `Bearer ${sToken}`, Accept: 'application/json',
         ...(cfg.sAppKey ? { 'gw-dev-app-key': cfg.sAppKey } : {}),
      },
   }, (o) => {
      let d = '';
      o.on('data', (c) => { d += c; });
      o.on('end', () => {
         console.log('HTTP', o.statusCode);
         try { console.log(JSON.stringify(JSON.parse(d), null, 2).slice(0, 4000)); }
         catch { console.log(d.slice(0, 2000)); }
         res();
      });
   });
   r.on('error', (e) => { console.log('ERRO:', e.message); res(); });
   r.end();
});
process.exit(0);
