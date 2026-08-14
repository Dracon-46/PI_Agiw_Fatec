Plataforma de Serviços Digitais 
Cobrança API (Emissão Direta) 
Versão 3.0 
Setembro/2025 
1. Introdução 
O Banco Safra disponibiliza aos seus clientes, uma plataforma de serviços digitais, 
através de um ecossistema de APIs. 
Este documento detalha todos os mecanismos de integração disponíveis, com seus 
requisitos técnicos, modelo de segurança, acessos e exemplos de chamadas aos 
serviços. 
2. Confidencialidade 
Visando a integridade e segurança dos serviços, este material é confidencial e de uso 
exclusivo da equipe de segurança e tecnologia do cliente.  
Seu conteúdo deve ser tratado com total profissionalismo, sendo restrito à área 
responsável pela integração tecnológica. É proibido a divulgação, reprodução ou 
compartilhamento deste material, independentemente do tipo de mídia utilizada.  
O uso não autorizado deste material é proibido e está sujeito às penalidades cabíveis. 
3. Canais de Atendimento 
Mesa de Implantação  
Grande São Paulo: (11) 3175-4790  
Demais Localidades: 0300 371 4602 
Central de Suporte Pessoa Jurídica 
Grande São Paulo: (11) 3175-8248  
Demais Localidades: 0300 015 7575 
Horário de Atendimento 
Atendimento personalizado de 2ᵃ a 6ᵃ feira, das 9:00 horas às 18:00 horas, exceto 
feriados. 
Página 2 
29/12/2025 
Restrito 
4. Plataforma de Integração 
Segue visão macro da Arquitetura de Integração da Plataforma de Serviços Digitais: 
5. Quick Start 
Para iniciar o processo de conectividade com a Plataforma de Serviços Digitais, o 
cliente deverá acionar seu gerente de relacionamento, que será responsável por abrir 
um chamado junto à Mesa de Implantação, dando início  
às etapas abaixo:  
  Geração de credencial de autenticação no servidor oAuth 2.0  
  Implementar autenticação oAuth 2.0 seguindo os passos descritos no item 7 deste 
documento;  
 Implementar os códigos necessário para acesso às APIs contratadas, seguindo as 
etapas descritas nos itens 8 a 12 deste documento. 
6. Serviços Disponíveis 
Para viabilizar a comunicação com a Plataforma de serviços Digitais do Banco Safra, 
está disponível um conjunto de serviços, cada um com funções específicas e uma 
ordem lógica de consumo que deve ser respeitada. 
A seguir apresentamos a lista destes serviços, a sequência recomendada de invocação 
e, para cada um deles, o detalhamento dos parâmetros e requisitos técnicos: 
Página 3 
29/12/2025 
Restrito 
 POST /gateway/v1/oauth2/token – Autenticação no servidor oAuth 2.0 e obtenção de token 
 POST /gateway/ cobrancas /v1/boletos - Inclusão de boletos 
 GET /gateway/cobrancas/v1/boletos – Consulta de Registro de boletos 
 PUT/gateway/cobrancas-instrucao/v1/realizarInstrucaoBoleto - Instrução de Boletos 
 POST/gateway/cobrancas-baixa/v1/realizarBaixaBoleto – Baixa de Boletos 
 GET/gateway/cobrancas-consulta/v1/consultarBoleto – Consulta de Boletos 
7. Serviço de Autenticação - OAuth 2.0 
O primeiro passo para realizar chamadas aos serviços da Plataforma de Serviços 
Digitais do Banco Safra, como o registro de boletos, é obter um token de acesso por 
meio do servidor de autenticação OAuth 2.0. 
Endpoint de autenticação 
URL Serviço de Autenticação:   
https://api-hml.safranegocios.com.br/gateway/v1/oauth2/token 
MÉTODO = POST  
Para isso, é necessário que o cliente já tenha recebido suas credenciais de acesso, que 
incluem: 
 Cliente_id 
 Usuário  
 Senha 
