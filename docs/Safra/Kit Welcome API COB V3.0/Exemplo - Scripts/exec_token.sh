curl -v \
-H "Content-Type: application/x-www-form-urlencoded" \
-d "client_id=<clientid>&username=<username>&password=<password>&refresh_token=&grant_type=password" \
-X POST https://api-hml.safranegocios.com.br/gateway/v1/oauth2/token