# Solicitação — Habilitação da API de Extrato (Banco Safra)

Projeto Banco · Ticket 37060 · Módulo Conciliação Bancária

> **Como usar este documento**
>
> A **Parte 1** é o e-mail para enviar à Agiw. A **Parte 2** é o anexo técnico,
> que a Agiw encaminha ao gerente de relacionamento do Safra. A **Parte 3** é a
> evidência dos testes, caso peçam comprovação.
>
> ⚠️ **Não inclua a senha de integração em e-mail.** O `client_id` identifica a
> credencial e pode ser citado; a senha, não.

---

## Parte 1 — E-mail para a Agiw

**Para:** gabriel.ramos@agiw.com.br
**Cópia:** tadeu@agiw.com.br · arnold@agiw.com.br
**Assunto:** Ticket 37060 — Solicitação de habilitação da API de Extrato do Banco Safra

---

Prezados, bom dia.

Sobre o módulo de Conciliação Bancária (Ticket 37060), concluímos a integração
com o Banco Safra até o limite do material disponibilizado, e precisamos de uma
liberação junto ao banco para seguir.

**O que já está funcionando**

Com as credenciais recebidas, a autenticação OAuth 2.0 opera normalmente no
ambiente de homologação, e as quatro rotas de cobrança do *Kit Welcome API COB
V3.0* respondem corretamente: consulta de registro, consulta detalhada, baixa e
instrução de boleto.

**O que está bloqueado**

A conciliação bancária depende do **extrato de conta corrente** — a relação de
movimentos do período, com data, histórico, valor e sentido (crédito/débito).
Esse serviço **não faz parte do kit recebido**, que cobre exclusivamente
Cobrança. A chamada ao endpoint de extrato retorna **HTTP 404** para o nosso
`client_id`, indicando que o produto não está habilitado.

**Por que não é possível contornar**

Avaliamos usar as rotas de cobrança como substituto e não é viável, por duas
razões objetivas:

1. Todos os endpoints do kit exigem o **número do boleto como parâmetro
   obrigatório** e devolvem **um único registro**. Não existe listagem nem
   filtro por período — não há como perguntar "quais movimentos ocorreram
   entre 01/11 e 30/11".
2. Mesmo consultando boleto a boleto, o retorno cobriria apenas os títulos
   emitidos por nós. O extrato contém TED, PIX, tarifas, pagamentos a
   fornecedores e transferências, que não transitam pela API de Cobrança.

**O que solicitamos**

Que seja aberto chamado junto ao **gerente de relacionamento do Banco Safra**
para habilitação da **API de Conta Corrente / Extrato** para as credenciais já
em uso. O anexo técnico a seguir traz exatamente o que precisamos receber do
banco.

Enquanto a liberação não ocorre, o módulo segue operando para o Safra por
**importação de arquivo OFX** do Safra Empresas, funcionalidade já implementada
e prevista no item 6.1.3.3 do documento de visão. É um contorno manual, mas não
impede a homologação das demais funcionalidades.

Ficamos à disposição para participar do contato técnico com o banco.

Atenciosamente,

---

## Parte 2 — Anexo técnico (encaminhar ao Banco Safra)

**Assunto:** Habilitação da API de Conta Corrente / Extrato — cliente Agiw Sistemas

### Identificação

| Campo | Valor |
| --- | --- |
| Cliente | Agiw Sistemas Ltda |
| Produto já habilitado | Cobrança API (Emissão Direta) — Kit Welcome API COB V3.0 |
| `client_id` em uso | `68cb0348d932a7f830e68614` |
| Ambiente atual | Homologação — `https://api-hml.safranegocios.com.br` |
| Agência / Conta | _(preencher com a agência e conta reais)_ |

### Solicitação

Habilitação da **API de Conta Corrente / Extrato** para o `client_id` acima,
com a finalidade de obter a movimentação da conta por período e viabilizar a
conciliação bancária automatizada.

### Informações necessárias para concluir a integração

1. **Confirmação da habilitação** do produto para o `client_id` informado.
2. **URI completa do endpoint de extrato**, em homologação e em produção.
   Atualmente testamos `/gateway/contacorrente/v1/extrato`, que retorna
   **404** — favor confirmar o caminho correto.
