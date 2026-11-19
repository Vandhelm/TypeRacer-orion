#!/bin/bash
# Prépare un worktree d'agent en un seul appel :
#   bash .claude/hooks/worktree-setup.sh <branche> <base>
# - crée <branche> depuis <base> (ou bascule dessus si elle existe déjà) ;
# - installe les dépendances (bun, depuis le cache : quelques secondes) ;
# - copie le .env du checkout principal, sinon .env.example.
set -euo pipefail
branch=${1:?usage: worktree-setup.sh <branche> <base>}
base=${2:?usage: worktree-setup.sh <branche> <base>}
main=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")

if git show-ref --verify --quiet "refs/heads/$branch"; then
  git switch -q "$branch"
else
  git switch -q -c "$branch" "$base"
fi

[ -d node_modules ] || bun install --frozen-lockfile --silent

if [ ! -f .env ]; then
  if [ -f "$main/.env" ]; then cp "$main/.env" .env
  elif [ -f .env.example ]; then cp .env.example .env
  fi
fi

echo "prêt : $(git branch --show-current) depuis $base ($(git rev-parse --short HEAD)), node_modules ok, .env $( [ -f .env ] && echo ok || echo absent )"
