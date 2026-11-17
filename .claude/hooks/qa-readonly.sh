#!/bin/bash
# Bloque les commandes Bash qui modifieraient le dépôt pendant une QA (agent qa).
# Reçoit l'appel d'outil en JSON sur stdin ; code 2 = commande refusée.
cmd=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))')
if printf '%s' "$cmd" | grep -Eq '(^|[;&|(]\s*)git\s+(-C\s+\S+\s+)?(switch|checkout|commit|push|merge|rebase|reset|stash|restore|rm|mv|add|branch\s+-[dDmM]|tag|cherry-pick|revert|clean|worktree\s+add)\b|(^|[;&|]\s*)(rm|mv|cp|touch|mkdir|sed\s+-i|tee)\b|[^0-9&]>\s*[^&/]|>>'; then
  echo "QA en lecture seule : commande refusée ($cmd). Utilise git show/diff/log et rapporte au lieu de modifier." >&2
  exit 2
fi
exit 0