Caso ainda não tenha recebido estas informações, retorne ao item 5 deste documento 
para seguir o processo de habilitação. 
Com as credenciais em mãos, será possível realizar a requisição de token, que é 
essencial para o consumo seguro das APIs contratadas. A seguir, detalhamos o 
funcionamento do serviço de autenticação, os parâmetros exigidos e o formato da 
requisição. 
Antes de realizar a requisição, é importante compreender o funcionamento do serviço 
de autenticação e o processo de obtenção do token de acesso. 
Serviço: POST https://api-hml.safranegocios.com.br/gateway/v1/oauth2/token 
Página 4 
29/12/2025 
Restrito 
Para o ambiente de sandbox, mantenha o sufixo -hml na URI dos serviços. 
Para o ambiente de produção, remova o sufixo -hml, utilizando a URI correspondente 
ao ambiente oficial. 
Toda informação deve ser enviada utilizando o Content-Type application/x-www-form
urlencoded. As informações que devem ser enviadas são: 
 
 
 
 
client_id: deve ser enviado o client id recebido do Banco Safra. 
username: deve ser enviado o usuário recebido do Banco Safra. 
password: deve ser enviada a senha recebida do Banco Safra. 
grant_type: deve ser enviado password (padrão utilizado por esses serviços. 
Exemplo de requisição para obtenção do token:  
curl --location --request POST 'https://api-hml.safranegocios.com.br/gateway/v1/oauth2/token' \  --header 'Content-Type: application/x-www-form-urlencoded' \  --data-urlencode 'client_id={coloquei aqui seu client_id}' \  --data-urlencode 'username={coloquei aqui seu username}' \  --data-urlencode 'password={coloquei aqui seu password}' \  --data-urlencode 'grant_type=password' 
A requisição retornará um token de acesso com um tempo de validade.     
A validade do token é informada no campo expires_in, representada em segundos. 
Durante esse período, o token permanece ativo e pode ser utilizado normalmente nas 
requisições. 
Após o término do tempo de validade, será necessário realizar uma nova requisição de 
autenticação para obter um novo token válido. Recomenda-se implementar uma 
verificação automática da expiração para garantir a continuidade do funcionamento da 
integração. 
Exemplo de response da requisição de autenticação para obtenção do token de acesso:
{  
access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3YzZhODQxODg0ODg0ZjBkODI1ZDBk 
NzcwZDdhNjI4ZSIsInVzZXJfbmFtZSI6Ik9OTElORSAyIiwiY2xpZW50X2lkIjoiNjEzOWZjNTc5ZTMwYWMwMDExMmE5N2I3Ii 
wic2hvcnRuYW1lIjoiT05MSU5FIDI0OSIsIm5iZiI6MTY4ODEzMDQzMywiZXhwIjoxNjg4MTMxNjczLCJpYXQiOjE2ODgxMzA0 
NzMsImlzcyI6IlNhZnJhSXNzdWVyIiwiYXVkIjoiU2FmcmFBdWRpZW5jZSJ9.dw9WrLK_3mkl0JHFOH7kAL_HS3hnEpl33VYKl 
8h_vzE",  
"token_type": "Bearer",  
"expires_in": 1240,  
"refresh_token": "PCanuit0gCsdN5sfP9pL+bd2PKN6XE+zenJk5/4U4SI="  
} 
Página 5 
29/12/2025 
Restrito 
Para requisição dos próximos serviços será utilizado o atributo token_type e 
access_token obtidos na etapa de autenticação. 
Para mais detalhes deste endpoint, consulte a documentação técnica (swagger) 
disponível no welcome kit fornecida. 
8. Serviço de Emissão de Boletos  
Para realizar o registro de um boleto, é necessário estar de posse do access_token, 
conforme obtido na etapa de autenticação. 
A seguir apresentamos as principais informações sobre este serviço, incluindo seu 
funcionamento, parâmetros obrigatórios e estrutura da requisição: 
URL Serviço de Emissão de Boletos:  
https://api-hml.safranegocios.com.br/gateway/cobrancas/v1/boletos 
MÉTODO: POST 
Para o ambiente de sandbox, mantenha o sufixo -hml na URI dos serviços. 
Para o ambiente de produção, remova o sufixo -hml, utilizando a URI correspondente 
ao ambiente oficial. 
O payload enviado para o serviço de emissão de boletos deve conter as informações de 
negócio necessárias para o registro do documento.  
Abaixo estão os principais grupos de dados que podem ser incluídos: 
• Informações do cliente parceiro  
• Informações do documento do boleto  
• Informações de desconto e abatimento (opcional)  
• Informações sobre a multa e juros (opcional) 
• Informações sobre pagamento parcial (opcional) 
• Informações do pagador  
• Informações do beneficiário* final (opcional)  
• Mensagens adicionadas ao boleto (opcional - limitada a 4 mensagens) 
***Na API, o beneficiário (emissor do boleto) é identificado automaticamente no momento do registro do título. Portanto, 
o campo beneficiário presente no payload refere-se ao Beneficiário Final (anteriormente conhecido como  
Sacador/Avalista), sendo de uso exclusivo para empresas de Factoring e Securitizadoras. 
Página 6 
29/12/2025 
Restrito 
 
 
 
Restrito Página 7 29/12/2025 
As regras de preenchimento e validação dos campos deste serviço estão 
detalhadas na documentação técnica (swagger) disponível no welcome kit 
fornecida. 
NOME DOS CAMPOS 
NÚMERO 
MAX DE 
CARACTERES 
NÚMEROS 
DECIMAIS TIPO  
agencia 5  numérico  
conta 9  numérico  
fidc 3 6 numérico  
danfe 44  string 
documento.numero 9  string 
documento.numeroCliente 10  string 
documento.diasDevolucao 3  numérico  
documento.especie 2  string 
documento.dataVencimento 10  string 
documento.valor 16 2 numérico  
documento.codigoMoeda 2  numérico  
documento.quantidadeDiasProtesto 3  numérico  
documento.identificacaoAceite 1  string 
documento.campoLivre 25  string 
documento.valorAbatimento 15 2 numérico  
documento.desconto.data 10  string 
documento.desconto.valor 15 2 numérico  
documento.desconto.data2 10  string 
documento.desconto.valor2 15 2 numérico  
documento.desconto.data3 10  string 
documento.desconto.valor3 15 2 numérico  
documento.desconto.tipoDesconto 1  string 
documento.multa.dataMulta 10  string 
documento.multa.dataJuros 10  string 
documento.multa.taxaJuros 2 6 numérico  
documento.multa.taxaMulta 2 6 numérico  
documento.pagamentoParcial.valorMaximo 15 2 numérico  
documento.pagamentoParcial.valorMinimo 15 2 numérico  
documento.pagamentoParcial.quantidadeParcelas 4  numérico  
documento.pagamentoParcial.tipoPagamento 1  numérico  
documento.pagamentoParcial.tipoValor 1  numérico  
documento.pagador.nome 40  string 
documento.pagador.tipoPessoa 1  string 
documento.pagador.numeroDocumento 14  string 
documento.pagador.email 50  string 
documento.pagador.endereco.logradouro 40  string 
documento.pagador.endereco.bairro 10  string 
 
 
 
Restrito Página 8 29/12/2025 
documento.pagador.endereco.cidade 15  string 
documento.pagador.endereco.uf 2  string 
documento.pagador.endereco.cep 8  string 
documento.beneficiario.nome 40  string 
documento.beneficiario.tipoPessoa 1  string 
documento.beneficiario.numeroDocumento 14  string 
documento.beneficiario.endereco.logradouro 40  string 
documento.beneficiario.endereco.bairro 10  string 
documento.beneficiario.endereco.cidade 15  string 
documento.beneficiario.endereco.uf 2  string 
documento.beneficiario.endereco.cep 8  string 
documento.mensagens.posicao 1  string 
documento.mensagens.descricao 72  string 
 
vamos realizar uma chamada ao serviço de registro de boletos para demonstrar seu 
funcionamento e o formato da resposta retornada pela API. 
 
1. Colocar no request.body os dados do boleto.  
2. Gerar o token conforme indicado no passo 7 deste documento.  
No header  da requisição substituir o parâmetro header.Authorization ({token_type} 
{access_token}).  
3. inclua o header Safra-Correlation-ID com um identificador único para a requisição. 
Esse ID é utilizado para rastreabilidade e controle de chamadas.  
 
 
curl - - location - - request POST  
“http://api-hmlsafranegocios.com.br/gateway/cobrancas/v1/boletos” \ --header 'Authorization: {token_type} {access_token}' \ --header 'Safra-Correlation-ID: {identificador único da requisição}' \ --header 'Content-Type: application/json' \ --data-raw '{ 
"conta": 1011009, 
"agencia": 12400, 
"documento": { 
"numero": "2123556789", 
"numeroCliente": "0000004021", 
"diasDevolucao": 3, 
"especie": "02", 
"dataVencimento": "2024-04-15", 
"valor": 512.5, 
        "codigoMoeda": 9, 
"quantidadeDiasProtesto": 123, 
"campoLivre": "texto livre", 
"valorAbatimento": 10, 
"desconto": { 
 
 
 
Restrito Página 9 29/12/2025 
"data": "2024-02-15", 
"valor": 30,  
"data2": "2024-03-15", 
"valor2": 15, 
                             "data3": "2024-04-15",  
"valor3": 10,  
"tipoDesconto": "1" 
},  
"multa": {  
"dataMulta": "2024-04-16",  
"dataJuros": "2024-04-16",  
"taxaJuros": 0.03,  
"taxaMulta": 0.01 
},  
"pagamentoParcial": {  
"valorMaximo": 400,  
"valorMinimo": 100,  
"quantidadeParcelas": 1,  
"tipoPagamento": 1,  
"tipoValor": 1  
},  
"pagador": {  
"nome": "Teste Sumare",  
"tipoPessoa": "F",  
"numeroDocumento": "12345678910",  
"endereco": {  
"logradouro": "Rua Verde, 500",  
"bairro": "Vila Céu",  
"cidade": "AGULHA",  
"uf": "SP",  
"cep": "02112002" 
} 
},  
"beneficiario": {  
"nome": "INSTITUTO XYZ",  
"tipoPessoa": "J",  
"numeroDocumento": "01234567890123",  
"endereco": {  
"logradouro": "Rua Azul, 1121", 
 "bairro": "Sumaré",  
 "cidade": "Sao Paulo",  
 "uf": "SP", 
 "cep": "05409003" 
} 
}, 
"mensagens": [ 
{  
"posicao": "1",  
"descricao": "Consulte nota de compra no site." 
} 
] 
 
 
 
Restrito Página 10 29/12/2025 
} 
}' 
 
 
 
