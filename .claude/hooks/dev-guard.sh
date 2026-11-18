#!/bin/bash
# Garde de l'agent dev : il commite sur sa branche, mais ne pousse pas, ne merge pas
# et ne réécrit pas l'historique. Ces étapes restent à la conversation principale.
# Reçoit l'appel d'outil en JSON sur stdin ; code 2 = commande refusée.
cmd=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))')
if printf '%s' "$cmd" | grep -Eq '(^|[;&|(]\s*)git\s+(-C\s+\S+\s+)?(push|merge|rebase|reset\s+--hard|commit\s+.*--amend|branch\s+-D|clean\s+-[a-z]*f)\b|--force|--no-verify'; then
  echo "Agent dev : commande réservée à la conversation principale ($cmd). Commite sur ta branche et rapporte ; le push et le merge passent par la QA." >&2
  exit 2
fi
if printf '%s' "$cmd" | grep -Eq '(^|[;&|(]\s*)git\s+(-C\s+\S+\s+)?(switch|checkout)\s+(main|master|dev|develop)\s*($|[;&|])'; then
  echo "Agent dev : ne travaille pas directement sur la branche principale ni sur la branche d'intégration. Crée ou reprends la branche du critère." >&2
  exit 2
fi
exit 0
