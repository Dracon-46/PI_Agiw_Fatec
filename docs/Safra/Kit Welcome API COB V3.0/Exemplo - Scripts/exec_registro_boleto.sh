curl -v \
-X POST https://api-hml.safranegocios.com.br/gateway/cobrancas/v1/boletos \
-d "@data.json"  \
-H "Safra-Correlation-ID: 41fa65a3-1a71-4437-a169-5bd209eb2d3a" \
-H "Content-Type: application/json" \
-H "Authorization: Bearer <token_gerado>" \