A requisição acima retornará um status code e um payload de retorno: 
 
Status code: 201 
Resultado: sucesso 
{  
"data": {  
"numero": 2123556789,  
"numeroCliente": "0000004021",  
"codigoBarras": "42291968700000512507124000010110091235567892", 
"indicadorBaseCentral": " "  
}  
} 
 
Status code: 400 
Resultado: erro na requisição 
{  
"code": "rest-400", 
"message": "Ocorreu um ou mais erros por problemas de sintaxe.", 
"details": "A requisição ou algum campo na requisição está com o tipo incorreto.", 
"fields": [ 
      { 
"name": "Safra-Correlation-ID", 
"message": "The correlationId field is required.", 
"value": "" 
      }  
] 
} 
 
Status code: 401 
Resultado: não autorizado – token inválido ou expirado 
 
Status code: 422 
Resultado: erro de negócio 
{  
"code": "business-validation",  
"message": "A data de vencimento não pode ser menor que a data atual."  
} 
Status code: 500 
Resultado: Erro Interno 
{  
} 
"code": "api-error", 
"message": { 
"code”: "rt-error-generic",  
"message": "Ocorreu um problema na chamada ao serviço." 
} 
Status code: 503 
Resultado: Serviço Indisponível 
9. Serviço de Consulta de Registro de Boletos 
Para realizar o registro de um boleto, é necessário que você já tenha o access token 
conforme descrito no passo 7 
A seguir apresentamos as principais informações sobre este serviço e seu 
funcionamento: 
URL Serviço de Consulta de Registro de Boletos 
https://api-hml.safranegocios.com.br/gateway/cobrancas/v1/boletos  
MÉTODO: GET 
Para o ambiente de sandbox, mantenha o sufixo -hml na URI dos serviços. 
Para o ambiente de produção, remova o sufixo -hml, utilizando a URI correspondente 
ao ambiente oficial. 
Para realizar a consulta do registro de boleto, é necessário informar alguns parâmetros 
por meio de query parameters, na requisição:  
• agência: agência do cliente (a mesma utilizada na geração do boleto)  
• conta: conta do cliente (a mesma utilizada na geração do boleto)  
• número: Identificação do Título no banco – não se repete ( NOSSO NUMERO) 
• numeroCliente: Identificação do Título na Empresa – Ex: Nf, Recibo, etc (SEU 
NÚMERO) 
As regras de preenchimento e validação dos campos deste serviço estão 
detalhadas na documentação técnica (swagger) disponível no welcome kit 
fornecida. 
Página 11 
29/12/2025 
Restrito 
 
 
 
Restrito Página 12 29/12/2025 
Vamos realizar uma chamada ao serviço de consulta de registro boletos para 
demonstrar o funcionamento da consulta e o formato da resposta retornada pela API: 
 
