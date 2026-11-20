# Changelog

As versões seguem o [versionamento semântico](https://semver.org/lang/pt-BR/).

## [2.3.0] - 2026-11-20

### Adicionado
- Base de teste local: `npm run db:teste` cria o banco `BDCONCILIACAO_TESTE` com as
  tabelas do ERP usadas pelo módulo e dados de demonstração (contas Itaú e Safra,
  usuário com permissões, lançamentos e extrato de outubro/2026). Só aceita bancos
  com TESTE no nome; `--recriar` começa do zero.
- `.env.teste.example` com a configuração pronta para a base de teste.
- README: execução local do projeto, requisitos não funcionais definidos pelo
  cliente com as fontes e passo a passo para rodar com a base de teste.

### Alterado
- Monografia revisada, com o capítulo de implantação detalhado.

## [2.2.1] - 2026-11-18

### Corrigido
- O workflow de release não para mais quando o GitHub recusa a tag de uma versão
  antiga: a recusa vira aviso com o comando para criá-la. Releases, imagem,
  sincronização da `develop` e limpeza de branches rodam sempre e só fazem o que
  falta, então o workflow pode ser executado de novo a qualquer momento.

### Alterado
- `docker/setup-buildx-action` v4 e `docker/metadata-action` v6.
- Dependabot deixa de propor trocas de versão principal de qualquer pacote npm.

## [2.2.0] - 2026-11-18

### Adicionado
- Entrega automatizada: a cada merge na `main`, a pipeline cria a tag da versão, a
  release no GitHub e a imagem no GHCR, sincroniza a `develop` e apaga as branches
  já integradas.

### Alterado
- Prisma 7.10.1 e driver `mssql` 12.7.14.
- GitHub Actions atualizadas: checkout v7, setup-node v7, upload-artifact v7,
  login-action v4 e build-push-action v7.
- Dependabot deixa de propor trocas de versão principal do Next.js, React e ESLint.

## [2.1.2] - 2026-11-18

### Alterado
- O workflow de release volta a disparar no push da tag de versão (`vX.Y.Z`),
  como definido no fluxo do git flow.

## [2.1.1] - 2026-11-18

### Alterado
- O workflow de release passa a disparar na publicação de uma release do GitHub,
  que cria a tag da versão. Assim a versão pode ser publicada pelo próprio site.

## [2.1.0] - 2026-11-18

### Adicionado
- Testes automatizados com Vitest: algoritmo de soma de subconjuntos, conciliação
  automática, regras da tela, adaptadores dos bancos, relatórios e rotas da API.
- Endpoint `/api/health`, com verificação opcional do SQL Server.
- Imagem Docker multi-stage com usuário sem privilégios e `HEALTHCHECK`, e
  `docker-compose.yml`.
- Pipeline de CI (lint, testes com cobertura mínima, build e teste de fumaça da
  imagem) e de release (imagem no GHCR e release no GitHub).
- Dependabot, `.editorconfig`, `.nvmrc` e configuração do ESLint.
- Monografia, diagramas UML e capturas de tela em `docs/`.
- README, guia de contribuição e template de pull request.

### Alterado
- Documentação organizada em monografia, requisitos, atas, padrões, diagramas e telas.

### Removido
- Documentos sem uso, a ata vazia e o kit confidencial do Banco Safra.

## [2.0.1] - 2026-11-18

### Segurança
- A URL de conexão do Prisma CLI deixa de ficar escrita no `prisma.config.ts` e
  passa a ser lida de `DATABASE_URL`.

## [2.0.0] - 2026-10-22

### Adicionado
- Módulo de conciliação bancária sobre as tabelas do ERP Satis no SQL Server.
- Integração com Itaú, Bradesco, Banco do Brasil e Safra.
- Conciliação manual e automática (1:1, N:1, 1:N e N:N), estorno, lançamentos,
  transferências, bloqueio de período, relatórios e auditoria.
- Solicitações da ata de 24/09/2026.
