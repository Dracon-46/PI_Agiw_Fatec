curl -v \
GET 'https://api-hml.safranegocios.com.br/gateway/cobrancas/v1/boletos?agencia=<agencia>&conta=<conta>&numero=<nossonumero>&numeroCliente=<seunumero>' \
-H "Safra-Correlation-ID: 41fa65a3-1a71-4437-a169-5bd209eb2d3a" \
-H "Content-Type: application/json" \
-H "Authorization: Bearer <token_gerado>"