1. Informar os parâmetros de consulta: agência, conta, número e numeroCliente. 
2. Gerar um token de acesso conforme indicado no passo 7 e substituir o parâmetro 
header.Authorization ({token_type} {access_token}). 
3. Inclua o cabeçalho Safra-Correlation-ID com um identificador único para 
rastreabilidade da chamada. 
curl --location --request POST 'https://api
hml.safranegocios.com.br/gateway/cobrancas/v1/boletos?agencia=12400&conta=1011009&numero=21235567 
89&numeroCliente=0000004021' \  --header 'Authorization: {token_type} {access_token}' \  --header 'Safra-Correlation-ID: {identificador único da requisição}' 
 
A requisição acima retornará um status code e um payload de retorno: 
Status code: 200 
Resultado: sucesso 
{  
           “data": {  
  "documento": { 
"numeroCliente": “0000004021”,  
"numero": "2123556789",  
"codigoBarras": "4229682260000051500712400001011009000098932", 
}  
           } 
} 
 
Status code: 400 
Resultado: erro na Requisição 
{  
"code": "rest-400",  
"message": "Ocorreu um ou mais erros por problemas de sintaxe.",  
"details": "A requisição ou algum campo na requisição está com o tipo incorreto.",  
"fields": [  
{  
"name": "Safra-Correlation-ID",  
"message": "The correlationId field is required.",  
"value": ""  
}  
]  
} 
Status code: 401 
Resultado: Não Autorizado – Token inválido ou Expirado 
Status code: 500 
Resultado: Erro Interno 
{  
} 
"code": "api-error", 
"message": { 
"code”: "rt-error-generic",  
"message": "Ocorreu um problema na chamada ao serviço." 
} 
Status code: 503 
Resultado: Serviço Indisponível 
Para mais detalhes deste endpoint, consulte o contrato (swagger) disponível no 
welcome kit fornecido. 
10. Serviço de Instruções de Boletos  
Para o ambiente de sandbox, mantenha o sufixo -hml na URI dos serviços. 
Para o ambiente de produção, remova o sufixo -hml, utilizando a URI correspondente 
ao ambiente oficial. 
A seguir apresentamos as principais informações sobre este serviço e seu 
funcionamento: 
URL Serviço de Instruções de Boletos 
https://api-hml.safranegocios.com.br/gateway/cobrancas-instrucao/v1/realizarInstrucaoBoleto 
MÉTODO=PUT 
Para realizar a consulta do registro de boleto, é necessário informar alguns parâmetros 
por meio de query parameters, na requisição:  
• agência: agência do cliente (a mesma utilizada na geração do boleto)  
• conta: conta do cliente (a mesma u 
tilizada na geração do boleto)  
• númeroDoBoleto: Identificação do Título no banco – não se repete (NOSSO NÚMERO) 
• seuNumero:  Identificação do Título na Empresa – Ex: Nf, Recibo, etc (SEU NÚMERO) 
É possível comandar instruções em boletos já registrados, independente da forma de 
entrada utilizada (Safraempresas, arquivo CNAB, API). 
Página 13 
29/12/2025 
Restrito 
 
 
 
Restrito Página 14 29/12/2025 
Disponibilidade do Serviço de Comando de Instruções:  
Disponível em dias úteis, no horário das 07h às 20h50 respeitando as premissas: 
 Título de Cobrança Vinculada não pode ter sido registrado na mesma data em que a 
instrução está sendo comandada. 
 É permitido comandar apenas uma Instrução por chamada à API 
 
As regras de preenchimento e validação dos campos deste serviço estão 
detalhadas na documentação técnica (swagger) disponível no welcome kit 
fornecida. 
DESCRIÇÃO/INDICADORES DE CAMPOS ENTRADA -  
"INSTRUÇÃO" 
NÚMERO MAX 
DE 
CARACTERES 
NÚMEROS 
DECIMAIS  TIPO  FORMATO 
agencia 5  Numérico  Agência Cobrança 
conta 9  Numérico Conta Cobrança 
numeroDoBoleto 15  Numérico N° do Boleto 
seuNumero 10  String Seu Número 
ALTERAÇÃO DE DATA (alteracaoData) 
dadosInstrucao.indicadorNovaDataVencimento 1  String "S" (SIM) OU "N" (NAO) 
dadosInstrucao.novaDataVencimento 10  String Formato: AAAA-MM-DD 
ALTERAÇÃO DE VALOR (alteracaoValor) 
dadosInstrucao.indicadorNovoValorNominal 1  String "S" (SIM) OU "N" (NAO) 
dadosInstrucao.novoValorNominal 17 2 Númerico Formato: 0.00 
CONCEDER DESCONTO ( ConcederDesconto) 
dadosInstrucao.indicadorConcederDesconto 1  String "S" (SIM) OU "N" (NAO) 
dadosInstrucao.tipoDesconto 1  String "V"(VALOR) ou "P" (Percentual) 
dadosDesconto 
dadosDesconto.valorDesconto (1) 17 2 Númerico Formato: 0.00 
dadosDesconto.percentualDesconto  (1) 6 2 Númerico Formato: 0.00 
dadosDesconto.dataDesconto  (1) 10  String Formato: AAAA-MM-DD 
dadosDesconto.valorDesconto (2) 17 2 Númerico Formato: 0.00 
dadosDesconto.percentualDesconto  (2) 6 2 Númerico Formato: 0.00 
dadosDesconto.dataDesconto  (2) 10  String Formato: AAAA-MM-DD 
dadosDesconto.valorDesconto (3) 17 2 Númerico Formato: 0.00 
dadosDesconto.percentualDesconto  (3) 6 2 Númerico Formato: 0.00 
dadosDesconto.dataDesconto  (3) 10  String Formato: AAAA-MM-DD 
DISPENSAR DESCONTO (CancelarDesconto) 
dadosInstrucao.indicadorCancelarDesconto 1  String "S" (SIM) OU "N" (NAO) 
CONCEDER DESCONTO POR DIAS CORRIDOS (ConcederDescontoPorDiasCorridos) 
dadosInstrucao.indicadorConcederDescontoPorDiasCorridos 1  String "S" (SIM) OU "N" (NAO) 
dadosInstrucao.tipoDescontoPorDiasCorridos 1  String "V"(VALOR) ou "P" (Percentual) 
dadosInstrucao.ValorDescontoPorDiasCorridos 17  Númerico Formato: 0.00 
dadosInstrucao.PercentualDescontoPorDiasCorridos 6  Númerico Formato: 0.00 
PROTESTAR XX DIAS APÓS VENCIMENTO ( protesto) 
dadosInstrucao.indicadorProtestar 1  String "S" (SIM) OU "N" (NAO) 
dadosInstrucao.quantidadeDiasProtesto 2  Númerico N° de Dias ( 1 até 90) 
 
 
 
