"""Hook PreToolUse (Bash) de la conversation principale : encadre `git push`.

Autorisé : `git push [-u] origin <branche>` où chaque branche cible commence par
feature/, fix/, chore/ ou test/. Refusé : dev, main, push sans branche explicite,
--force/-f/--delete/--mirror/--all/--tags, refspec forcée (+ref) ou suppression (:ref).
Le contrôle des secrets et des réécritures se fait côté git (.githooks/pre-push).
"""
import json
import re
import shlex
import sys

ALLOWED = re.compile(r"^(feature|fix|chore|test)/[\w./-]+$")
SAFE_FLAGS = {"-u", "--set-upstream", "-q", "--quiet"}


def refuse(why: str) -> None:
    print(f"Push refusé : {why}. Seules les branches feature/, fix/, chore/ et test/ se poussent "
          "(`git push -u origin <branche>`) ; dev et main restent à l'utilisateur.", file=sys.stderr)
    sys.exit(2)


cmd = json.load(sys.stdin).get("tool_input", {}).get("command", "")
for segment in re.split(r"&&|\|\||[;|\n]", cmd):
    try:
        words = shlex.split(segment)
    except ValueError:
        words = segment.split()
    # repère « git [-C chemin] push »
    for i, w in enumerate(words):
        if w != "git":
            continue
        j = i + 1
        while j < len(words) and words[j] in ("-C", "-c"):
            j += 2
        if j >= len(words) or words[j] != "push":
            continue
        args = words[j + 1:]
        flags = [a for a in args if a.startswith("-")]
        rest = [a for a in args if not a.startswith("-")]
        bad = [f for f in flags if f not in SAFE_FLAGS]
        if bad:
            refuse(f"option {' '.join(bad)} interdite")
        if len(rest) < 2:
            refuse("remote et branche doivent être explicites")
        if rest[0] != "origin":
            refuse(f"remote {rest[0]} inconnu")
        for ref in rest[1:]:
            if ref.startswith("+") or ref.startswith(":"):
                refuse(f"refspec {ref} (forcée ou suppression)")
            dst = ref.split(":")[-1].removeprefix("refs/heads/")
            if not ALLOWED.match(dst):
                refuse(f"branche {dst}")
