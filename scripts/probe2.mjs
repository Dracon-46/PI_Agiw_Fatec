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

function chama(sQuery, bComHeadersBrad) {
   const sFull = `${cfg.sApiUrl}/extratos?${sQuery}`;
   const oUrl = new URL(sFull);
   const sNonce = String(Date.now());
   return new Promise((res) => {
      const r = https.request({
         agent, hostname: oUrl.hostname, port: 443, path: oUrl.pathname + oUrl.search, method: 'GET',
         headers: {
            Authorization: `Bearer ${sToken}`, Accept: 'application/json',
            ...(bComHeadersBrad ? {
               'X-Brad-Nonce': sNonce,
               'X-Brad-Timestamp': new Date().toISOString().replace(/\.\d{3}Z$/, '-00:00'),
               'X-Brad-Algorithm': 'SHA256',
               'x-bradesco-correlationID': `diag-${sNonce}`,
            } : {}),
         },
      }, (o) => {
         let d = '';
         o.on('data', (c) => { d += c; });
         o.on('end', () => res({ st: o.statusCode, corpo: d.replace(/\s+/g, ' ').slice(0, 120) }));
      });
      r.on('error', (e) => res({ st: 'ERR', corpo: e.message }));
      r.end();
   });
}

const aVariacoes = [
   ['3750/75557 set24', 'agencia=3750&conta=75557&tipo=cc&dataInicio=01092024&dataFim=30092024'],
   ['3750/75557 nov24', 'agencia=3750&conta=75557&tipo=cc&dataInicio=06112024&dataFim=20112024'],
   ['3750/75557 1 dia', 'agencia=3750&conta=75557&tipo=cc&dataInicio=30092024&dataFim=30092024'],
   ['1111/1111111',     'agencia=1111&conta=1111111&tipo=cc&dataInicio=01092024&dataFim=30092024'],
   ['2856/567',         'agencia=2856&conta=567&tipo=cc&dataInicio=01092024&dataFim=30092024'],
   ['0001/1',           'agencia=1&conta=1&tipo=cc&dataInicio=01092024&dataFim=30092024'],
   ['tipo=cp',          'agencia=3750&conta=75557&tipo=cp&dataInicio=01092024&dataFim=30092024'],
   ['sem tipoOperacao', 'agencia=3750&conta=75557&tipo=cc&dataInicio=01092024&dataFim=30092024'],
   ['com cpfCnpj',      'agencia=3750&conta=75557&tipo=cc&dataInicio=01092024&dataFim=30092024&cpfCnpj=00921607000104'],
];

for (const [sNome, sQ] of aVariacoes) {
   const oSem = await chama(sQ, false);
   const oCom = await chama(sQ, true);
   console.log(sNome.padEnd(20), '| sem X-Brad:', String(oSem.st).padEnd(4), '| com X-Brad:', String(oCom.st).padEnd(4), '|', oCom.corpo);
}
process.exit(0);
