---
name: autopilot
description: Fait avancer le projet tout seul - un pilote unique prend les exigences non complètes une par une sur le tableau partagé (scripts/board.ts), lance au plus 2 agents dev en parallèle sans fichiers communs, fait passer chaque branche par la QA, puis la merge dans dev par une file unique et met la matrice à jour. S'arrête quand tout est complet ou que le reste attend une décision. Utilise ce skill dès que l'utilisateur dit « autopilote », « fais avancer le projet », « que le projet se fasse tout seul », « enchaîne les exigences », « /loop /autopilot », ou demande à reprendre le pilote.
---

# Autopilote

Un seul pilote pour tout le projet. Il tourne dans la conversation principale (seule à pouvoir lancer des agents) et suit les skills `overseer` (modes, messages aux agents), `feature-branches` (branches, merge), `criteria-check` (QA, matrice) et `orion-conventions`. Ce skill ne fixe que l'enchaînement et la coordination.

Lancement conseillé : `/loop /autopilot` (rythme libre). Chaque tour reprend l'état depuis le tableau ; rien ne vit seulement dans la conversation.

## Règles fixes

- **Tableau** : `bun scripts/board.ts …` (aide en tête du fichier). Toute exigence travaillée y est réservée ; on ne travaille jamais sur une exigence prise par une autre branche. `worktree-setup.sh` réserve aussi : une session lancée à la main passe par le même tableau.
- **Un seul pilote** : au premier tour, `bun scripts/board.ts lock pilot acquire --branch <id de cette session>`. Refus → un autre pilote tourne : dis-le à l'utilisateur et arrête la boucle. Libère le verrou en fin de boucle.
- **2 dev au plus** en même temps (étapes `dev` et `fix`). Les QA ne comptent pas dans la limite.
- **Mode** : medium par exigence (3 tours dev → qa au plus), sauf mode nommé par l'utilisateur.
- **Merge** : le pilote merge seul dans `dev`, une branche à la fois, sous `lock merge`. Il pousse les branches de travail, **jamais `dev` ni `main`**.
- **Matrice** : écrite par le pilote seul, sur `dev`, dans un commit à part (le hook `pre-commit` refuse le reste).
- **Pas de nettoyage** : le pilote ne supprime ni branche ni worktree qu'il n'a pas créés.

## Un tour

1. **État** : `bun scripts/board.ts status`.
   - Prise marquée « ⚠ plus de 6 h » : si aucun agent de ce pilote ne la porte et que sa branche n'a pas bougé depuis 6 h, `release` et note-le pour le rapport.
2. **Résultats arrivés** (agents terminés depuis le dernier tour) :
   - `dev` fini → `stage <ID> qa`, lance le `qa` (portée critère, branche et chemin du worktree, sans le rapport du dev).
   - `qa` « Rempli » → `stage <ID> merge`, garde sa ligne de matrice.
   - `qa` autre verdict, tours restants → `stage <ID> fix`, relance le `dev` avec le rapport.
   - Plus de tours, ou la QA dit que ça dépend d'une décision (texte ambigu, infra hors code, choix de design) → `block <ID> <raison en une ligne>`. Garde la branche telle quelle.
3. **File de merge**, pour chaque prise à l'étape `merge`, une par une :
   1. `lock merge acquire --branch <branche>` ;
   2. dans le worktree du pilote (`.claude/worktrees/pilot`, créé au besoin avec `git worktree add --detach`) : `git switch dev`, `git merge --no-ff --no-commit <branche>` ;
   3. `bun test 2>&1 | tail -30`, `bun run typecheck 2>&1 | tail -30`, `bun run lint 2>&1 | tail -30` ;
   4. vert → `git commit --no-edit`, puis commit de matrice (ligne QA + `docs/qa/state.json`, `Refs: <ID>`), `git push -u origin <branche>`, `release <ID>` ;
      rouge → `git merge --abort`, `stage <ID> fix` et relance le `dev` avec la sortie ;
      conflit → `git merge --abort`, `stage <ID> fix`, relance le `dev` : « merge dev dans ta branche et résous ».
   5. `git switch --detach` (libère `dev`), `lock merge release --branch <branche>`.
4. **Créneaux libres** : `bun scripts/board.ts next --slots <2 - dev en cours>`. Pour chaque exigence proposée :
   - `claim <ID> --branch feature/<page>/<id-minuscule>` (convention de `feature-branches`) ;
   - lance le `dev` en arrière-plan, worktree isolé, base `dev`, avec la ligne de matrice et le texte de `docs/criteres.md`.
   - Une exigence `partiel` déjà bloquée une fois pour la même raison ne revient pas : elle reste dans `blocked`.
5. **Fin du tour** :
   - Agents en cours → planifie le réveil suivant (fallback 1200 s ; les agents terminés réveillent le pilote d'eux-mêmes).
   - Rien en cours et `next` vide → **fin** : `lock pilot release`, arrête la boucle, rapport final.

## Rapport final (et à la demande)

Au plus 15 lignes :
- mergées dans `dev` ce cycle (ID, branche, verdict QA) ;
- bloquées, avec la décision attendue pour chacune (c'est la liste de questions pour l'utilisateur) ;
- prises libérées pour inactivité ;
- `git push origin dev` à copier : l'utilisateur pousse lui-même.

Après les réponses de l'utilisateur : `unblock <ID>` pour chaque décision prise, note-la dans la consigne du `dev`, et relance la boucle.