3. **Contrato do serviço** (swagger ou manual): parâmetros de entrada
   (especialmente o formato esperado das datas) e estrutura da resposta.
4. **Se há credencial ou escopo distintos** do já utilizado em Cobrança. Em
   caso positivo, solicitamos a geração das novas credenciais.
5. **Agência e conta de teste em homologação que possuam movimento**, além do
   **período** em que há dados disponíveis — para validarmos a integração
   ponta a ponta.
6. **Limites operacionais**: janela máxima de dias por consulta, paginação e
   limite de requisições.

### Observação técnica

Identificamos uma divergência entre o manual e os arquivos swagger do welcome
kit, que pode gerar dúvida em outras integrações:

| Serviço | Swagger do kit (`servers`) | Manual v3.0 (item 6) | Verificado na API |
| --- | --- | --- | --- |
| Baixa de boleto | `/gateway/cobrancas/v1/...` | `/gateway/cobrancas-baixa/v1/...` | **manual correto** — swagger retorna 404 |
| Instrução | `/gateway/cobrancas/v1/...` | `/gateway/cobrancas-instrucao/v1/...` | **manual correto** |
| `indicadorBaixaBoleto` | enum numérico `[0,1]` | string `"S"` / `"N"` | **manual correto** |

Sugerimos a atualização dos arquivos swagger do kit.

### Contatos do banco

| Canal | Contato |
| --- | --- |
| Mesa de Implantação | (11) 3175-4790 · 0300 371 4602 |
| E-mail | mesa.implantacao@safra.com.br |
| Central de Suporte PJ | (11) 3175-8248 · 0300 015 7575 |
| Atendimento | 2ª a 6ª, das 9h às 18h |

Conforme o item 5 do manual, a abertura do chamado deve partir do **gerente de
relacionamento** do cliente.

---

## Parte 3 — Evidências dos testes

Testes executados contra `https://api-hml.safranegocios.com.br`.

### Funcionando

| Serviço | Método e caminho | Retorno |
| --- | --- | --- |
| Autenticação | `POST /gateway/v1/oauth2/token` | **200** — token JWT emitido |
| Consulta de registro | `GET /gateway/cobrancas/v1/boletos` | **200** — dados do boleto |
| Consulta detalhada | `GET /gateway/cobrancas-consulta/v1/consultarBoleto` | rota alcançada e autenticada |
| Baixa | `POST /gateway/cobrancas-baixa/v1/realizarBaixaBoleto` | **422** `TITULO INEXISTENTE` |
| Instrução | `PUT /gateway/cobrancas-instrucao/v1/realizarInstrucaoBoleto` | **422** `TITULO INEXISTENTE` |

O retorno **422** confirma que a requisição foi autenticada e teve o formato
aceito, parando apenas na regra de negócio — esperado, por não existir o boleto
de teste na base de homologação.

### Bloqueado

| Serviço | Método e caminho | Retorno |
| --- | --- | --- |
| Extrato de conta corrente | `GET /gateway/contacorrente/v1/extrato` | **404** — produto não habilitado |

### Por que a Cobrança não substitui o extrato

Parâmetros de `GET /gateway/cobrancas/v1/boletos`, conforme o swagger do kit:

```
agencia        obrigatório
conta          obrigatório
numero         obrigatório    ← nosso número de um boleto específico
numeroCliente  obrigatório    ← seu número
```

A resposta é um objeto único (`consulta_boleto`), não uma coleção. Não há
parâmetro de data nem de paginação: a consulta é unitária e exige conhecer
previamente o boleto.

---

## Situação do módulo

| Banco | Extrato | Situação |
| --- | --- | --- |
| Bradesco | API | Operando (sandbox, mTLS) |
| **Safra** | — | **Aguardando habilitação do produto Conta Corrente** |
| Itaú | — | Aguardando documentação e credenciais |
| Banco do Brasil | — | Aguardando documentação e credenciais |

Para o Safra, a importação por arquivo **OFX / CSV / TXT** está implementada e
disponível, atendendo ao item 6.1.3.3 do documento de visão enquanto a API não
é liberada.