Restrito Página 15 29/12/2025 
PROTESTAR SEM MAIS CONSULTAS (ProtestarSemMaisConsulta) 
dadosInstrucao.indicadorProtestarSemMaisConsulta 1  String "S" (SIM) OU "N" (NAO) 
SUSTAR PROTESTO (SustacaoProtesto) 
dadosInstrucao.indicadorSustacaoProtesto 1  String "S" (SIM) OU "N" (NAO) 
CANCELAR PROTESTO (CancelarProtesto) 
dadosInstrucao.indicadorCancelarProtesto 1  String "S" (SIM) OU "N" (NAO) 
DISPENSAR ABATIMENTO (DispensarAbatimento) 
dadosInstrucao.indicadorDispensarAbatimento 1  String "S" (SIM) OU "N" (NAO) 
ALTERAÇÃO ABATIMENTO (alteracaoAbatimento) 
dadosInstrucao.indicadorAlterarAbatimento 1  String "S" (SIM) OU "N" (NAO) 
dadosInstrucao.novoValorAbatimento 17 2 Numérico Formato: 0.00 
APLICAR JUROS (juros) 
dadosInstrucao.indicadorCobrarJuros 1  String "S" (SIM) OU "N" (NAO) 
dadosInstrucao.tipoJuros 1  String "V"(VALOR) ou "P" (Percentual) 
dadosInstrucao.valorJuros 17 2 Numérico Formato: 0.00 
dadosInstrucao.taxaJuros 6 2 Numérico Formato: 0.00 
DISPENSAR JUROS (juros) 
dadosInstrucao.indicadorDispensarJuros 1  String "S" (SIM) OU "N" (NAO) 
APLICAR MULTA ( multa) 
dadosInstrucao.indicadorCobrarMulta 1  String "S" (SIM) OU "N" (NAO) 
dadosInstrucao.taxaMulta 6 2 Numérico Formato: 0.00 
DISPENSAR MULTA (multa) 
dadosInstrucao.indicadorDispensarMulta 1  String "S" (SIM) OU "N" (NAO) 
NEGATIVAR (negativar) 
dadosInstrucao.indicadorNegativar 1  String "S" (SIM) OU "N" (NAO) 
NÃO NEGATIVAR AUTOMATICAMENTE (NaoNegativarautomaticamente) 
dadosInstrucao.indicadorNaoNegativarautomaticamente 1  String "S" (SIM) OU "N" (NAO) 
EXCLUIR NEGATIVAÇÃO (Excluirnegativacao) 
dadosInstrucao.indicadorExcluirNegativacao 1  String "S" (SIM) OU "N" (NAO) 
ALEGAÇÃO - SACADO NÃO PROCEDE (AlegacaoSacadoNaoProcede) 
dadosInstrucao.indicadorAlegacaoSacadoNaoProcede 1  String "S" (SIM) OU "N" (NAO) 
ALEGAÇÃO - NÃO ACEITA DESCONTO/ABATIMENTO NaoAceitaDescontoAbatimento) 
dadosInstrucao.indicadorNaoAceitaDescontoAbatimento 1  String "S" (SIM) OU "N" (NAO) 
ALEGAÇÃO - NÃO ACEITA PRORROGAÇÃO (NaoProrrogacao) 
 
    
 
dadosInstrucao.indicadorNaoProrrogacao 1  String "S" (SIM) OU "N" (NAO) 
BAIXA AUTOMÁTICA APÓS XX DIAS (BaixarAutomaticamenteApos) 
dadosInstrucao.indicadorBaixarAutomaticamenteApos 1  String "S" (SIM) OU "N" (NAO) 
dadosInstrucao.NumeroDiasBaixa 2  Numérico N° de Dias ( 1 até 60) 
DESCRIÇÃO DE CAMPOS RETORNO (201)  - INSTRUÇÃO  
NÚMERO 
MAX DE 
CARACTERES 
NÚMEROS 
DECIMAIS  TIPO  FORMATO 
numeroDoBoleto 15 
 
Numérico  
seuNumero 10 
 
String  
dataAlt 10 
 
String Formato: AAAA-MM-DD 
horarioAlt 16 
 
String 
Formato: 
HH:MM:SS.MMMMMMM 
 
 
 
 
 
Restrito Página 16 29/12/2025 
Vamos realizar uma chamada ao serviço de Instruções de Boletos para demonstrar o 
funcionamento da consulta e o formato da resposta retornada pela API: 
 
1. Colocar no request.body os dados do boleto.  
2. Gerar um token conforme indicado no passo 7 deste documento e substituir o 
parâmetro header.Authorization ({token_type} {access_token}).  
3. Safra-Correlation-ID: Identificador único da requisição. 
 
 
 
Alteração de Vencimento:  
{ 
 “agencia”: 12400, 
 “conta”: 1011009, 
 “numeroDoBoleto”: 960055337, 
 “seuNumero”: “75955121”,  
 “dadosInstrucao”: { 
  “indicadorNovaDataVencimento”: “S”, 
  “alteracaoData”: { 
   “novaDataVencimento”: “2026-08-13” 
} 
} 
} 
 
