# Deploy AWS — guia de entrada

> Este arquivo é mantido como ponto de entrada. O procedimento atualizado para criar uma instalação independente está em [`TUTORIAL-REPLICAR-AWS.md`](TUTORIAL-REPLICAR-AWS.md). Não use instruções antigas de acesso direto pela porta 3000 que possam aparecer em cópias ou links anteriores.

## Arquitetura atual

A instalação de referência usa uma EC2 Amazon Linux 2023, Docker Compose (Next.js + MySQL), Nginx nas portas 80/443, porta 3000 acessível apenas em loopback, Security Group sem entrada pública para 3000 ou 3306, Elastic IP, CloudWatch Agent/alarms e backup diário do MySQL para S3. O HTTPS do AWS Academy usa certificado autoassinado.

## Publicar na conta de referência

O template IaC fica em [`../infra/cloudformation.yml`](../infra/cloudformation.yml). Ele cria EC2, Security Group, Elastic IP e alarmes, mas não cria bucket S3 nem `.env`; siga o tutorial para criar esses recursos e executar o bootstrap com o bucket individual e CIDR SSH restrito.

Depois do bootstrap, configure `.env` fora do Git e inicialize o banco:

```bash
cd /home/ec2-user/conciliacao-agiw
docker compose up -d --build
docker compose exec app node scripts/init-db.mjs
curl -k -i https://127.0.0.1/api/health
```

## CI/CD

O CI valida push em qualquer branch e Pull Request para `main`. O CD dispara em push para `main` ou `projeto-nuvem-glauco` e por execução manual. Ele usa um único destino (`EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY`, `EC2_APP_DIR`); as outras contas usam o deploy manual descrito no tutorial. O health check externo do CD é informativo; confirme `/api/health` na instância e no endereço público.

## Documentos canônicos

- [Tutorial para reproduzir nas cinco contas](TUTORIAL-REPLICAR-AWS.md)
- [Checklist, arquitetura, operações, custos e diferenças para produção](AWS-PRODUCTION-READINESS.md)
- [Arquivos IaC e scripts de infraestrutura](../infra/README.md)
- [README do projeto](../README.md)
