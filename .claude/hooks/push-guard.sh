#!/bin/bash
# Encadre `git push` pour Claude (règles : push-guard.py). Code 2 = refusé.
exec python3 "$(dirname "$0")/push-guard.py"