A requisição acima retornará um status code e um payload de retorno: 
Status code: 201 
Resultado: sucesso 
{ 
“data”: { 
        “dadosInstrucao”: { 
 “numeroBoleto”: “960055337, 
 “seuNumero”: 75955121”, 
 “dataAlt”: “2025-08-13”, 
 “horarioAlt”: “15:38:33.7576968” 
                  } 
 
} 
} 
 
Status code: 400 
Resultado: Erro de Validação  
{ 
 “code”: “he-error-correlationId”, 
“message”: “Header Safra-Correlation-ID é Obrigatório.” 
} 
Status code: 422 
Resultado: Erro de Validação  
{ 
“code”: “service-error”, 
“message”: “DT.MENOR QUE A ATUAL.” 
} 
Status code: 503 
Resultado: Erro de Serviço  
Status Code: 500 
Resultado: Erro de Processamento da API 
11. Serviço de Baixa de Boletos  
Para o ambiente de sandbox, mantenha o sufixo -hml na URI dos serviços. 
Para o ambiente de produção, remova o sufixo -hml, utilizando a URI correspondente 
ao ambiente oficial. 
A seguir apresentamos as principais informações sobre este serviço e seu 
funcionamento: 
URL Serviço de Baixa de Boletos   
https://api-hml.safranegocios.com.br/gateway/cobrancas-baixa/v1/realizarBaixaBoleto 
MÉTODO: POST 
Para realizar a consulta do registro de boleto, é necessário informar alguns parâmetros 
por meio de query parameters, na requisição:  
• agência: agência do cliente (a mesma utilizada na geração do boleto)  
• conta: conta do cliente (a mesma u 
tilizada na geração do boleto)  
• númeroDoBoleto: Identificação do Título no banco – não se repete (NOSSO NUMERO) 
• seuNumero:  Identificação do Título na Empresa – Ex: Nf, Recibo, etc (SEU NÚMERO) 
Página 17 
29/12/2025 
Restrito 
É possível comandar a baixa, independente da forma de entrada utilizada 
(Safraempresas, arquivo CNAB, API). 
Disponibilidade do Serviço de Comando de Instruções:  
Disponível em dias úteis, no horário das 07h às 20h50 respeitando as premissas: 
 Título de Cobrança Vinculada não pode ter sido registrado na mesma data em que a 
instrução está sendo comandada. 
 É permitido comandar apenas uma Instrução por chamada à API 
As regras de preenchimento e validação dos campos deste serviço estão 
detalhadas na documentação técnica (swagger) disponível no welcome kit 
fornecida. 
DESCRIÇÃO DE CAMPOS ENTRADA – BAIXA 
(dadosBaixa) 
NÚMERO MAX 
DE 
CARACTERES  
NÚMEROS 
DECIMAIS  
agencia 
5  
TIPO  
FORMATO  
Numérico 
Agência Cobrança 
conta 
numeroDoBoleto 
seuNumero 
BAIXAR BOLETO     
9  
15  
10  
Numérico  
Numérico 
String 
Conta Cobrança  
N° do Boleto  
Seu Número  
dadosBaixa.indicadorBaixaBoleto 1  String "S" (SIM) OU "N" (NAO) 
DESCRIÇÃO DE CAMPOS RETORNO (201)  - 
"BAIXA" 
NÚMERO MAX 
DE 
CARACTERES  
NÚMEROS 
DECIMAIS  
numeroDoBoleto 
seuNumero 
dataBaix 
horarioBaix 
15 
10 
10 
16 
TIPO  
FORMATO  
Numérico  
String  
String 
String 
Formato: AAAA-MM-DD 
Formato: HH:MM:SS.MMMMMMM 
Vamos realizar uma chamada ao serviço de Baixa de Boletos para demonstrar o 
funcionamento da consulta e o formato da resposta retornada pela API: 
1. Colocar no request.body os dados do boleto.  
2. Gerar um token conforme indicado no passo 7 deste documento e substituir o 
parâmetro header.Authorization ({token_type} {access_token}).  
3. Safra-Correlation-ID: Identificador único da requisição. 
Requisição de Baixa:  
{ 
Página 18 
29/12/2025 
Restrito 
 
 
 
Restrito Página 19 29/12/2025 
“agencia”: 12400 
“conta”: 1011009, 
“NumerodoBoleto”: 960055337, 
“seuNumero”: “75955121”, 
“dadosBaixa”: { 
 “indicadorBaixaBoleto”: “S” 
                  } 
} 
 
A requisição acima retornará um status code e um payload de retorno: 
Status code: 201 
Resultado: sucesso 
{ 
“data”: { 
        “dadosBaixa”: { 
 “numerodoBoleto”: “960055337, 
 “seuNumero”: 75955121”, 
 “dataBaix”: “2025-08-13”, 
 “horarioBaix”: “16:44:53.3799218” 
                  } 
} 
} 
 
Status code: 400 
Resultado: Erro de Validação  
{ 
 “code”: “he-error-correlationId”, 
 “message”: “Header Safra-Correlation-ID é Obrigatório.” 
} 
 
Status code: 422 
Resultado: Erro de Negócio 
{ 
 “code”: “service-error”, 
 “message”: “NÃO PERMITIDO TITULO EM CARTORIO” 
} 
 
Status code: 503 
Resultado: Erro de Serviço  
 
