Gateway de Pagamentos
O que é
O Gateway de Pagamentos é a infraestrutura central da Safrapay que conecta o estabelecimento comercial aos meios de pagamento — bandeiras de cartão, adquirentes, PIX e boleto — de forma segura e padronizada.

Na prática, o gateway atua como intermediário entre a sua loja (site, app ou sistema) e o ecossistema financeiro:

Participante	Papel no fluxo
Estabelecimento	Vende o produto ou serviço e solicita a cobrança
Gateway Safrapay	Recebe a solicitação, aplica regras de negócio (antifraude, proteção de dados do cartão e autenticação do comprador) e encaminha à adquirente
Adquirente	Processa a transação junto às bandeiras e instituições financeiras
Emissor	Banco ou instituição que emitiu o cartão do comprador; autoriza ou recusa a operação
O resultado — aprovado, negado, pré-autorizado ou pendente — retorna ao estabelecimento em tempo real, com o status consolidado da cobrança e de cada pagamento que a compõe.

Antes de processar pagamentos, o estabelecimento precisa estar credenciado na plataforma.

Conceitos principais
Cobrança e pagamento
Uma cobrança representa o pedido de pagamento do estabelecimento — por exemplo, um pedido de e-commerce identificado pelo número do pedido no seu sistema. Dentro dela pode haver um ou mais pagamentos, cada um vinculado a um meio (cartão, PIX, boleto).

O gateway consolida o status geral da cobrança e o detalhe de cada pagamento, facilitando a conciliação com o seu sistema de gestão ou plataforma.

Cliente (comprador)
O cliente é o comprador final. É possível cadastrá-lo previamente na plataforma ou enviar seus dados junto com a cobrança. O cadastro antecipado é recomendado quando você utiliza Cartão Protegido (cofre de cartões) ou deseja enriquecer a análise de Antifraude.

Cada estabelecimento enxerga apenas os clientes que ele próprio cadastrou.

Identificadores
Número da cobrança: identificador único gerado pela Safrapay para cada pedido de pagamento.
Número sequencial da operação: outro identificador interno da Safrapay, útil para consultas e acompanhamento.
Código de autorização: retornado pela adquirente quando o cartão é aprovado.
Como funciona
Fluxo geral de uma transação
Início: O comprador escolhe o meio de pagamento e confirma a compra no site ou aplicativo do estabelecimento.
Solicitação: O sistema do estabelecimento envia a cobrança ao gateway Safrapay.
Validações: O gateway valida os dados, aplica antifraude (quando contratado), proteção dos dados do cartão e autenticação do comprador (quando exigida).
Encaminhamento: O pagamento segue para a adquirente e, em seguida, para o banco emissor do cartão ou para o meio escolhido (PIX, boleto).
Resposta: O gateway retorna o resultado com status, códigos de autorização e demais informações da cobrança.
Notificação (recomendado): Eventos como confirmação de PIX, conclusão de débito no cartão ou devolução de valor podem ser recebidos automaticamente via Webhook, sem precisar consultar o status manualmente a todo momento.
Meios de pagamento suportados
Meio	Descrição resumida	Saiba mais
Cartão de crédito	À vista ou parcelado (Visa, Mastercard, Elo, Amex e demais bandeiras habilitadas)	Esta página
PIX	Pagamento instantâneo via QR Code dinâmico	PIX
Boleto bancário	Emissão de boleto registrado com vencimento configurável	Boleto
Link de pagamento	Cobrança compartilhável por link (sem checkout próprio)	Link de Pagamentos
PIX e boleto são processados pela mesma plataforma de pagamentos do gateway, cada um com seu fluxo específico. A confirmação de pagamento depende de Webhook ou da consulta do status da cobrança.

No Checkout e no Link de Pagamentos, os meios disponíveis são cartão e PIX. O boleto é emitido pela integração direta com o gateway.

Modelos de cobrança com cartão
O gateway oferece diferentes modelos conforme o momento em que o valor é efetivamente debitado do comprador:

Modelo	Quando usar	Comportamento
Captura automática	E-commerce comum (venda na hora)	Autoriza e captura o pagamento em uma única etapa — o valor é debitado na hora
Pré-autorização	Hotéis, locadoras, serviços com valor final incerto	Reserva o limite no cartão sem debitar; a confirmação do valor deve ocorrer em até 30 dias
Reserva com confirmação posterior	Loja que valida o pedido antes de debitar (ex.: análise de estoque)	Reserva o limite e permite confirmar o débito em até 7 dias
Confirmação do valor reservado	Após pré-autorização ou reserva com prazo de 7 dias	Efetiva o débito (total ou parcial) do valor previamente reservado
Na captura automática, não há passo adicional: o pagamento já fica confirmado quando aprovado. Nos demais modelos, o estabelecimento deve confirmar a captura dentro do prazo aplicável — caso contrário, a reserva expira e o limite do cartão é liberado.

