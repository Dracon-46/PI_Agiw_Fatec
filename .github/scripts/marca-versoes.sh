#!/usr/bin/env bash
# ============================================================================
# marca-versoes.sh - Cria as tags de versão que ainda não existem na main
#
# Percorre o histórico da main (somente os commits da própria main, sem entrar
# nas branches integradas) e, para cada versão do package.json, marca o ÚLTIMO
# commit que a contém: é o estado entregue daquela versão. Tags que já existem
# não são alteradas.
#
# Saídas (para o GitHub Actions, quando GITHUB_OUTPUT estiver definido):
#   versao  versão atual do package.json (ex.: 2.2.0)
#   tags    tags criadas nesta execução, da mais antiga para a mais nova
#   nova    "true" quando a tag da versão atual foi criada agora
#
# Uso local, sem enviar nada:  SIMULAR=1 .github/scripts/marca-versoes.sh
# ============================================================================
set -euo pipefail

le_versao() {
   git show "$1:package.json" 2>/dev/null | node -e \
      'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).version||"")}catch{}})'
}

declare -A ULTIMO_COMMIT=()
ORDEM=()

for COMMIT in $(git rev-list --first-parent --reverse HEAD); do
   VERSAO="$(le_versao "$COMMIT")"
   [ -z "$VERSAO" ] && continue
   if [ -z "${ULTIMO_COMMIT[$VERSAO]+x}" ]; then
      ORDEM+=("$VERSAO")
   fi
   ULTIMO_COMMIT[$VERSAO]="$COMMIT"
done

VERSAO_ATUAL="$(le_versao HEAD)"
CRIADAS=()

for VERSAO in "${ORDEM[@]}"; do
   TAG="v$VERSAO"
   if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
      continue
   fi
   COMMIT="${ULTIMO_COMMIT[$VERSAO]}"
   echo "Criando $TAG em $(git log -1 --format='%h %s' "$COMMIT")"
   if [ "${SIMULAR:-0}" != "1" ]; then
      git -c user.name="github-actions[bot]" \
          -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
          tag -a "$TAG" "$COMMIT" -m "$TAG"
   fi
   CRIADAS+=("$TAG")
done

if [ "${#CRIADAS[@]}" -gt 0 ] && [ "${SIMULAR:-0}" != "1" ]; then
   git push origin "${CRIADAS[@]}"
fi

NOVA=false
for TAG in "${CRIADAS[@]}"; do
   [ "$TAG" = "v$VERSAO_ATUAL" ] && NOVA=true
done

echo "Versão atual: $VERSAO_ATUAL | tags criadas: ${CRIADAS[*]:-nenhuma}"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
   {
      echo "versao=$VERSAO_ATUAL"
      echo "tags=${CRIADAS[*]:-}"
      echo "nova=$NOVA"
   } >> "$GITHUB_OUTPUT"
fi
