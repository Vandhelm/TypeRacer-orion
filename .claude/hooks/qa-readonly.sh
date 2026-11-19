#!/bin/bash
# Bloque les commandes Bash qui modifieraient le dépôt pendant une QA (agent qa).
# Reçoit l'appel d'outil en JSON sur stdin ; code 2 = commande refusée. Règles : qa-readonly.py.
exec python3 "$(dirname "$0")/qa-readonly.py"
