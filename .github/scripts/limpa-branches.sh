#!/usr/bin/env bash
# ============================================================================
# limpa-branches.sh - Apaga as branches remotas que já cumpriram seu papel
#
# Apaga somente:
#   - feature/*, release/* e hotfix/* já integradas na main e na develop;
#   - dependabot/* sem pull request aberto.
# Nunca apaga main, develop nem branches fora do padrão do git flow.
#
# Uso local, sem apagar nada:  SIMULAR=1 .github/scripts/limpa-branches.sh
# ============================================================================
set -euo pipefail

git fetch --prune origin '+refs/heads/*:refs/remotes/origin/*'

APAGAR=()

for REF in $(git for-each-ref --format='%(refname:strip=3)' refs/remotes/origin); do
   case "$REF" in
      feature/*|release/*|hotfix/*)
         if git merge-base --is-ancestor "origin/$REF" origin/main &&
            git merge-base --is-ancestor "origin/$REF" origin/develop; then
            APAGAR+=("$REF")
         fi
         ;;
      dependabot/*)
         # Na dúvida (sem token ou falha na consulta), a branch fica
         ABERTOS="$(gh api "repos/$GITHUB_REPOSITORY/pulls?state=open&head=${GITHUB_REPOSITORY%%/*}:$REF" --jq 'length' 2>/dev/null || echo erro)"
         if [ "$ABERTOS" = "0" ]; then
            APAGAR+=("$REF")
         fi
         ;;
   esac
done

if [ "${#APAGAR[@]}" -eq 0 ]; then
   echo "Nenhuma branch para apagar."
   exit 0
fi

printf 'Apagando: %s\n' "${APAGAR[@]}"
if [ "${SIMULAR:-0}" != "1" ]; then
   git push origin --delete "${APAGAR[@]}"
fi
