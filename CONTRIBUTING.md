# Guia de contribuição

## Fluxo de branches (git flow)

```mermaid
gitGraph
   commit id: "v2.0.0"
   branch develop
   checkout develop
   branch feature/nova-funcionalidade
   commit
   commit
   checkout develop
   merge feature/nova-funcionalidade
   branch release/2.1.0
   commit id: "versão 2.1.0"
   checkout main
   merge release/2.1.0 tag: "v2.1.0"
   checkout develop
   merge release/2.1.0
```

### Nova funcionalidade

```bash
git checkout develop && git pull
git checkout -b feature/nome-curto
# ... commits ...
git push -u origin feature/nome-curto
# abra um pull request para a develop; a CI precisa passar
```

### Nova versão

```bash
git checkout develop && git pull
git checkout -b release/X.Y.Z
npm version X.Y.Z --no-git-tag-version   # atualiza package.json e package-lock.json
# registre as mudanças no CHANGELOG.md
git commit -am "Prepara a versão X.Y.Z"
git push -u origin release/X.Y.Z
```

Abra um pull request de `release/X.Y.Z` para a `main` e faça o merge quando a CI
passar. O merge é o único passo manual: o workflow de **Release** cria a tag `vX.Y.Z`,
a release no GitHub e a imagem no GHCR, traz a `main` de volta para a `develop` e apaga
a branch `release/X.Y.Z`.

### Correção urgente em produção

```bash
git checkout main && git pull
git checkout -b hotfix/X.Y.Z
# ... correção ...
npm version X.Y.Z --no-git-tag-version
git commit -am "Corrige ..."
git push -u origin hotfix/X.Y.Z
```

Abra o pull request de `hotfix/X.Y.Z` para a `main`; o restante é igual ao da versão.

### Executar a entrega manualmente

Em **Actions > Release > Run workflow**. A execução é idempotente: só cria as tags e
releases que faltam e só apaga branches já integradas.

## Antes de abrir um pull request

```bash
npm run lint
npm run test:coverage
npm run build
```

As três verificações também rodam na CI e precisam passar.

## Padrão de código

O código segue o padrão de programação da Agiw ([docs/padroes](docs/padroes)):

- variáveis com prefixo do tipo: `s` texto, `i` inteiro, `n` decimal, `b` booleano,
  `a` vetor, `o` objeto e `dt` data (`sCodConta`, `aMovimentos`, `bConciliado`);
- funções em camelCase iniciadas por verbo e com comentário de fechamento
  (`} // nomeDaFuncao`);
- classes e componentes em PascalCase e constantes em MAIÚSCULAS;
- tabelas no formato `TBXXXX999` e colunas com prefixo do papel (`COD`, `DES`, `DAT`,
  `VAL`, `NUM`, `TIP`, `STA`, `QTD`);
- valores monetários comparados em centavos inteiros;
- validações sempre antes de iniciar a gravação.

## Mensagens de commit

Escritas em português, no imperativo, com uma primeira linha curta que diga o que
muda ("Adiciona filtro por campo na grade do banco") e, quando necessário, um corpo
explicando o porquê.