Status Code: 500 
Resultado: Erro de Processamento da API 
12. Serviço de Consulta de Boletos 
Para o ambiente de sandbox, mantenha o sufixo -hml na URI dos serviços. 
Para o ambiente de produção, remova o sufixo -hml, utilizando a URI correspondente 
ao ambiente oficial. 
A seguir apresentamos as principais informações sobre este serviço e seu 
funcionamento: 
URL Serviço de Consulta de Boletos 
https://api-hml.safranegocios.com.br/gateway/cobrancas-consulta/v1/consultarBoleto -  
MÉTODO: GET 
Para realizar a consulta de boleto, é necessário informar alguns parâmetros por meio 
de query parameters, na requisição:  
• agência: agência do cliente (a mesma utilizada na geração do boleto)  
• conta: conta do cliente (a mesma u 
tilizada na geração do boleto)  
• númeroDoBoleto: Identificação do Título no banco – não se repete (NOSSO NUMERO) 
• seuNumero:  Identificação do Título na Empresa – Ex: Nf, Recibo, etc (SEU NÚMERO) 
As regras de preenchimento e validação dos campos deste serviço estão 
detalhadas na documentação técnica (swagger) disponível no welcome kit 
fornecida. 
DESCRIÇÃO/INDICADORES 
DE CAMPOS ENTRADA -  
"INSTRUÇÃO" 
NÚMERO MAX DE 
CARACTERES  
NÚMEROS 
DECIMAIS  
TIPO  
FORMATO  
agencia 
conta 
5  
9  
Numérico  
Numérico 
Agência Cobrança (obrigatório) 
Conta Cobrança  (obrigatório) 
numeroDoBoleto 
seuNumero 
15  
10  
Numérico 
String 
N° do Boleto  (obrigatório) 
Seu Número  (obrigatório) 
CAMPO RETORNO 201 
Dados do Pagador     
Nome completo 
CPF/CNPJ do Pagador 
Tipo Pessoa Pagador 
30  
15  
1  
String  
String  
String 
Página 20 
Formato esperado:  "J" - Juridica e "F"- Fisica 
29/12/2025 
Restrito 
 
 
 
Restrito Página 21 29/12/2025 
E-mail 50  String Caso a informação não seja fornecida, será retornado o 
valor nulo. 
Celular 15  String Caso a informação não seja fornecida, será retornado o 
valor nulo. 
Endereço 40  String  
Cidade 20  String  
Estado 2  String  
CEP 8  String  
Dados do Boleto     
Envio Eletrônico  1  String Formato esperado: S - Sim ou N - Não 
Celular para envio 15  String Caso a informação não seja fornecida, será retornado o 
valor nulo. 
Email para envio 50  String Caso a informação não seja fornecida, será retornado o 
valor nulo. 
Espécie 25  String Exemplo: “DUPLICATA MERCANTIL 
Tipo de Cobrança 20  String 
Formato de Descrição:  
"VINCULADA" 
" SIMPLES" 
Valor do Boleto 17  Number Sendo: 15 (inteiros) 2 (decimais) 
Data de Vencimento  10  String Formato esperado: DD-MM-AAAA 
Numero do Documento  10  String  
Situação  90  String 
Formato de Descrição:  
Em aberto  
Baixado  
Baixado Pix 
Liquidado 
Protestado em XX/XX/XXXX 
Sustado o protesto 
Enviado p/ cart. 
Nosso Número  15  Number  
Forma de recebimento 30  String 
Formato da Descrição:  
"Não aceita valor divergente" ou "Aceita valor 
divergente" 
Agência cobrança 30  String  
Data emissão 10  String Formato esperado: DD-MM-AAAA 
Data operação 10  String Formato esperado: DD-MM-AAAA 
Abatimento 17  Number Sendo: 15 (inteiros) 2 (decimais) 
Data juros 10  String 
Formato esperado: DD-MM-AAAA 
Caso a informação não seja fornecida, será retornado o 
valor nulo. 
Juros (tipo) 15  String 
Formato de Descrição: "Percentual"  
Caso a informação não seja fornecida, será retornado o 
valor nulo. 
Valor do Juros 17  Number Sendo: 15 (inteiros) 2 (decimais) 
 
 
 
Restrito Página 22 29/12/2025 
Data multa 10  String 
Formato de Descrição: "Percentual"  
Caso a informação não seja fornecida, será retornado o 
valor nulo. 
Multa (tipo) 15  String 
Formato de Descrição: "Percentual"  
Caso a informação não seja fornecida, será retornado o 
valor nulo. 
Valor da Multa 17  Number Sendo: 15 (inteiros) 2 (decimais) 
Protesto 30  String 
Formato de Descrição: "XX dias após vencimento" 
Caso a informação não seja fornecida, será retornado o 
valor nulo. 
Tipo de Desconto  30  String 
Possíveis Descrições:  
Valor até a data 
Percentual até a data 
Valor por dias corridos 
Percentual por dias corridos 
Caso a informação não seja fornecida, será retornado o 
valor nulo. 
Data de Desconto 1 10  String 
Formato de Descrição: "DD-MM-AAAA" 
Caso a informação não seja fornecida, será retornado o 
valor nulo. 
Valor de desconto 1 17  Number Sendo: 15 (inteiros) 2 (decimais) 
Data de Desconto 2 10  String 
Formato de Descrição: "DD-MM-AAAA" 
Caso a informação não seja fornecida, será retornado o 
valor nulo. 
Valor de desconto 2 17  Number Sendo: 15 (inteiros) 2 (decimais) 
Data de Desconto 3 10  String 
Formato de Descrição: "DD-MM-AAAA" 
Caso a informação não seja fornecida, será retornado o 
valor nulo. 
Valor de desconto 3 17  Number Sendo: 15 (inteiros) 2 (decimais) 
Baixa 30  String 
Formato de Descrição: "XX dias após vencimento" 
Caso a informação não seja fornecida, será retornado o 
valor nulo. 
Tipo do documento - 
Beneficiário Final/Sacador 
avalista 
1  String 
Formato esperado: "J" Jurídica / "F" Física  
Caso a informação não seja fornecida, será retornado o 
valor nulo. 
Nro doc CPF_CNPJ - 
Beneficiário Final/Sacador 
avalista 
15  String  
Nome sacador Avalista/ 
Beneficiário Final 50  String Caso a informação não seja fornecida, será retornado o 
valor nulo. 
Data de liquidação 10  String 
Formato de Descrição: "DD-MM-AAAA" 
Caso a informação não seja fornecida, será retornado o 
valor nulo. 
CPF/CNPJ do portador 15  String Caso a informação não seja fornecida, será retornado o 
valor nulo. 
 
 
 
