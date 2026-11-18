# Changelog

As versões seguem o [versionamento semântico](https://semver.org/lang/pt-BR/).

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