Parcelamento
Pagamentos no crédito podem ser parcelados de duas formas:

Tipo	Quem assume os juros	Uso típico
Parcelado pelo lojista	O estabelecimento absorve os juros — o comprador paga o valor total dividido em parcelas iguais	Promoções "sem juros" no site
Parcelado pelo emissor	O banco emissor do cartão cobra juros do comprador	Parcelamento com encargos na fatura
O limite máximo de parcelas depende do perfil comercial do estabelecimento.

Estorno e cancelamento
Na Safrapay, estorno e cancelamento não são sinônimos — a distinção depende do momento e do meio de pagamento:

Operação	Cartão de crédito/débito	PIX
Estorno	Reversão no mesmo dia em que o pagamento foi confirmado, antes da liquidação financeira — apenas valor total	Não segue essa regra de calendário
Cancelamento	Devolução após a liquidação (no dia seguinte ou depois) — pode ser total ou parcial	Devolução total ou parcial a qualquer momento após a confirmação
Para pré-autorizações não confirmadas, a operação apenas anula a reserva de limite — o comprador não chegou a ser debitado.

Devoluções de cartão após a liquidação podem levar algum tempo para serem concluídas pela adquirente. Nesses casos, a Safrapay registra o pedido e confirma o resultado final via Webhook — o ideal é receber essas notificações automaticamente, em vez de ficar consultando o status repetidamente.

Autenticação do comprador (3D Secure)
O 3D Secure adiciona uma etapa de verificação da identidade do portador do cartão, exigida em muitos cenários de e-commerce e reforçada pelas regras do setor de pagamentos.

No fluxo da Safrapay, a autenticação envolve o checkout da loja, o gateway e o banco emissor do cartão. O comprador pode ser validado de forma automática, sem interação, ou precisar confirmar a compra (senha, biometria ou aplicativo do banco).

Quando a autenticação é bem-sucedida, a transação ganha maior nível de confiança, o que tende a aumentar a taxa de aprovação e reduzir o risco de fraude para o estabelecimento.

Proteção dos dados do cartão
O gateway oferece três formas complementares de proteger as informações do cartão:

Produto	O que faz
Cartão Protegido	Cofre digital da Safrapay — guarda cartões de forma segura para recompra e cobranças recorrentes
Tokenização por bandeira	Padrão para a maioria dos estabelecimentos — a Safrapay substitui o número do cartão por um identificador seguro da bandeira (Visa, Mastercard e Elo) antes de processar o pagamento
Network Token	Para parceiros com credenciamento direto junto às bandeiras — o parceiro já envia o cartão tokenizado pela bandeira em cada cobrança
Outros recursos
Antifraude integrado — análise de risco em tempo real; veja Antifraude
Recorrência e planos — assinaturas e cobranças periódicas; veja Recorrência
Notificações automáticas — avisos em tempo real sobre mudanças de status; veja Webhook
Consulta de cobrança — acompanhamento do status pelo número da cobrança, número sequencial da operação ou referência do seu sistema
Lojista em marketplace — identificação do vendedor final em operações com múltiplos estabelecimentos
Consulta de bandeira — verificação da bandeira e tipo do cartão a partir dos primeiros dígitos informados
Quando usar
E-commerce e lojas virtuais: Para aceitar pagamentos online integrados ao seu site ou plataforma.
Marketplaces: Para processar pagamentos de múltiplos vendedores, identificando o lojista de cada venda.
Aplicativos mobile: Para aceitar pagamentos dentro de apps iOS e Android.
Sistemas de gestão e PDV: Para integrar o processamento de pagamentos ao seu sistema.
Cobranças com valor incerto ou entrega posterior: Para reservar limite no cartão e debitar apenas quando o serviço for concluído.
Cobranças recorrentes: Para serviços de assinatura e mensalidades, combinando gateway com Recorrência e Cartão Protegido.
Produtos relacionados
Produto	Relação com o Gateway
Checkout	Tela de pagamento pronta para usar (integrada ao site ou em página da Safrapay)
PIX	Meio de pagamento instantâneo
Boleto	Emissão de boletos registrados
Cartão Protegido	Cofre de cartões para recompra e recorrência
Network Token	Tokenização de cartão pela bandeira
Antifraude	Proteção contra fraudes em transações de cartão
Webhook	Notificações automáticas sobre eventos de cobrança
Recorrência	Planos e assinaturas com cobrança automática
Chargeback	Gestão de contestações de transações de cartão
Para detalhes de integração, referência técnica e exemplos de uso, consulte a documentação técnica do Gateway.

