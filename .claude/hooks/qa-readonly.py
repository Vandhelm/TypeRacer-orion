"""Hook de l'agent qa : refuse les commandes Bash qui modifieraient le dépôt (code 2).

Autorisé : lecture git (show, diff, log, merge-base, branch --contains…), boucles,
tubes, redirections vers /dev/null ou entre descripteurs (2>&1), « > » entre guillemets.
"""
import json
import re
import sys

cmd = json.load(sys.stdin).get("tool_input", {}).get("command", "")
start = r"(?:^|[;&|(]|\bdo|\bthen|\belse)\s*"
git_write = (
    start + r"git\s+(?:-C\s+\S+\s+)?"
    r"(?:switch|checkout|commit|push|merge(?!-base)|rebase|reset|restore|rm|mv|add|tag|cherry-pick|revert|clean"
    r"|stash\s+(?:push|pop|apply|drop|clear|save)|branch\s+-[dDmMcC]|worktree\s+(?:add|remove|move))\b"
)
fs_write = start + r"(?:rm|mv|cp|touch|mkdir|tee|sed\s+-i|perl\s+-i)\b"
redirect = r"(?<![0-9&<])>>?\s*(?!/dev/null\b|&\d)\S|\d>>?\s*(?!/dev/null\b|&\d)[^\s&]"
unquoted = re.sub(r"'[^']*'|\"[^\"]*\"", '""', cmd)

if re.search(git_write, cmd) or re.search(fs_write, cmd) or re.search(redirect, unquoted):
    print(f"QA en lecture seule : commande refusée ({cmd}). Utilise git show/diff/log et rapporte au lieu de modifier.", file=sys.stderr)
    sys.exit(2)