Restrito Página 23 29/12/2025 
Nome do portador 50  String Caso a informação não seja fornecida, será retornado o 
valor nulo. 
Código de barras 44  String  
IDDDA 19  String 
Número único de identificação DDA 
Caso a informação não seja fornecida, será retornado 
valor nulo. 
IUP 20  String  
“copia e cola” 200 (tamanho 
variável) 
 String Caso a informação não seja fornecida, será retornado o 
valor nulo. 
Mensagem do beneficiário    Limitado até 11 linhas 
Tipo de mensagem   Number  
Mensagem   String  
Instruções/Ocorrências    Limitado as últimas 5 instruções 
Data   String Formato esperado: DD-MM-AAAA 
Responsável   String  
Descrição da Instrução   String  
 
  
Vamos realizar uma chamada ao serviço de Consulta de Boletos para demonstrar o 
funcionamento da consulta e o formato da resposta retornada pela API: 
 
1. Colocar no request.body os dados do boleto.  
2. Gerar um token conforme indicado no passo 7 deste documento e substituir o 
parâmetro header.Authorization ({token_type} {access_token}).  
3. Safra-Correlation-ID: Identificador único da requisição. 
 
Requisição de Consulta de um Boleto:  
{  
"agencia": 12400, 
"conta": 1011009, 
"numeroDoBoleto”: "960058573",  
               "seuNumero": "999999" 
} 
A requisição acima retornará um status code e um payload de retorno: 
Status code: 201 
Resultado: sucesso 
{ 
“data”: { 
 “dadosConsulta”: { 
  “dadosPagador”: { 
   “nomeCompleto”: “Cliente Teste”,  
   “cpfCNPJ”: “000002711590739”,  
   “tipoPessoa”: “F”, 
 
 
 
Restrito Página 24 29/12/2025 
   “email”: “cliente_teste@luxafit.com.br”,  
   “cellular”: null, 
   “endereco”: “Tv we 9”,  
   “cidade”: “BELEM”,  
   “estado”: ”PA”, 
   “CEP”: “66670230” 
  }, 
  “dadosBoleto”: { 
   “envioEletronico”: “N”, 
   “celularEnvio”: null, 
   “emailEnvio”: “cliente_teste@luxafit.com.br”, 
   “especie”: “DUPLICATA MERCANTIL”,  
   “tipoCobranca”: “SIMPLES”,  
   “valorBoleto”: “100,00”, 
   “dataVencimento”: “25/09/2025”,  
   “numeroDocumento”: “65706487”, 
   “situacao”: “BAIXADO EM 25/08/2025”,  
   “nossoNumero”: “960058573, 
   “formaRecebimento”: “NÃO ACEITA VALOR DIVERGENTE”,  
   “agenciaCobranca”: “0004800BELEM”, 
   “dataEmissao”: “21/08/2025”, 
   “dataOperacao”: “21/08/2025”, 
   “valorAbatimento”: 10, 
   “dataJuros”: “26/09/2025”, 
   “tipojuros”: “Percentual”,  
   “taxaJuros”: 1,  
   “dataMulta”: “26/09/2025”, 
   “tipoMulta”: “Percentual”, 
   “taxaMulta”: 0.99, 
   “protesto”: “026 DIAS APÓS VENCIMENTO”,  
   “tipoDesconto”: “PERCENTUAL ATÉ DATA”,  
   “dataDesconto1”: 10/09/2025”, 
   “valorDesconto1”: 10.97, 
   “dataDesconto2”: 11/09/2025”, 
   “valorDesconto2”: 11.98, 
   “dataDesconto3”: 12/09/2025”, 
   “valorDesconto3:” 12.99, 
   “baixa”: “060 DIAS APÓS VENCIMENTO”,   
   “codigoDeBarras”: “42297121100000100007097000058346069600585732”, 
   “identificadorDDA”: “3025082101202423929”, 
   “iup”: “ “ 
  }, 
  “dadosSacadorAvalista”: { 
   “tipoPessoaSacadorAvalista”: null, 
   “cpfCnpjSacadorAvalista”: “000000000000000” 
   “nomeSacadorAvalista”: null 
  }, 
  “dadosLiquidacaoBaixado”: { 
   “dataLiquidacaoBaixa”: “25/08/2025”, 
   “cpfCnpjPortador”: null 
   “nomePortador”: null 
 
 
 
Restrito Página 25 29/12/2025 
  }, 
“codigoCopiaECola”: { 
“copiaECola”: “00020126770014br.gov.bcb.pix2555pix-h.safra.com.brPAULO620705038886304F55B”   
  }, 
  “mensagemBeneficiario”: [ ], 
  “instrucoesOcorrencias”: [ 
   { 
   “data”: “21/08/2025”,  
   “responsável”: “09700”, 
   “descricaoInstrucao”: “EMIS 2ª VIA BOLETO A VENCER” 
              }, 
 
Status code: 400 
Resultado: Erro de validação 
{ 
 “code”: “rest-400”, 
 “message”: “Ocorreu um ou mais erros por problemas de sintaxe.”, 
 “details”: “A requisição ou algum campo na requisição está com o tipo incorreto.”,  
 “fields”: [ 
  {  
   “name”: “numeroDoBoleto”,  
   “message”: “O valor deve estar entre 8 e 999999999999999”, 
   “value”: “ “ 
  } 
 ] 
} 
 
 
Status code: 422 
Resultado: Erro de Negócio 
{ 
 “code”: “business-validation”, 
 “message”: “TITULO INEXISTENTE”, 
} 
 
 
Status code: 503 
Resultado: Erro de Serviço 
 
Status Code: 500 
Resultado: Erro de processamento da API 