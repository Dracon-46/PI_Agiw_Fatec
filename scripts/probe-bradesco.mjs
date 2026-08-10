// probe-bradesco.mjs - Sonda variações de caminho/parâmetros do extrato Bradesco
import 'dotenv/config';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { BradescoProvider } from '../src/providers/BradescoProvider.js';

const oProvider = new BradescoProvider();
const cfg = oProvider.getConfig();
const sToken = await oProvider.authenticate();
const agent = new https.Agent({
   cert: fs.readFileSync(path.resolve(cfg.sCertPath)),
   key: fs.readFileSync(path.resolve(cfg.sKeyPath)),
   keepAlive: true,
});

function chama(sPath, sQuery, sMetodo = 'GET') {
   const sFull = `https://openapisandbox.prebanco.com.br${sPath}${sQuery ? `?${sQuery}` : ''}`;
   const oUrl = new URL(sFull);
   return new Promise((res) => {
      const r = https.request({
         agent, hostname: oUrl.hostname, port: 443, path: oUrl.pathname + oUrl.search, method: sMetodo,
         headers: {
            Authorization: `Bearer ${sToken}`, Accept: 'application/json',
            ...(cfg.sAppKey ? { 'gw-dev-app-key': cfg.sAppKey } : {}),
         },
      }, (o) => {
         let d = '';
         o.on('data', (c) => { d += c; });
         o.on('end', () => res({ st: o.statusCode, corpo: d.replace(/\s+/g, ' ').slice(0, 150) }));
      });
      r.on('error', (e) => res({ st: 'ERR', corpo: e.message }));
      r.end();
   });
}

const sBase = '/v1/fornecimento-extratos-contas';
const aTestes = [
   [`${sBase}/extratos`, 'agencia=3750&conta=75557&tipo=cc&dataInicio=01092024&dataFim=30092024&tipoOperacao=1'],
   [`${sBase}/extratos`, 'agencia=3750&conta=75557&tipo=cc&dataInicio=01092024&dataFim=30092024'],
   [`${sBase}/extratos`, 'numeroAgencia=3750&numeroConta=75557&dataInicio=01092024&dataFim=30092024'],
   [`${sBase}/extratos`, 'agencia=03750&conta=0000075557&tipo=cc&dataInicio=01092024&dataFim=30092024'],
   [`${sBase}/extratos`, 'agencia=3750&conta=75557&tipo=cc&dataInicio=2024-09-01&dataFim=2024-09-30'],
   [`${sBase}/extratos`, ''],
   [`${sBase}/extrato`, 'agencia=3750&conta=75557&tipo=cc&dataInicio=01092024&dataFim=30092024'],
   [`${sBase}/extratos/periodo`, 'agencia=3750&conta=75557&tipo=cc&dataInicio=01092024&dataFim=30092024'],
   [`${sBase}/extratos-completos`, 'agencia=3750&conta=75557&tipo=cc&dataInicio=01092024&dataFim=30092024'],
   [`${sBase}/saldos`, 'agencia=3750&conta=75557&tipo=cc'],
   [`${sBase}`, ''],
];

for (const [p, q] of aTestes) {
   const o = await chama(p, q);
   console.log(String(o.st).padEnd(5), (p + (q ? `?${q.slice(0, 58)}` : '')).padEnd(96), o.corpo);
}
process.exit(0);
