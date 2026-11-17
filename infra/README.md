# Infraestrutura AWS — Conciliação Bancária

Os passos completos para provisionar, configurar, atualizar e operar a implantação AWS estão concentrados em [`docs/DEPLOY-AWS.md`](../docs/DEPLOY-AWS.md). Este arquivo apenas cataloga os componentes de infraestrutura do projeto.

## Componentes

| Arquivo | Responsabilidade |
|---|---|
| [`cloudformation.yml`](cloudformation.yml) | EC2, Security Group, Elastic IP e alarmes de CPU/status. SSH exige CIDR definido pelo operador; 3000 e 3306 não são expostas. |
| [`setup-ec2.sh`](setup-ec2.sh) | Instala/configura Docker, Nginx, CloudWatch Agent e rotina cron de backup. Exige `BACKUP_S3_BUCKET` do ambiente. |
| [`nginx.conf`](nginx.conf) | Proxy reverso HTTP/HTTPS; TLS autoassinado no AWS Academy. |
| [`cloudwatch-agent.json`](cloudwatch-agent.json) | Logs de app, Nginx e backup; métricas de CPU, memória e disco. |
| [`backup-conciliacao.sh`](backup-conciliacao.sh) | Dump MySQL compactado e upload SSE-S3; exige bucket indicado pelo ambiente. |
| [`restore-conciliacao.sh`](restore-conciliacao.sh) | Restore a partir de arquivo local ou URI `s3://`. O restore substitui os dados do banco configurado. |

## Recursos da implantação de referência

A implantação existente usa o Instance Profile `LabInstanceProfile`, um bucket S3 privado com SSE-S3 e política que exige TLS, retenção S3 de 30 dias e cópia local de 14 dias. O nome do bucket e demais identificadores específicos pertencem a esse ambiente; os scripts não escolhem outro bucket automaticamente.

Para arquitetura, justificativas, checklist e limites do AWS Academy, consulte [`docs/AWS-PRODUCTION-READINESS.md`](../docs/AWS-PRODUCTION-READINESS.md).
