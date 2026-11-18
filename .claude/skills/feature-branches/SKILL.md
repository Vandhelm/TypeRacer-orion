---
name: feature-branches
description: Gère les branches et commits git du projet par feature et critère (ex. feature/profile-stats/auth-06) - choisit ou crée la bonne branche à partir de dev, évite les sous-branches sans lien, fait des commits conventionnels sur la bonne branche, puis pousse et merge dans dev quand la feature est terminée. Utilise ce skill dès qu'une tâche touche du code à committer, qu'un critère comme AUTH-03 ou SALLE-02 est mentionné, que l'utilisateur commence ou termine une feature, demande « fais une branche », « commit ça », « c'est fini, pousse », ou que des changements risquent d'atterrir sur la mauvaise branche - même s'il ne parle pas explicitement de git.
---

# Branches et commits par feature

Le but : chaque changement atterrit sur une branche qui correspond exactement à ce qu'il fait, avec un historique lisible, sans branches imbriquées inutilement. L'utilisateur relit l'historique et merge par feature ; une branche qui mélange deux critères ou qui part d'une feature sans lien rend ça impossible.

## Modèle de branches

```
main ← dev ← <type>/<page>/<critère>
```

- `<type>` : `feature` pour du nouveau comportement, `fix` pour une correction.
- `<page>` : la page ou zone concernée, en kebab-case (`home`, `profile-stats`, `room`, `auth`). Prends le nom déjà utilisé dans le dépôt (dossier `src/views/<page>`, branches existantes) plutôt que d'en inventer un.
- `<critère>` : l'identifiant du critère **en minuscules** (`AUTH-06` → `auth-06`). On le trouve dans la demande de l'utilisateur ou dans les commentaires du code (`grep -rn "AUTH-06" src`), où il reste en majuscules.

Le nom entier suit la convention courante sur GitHub : minuscules, chiffres, tirets et `/` seulement. Pas de majuscules, d'espaces, d'accents ni de `_`. Les majuscules posent problème parce que macOS ne distingue pas `AUTH-06` de `auth-06` dans `.git/refs` : deux branches qui ne diffèrent que par la casse finissent par se mélanger.

Exemples : `feature/profile-stats/auth-06`, `fix/home/auth-03`, `feature/room/salle-02`.

Sans critère identifiable, demande-le en une question courte. S'il n'y en a vraiment pas, utilise `<type>/<page>/<slug-court>` (ex. `fix/home/panel-margins`).

Si une branche existante du critère est en majuscules (`feature/profile-stats/AUTH-06`), continue sur celle-là plutôt que d'en créer une seconde, et propose de la renommer en minuscules tant qu'elle n'est pas poussée.

## Avant de travailler : choisir la branche

1. `git status --short` et `git branch --show-current`. Note les changements non commités et la branche courante.
2. Identifie le type, la page et le critère de la tâche.
3. Si la branche `<type>/<page>/<critère>` existe déjà (locale ou `origin/`), bascule dessus (`git switch`, ou `git switch --track origin/...`).
4. Sinon crée-la. **Base : `dev` par défaut**, même si tu es actuellement sur une autre branche de feature :
   ```bash
   git switch -c feature/profile-stats/auth-06 dev
   ```
   Ne pars d'une autre branche de feature que si le nouveau travail **a besoin** de code qui n'est pas encore dans `dev` (il appelle une fonction, un composant ou une table ajoutés là-bas). Être sur la même page ou dans la même session ne suffit pas : deux critères indépendants partent tous les deux de `dev`. Quand tu pars d'une autre branche, dis-le en une ligne et pourquoi.
5. Si `dev` a un `origin/dev` plus récent, fais `git fetch origin dev` et pars de `origin/dev` mergé localement (`git switch dev && git merge --ff-only origin/dev`) avant de créer la branche. Si le fast-forward échoue, ne force rien : préviens l'utilisateur.

### Conflit de refs avec une branche parente

Git refuse `feature/profile-stats/auth-06` si une branche `feature/profile-stats` existe (une ref ne peut pas être à la fois un fichier et un dossier). Dans ce cas :

1. Dis-le à l'utilisateur et propose de renommer l'ancienne en `feature/profile-stats/base`.
2. Après son accord : `git branch -m feature/profile-stats feature/profile-stats/base`.
3. Si `origin/feature/profile-stats` existe aussi, le push de la nouvelle branche échouera pour la même raison. Renommer côté remote veut dire pousser `.../base` puis supprimer `origin/feature/profile-stats` : c'est visible pour les autres, donc demande une confirmation séparée et explicite avant `git push origin --delete feature/profile-stats`.

### Changements non commités qui ne sont pas à leur place

Si des changements en cours appartiennent à un autre critère que la branche courante :
- Ils concernent la nouvelle tâche → `git stash push -m "<critère>"`, crée/bascule sur la bonne branche, `git stash pop`.
- Ils appartiennent à la branche courante → ne les commite pas à la place de l'utilisateur : c'est souvent du travail pas fini, et un commit « wip » pollue l'historique de sa branche. Mets-les de côté avec `git stash push -m "<branche courante>"`, fais ton travail sur la bonne branche, puis reviens sur la branche d'origine et fais `git stash pop`. Dis-le en une ligne. Ne les commite que si l'utilisateur le demande.
- Mélangés → commite fichier par fichier (`git add <fichiers>`) sur chaque branche concernée.

Ne perds jamais de travail : pas de `git checkout -- .`, `git reset --hard` ou `git stash drop` sans accord.

## Commits

Commite petit et souvent : un commit par changement cohérent (un comportement, une correction), pas un commit géant en fin de tâche.

Format : [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/#specification), en anglais.

```
<type>(<page>): <ce que fait le changement, à l'impératif, minuscule, sans point>

[corps facultatif]

Refs: <CRITÈRE>
```

Le critère va dans un **footer `Refs:`**, pas dans le sujet ni dans le scope. C'est l'emplacement prévu par la spec pour les références (son exemple est `Refs: #123`) : le scope doit nommer une partie du code, et le sujet reste court et lisible. Le footer garde la casse du code (`Refs: AUTH-06`), ce qui permet de retrouver tous les commits d'un critère avec `git log --grep "Refs: AUTH-06"`, même après le merge dans `dev`.

Écris le commit avec un `-m` par paragraphe, git insère les lignes vides :

```bash
git commit -m "feat(profile): add best WPM helper" -m "Refs: AUTH-06"
```

- Type, à choisir dans cette liste et nulle part ailleurs :

  | Type | Quand |
  |---|---|
  | `feat` | nouvelle fonctionnalité (y compris un nouvel élément visuel) |
  | `fix` | correction de bug (y compris un défaut visuel : marge, couleur, alignement) |
  | `docs` | documentation seulement |
  | `style` | formatage du code (indentation, espaces, points-virgules), sans effet sur le comportement ni sur l'affichage |
  | `refactor` | restructuration du code sans changer le comportement |
  | `perf` | amélioration de performance |
  | `test` | ajout ou mise à jour de tests |
  | `chore` | outillage ou maintenance (dépendances, config, skills) |
  | `ci` | CI/CD |
  | `build` | système de build |
  | `revert` | annulation d'un commit précédent |
  | `security` | correction de sécurité |

  Attention : `style` veut dire formatage du code, pas CSS. Un changement visible à l'écran est un `feat` ou un `fix`.
- Scope : la page ou zone (`profile`, `home`, `auth`, `room`).
- Sujet de **50 caractères maximum**, type et scope compris (règle 50/72 : GitHub tronque les sujets plus longs dans la liste des commits et les titres de PR). Il dit le *quoi* du point de vue de l'utilisateur ou du code, pas « update file ». Compte avant de commiter (`printf %s "<sujet>" | wc -c`) ; si ça dépasse, raccourcis le sujet plutôt que le scope.
- Pas de corps, ou quelques mots si le pourquoi n'est pas évident : une ligne vide après le sujet, puis des lignes de 72 caractères maximum.
- Footer `Refs: <CRITÈRE>` sur chaque commit lié à un critère, en dernier, après une ligne vide. Plusieurs critères : `Refs: AUTH-03, AUTH-06`. Sans critère (outillage, skill), pas de footer.
- Changement cassant (API, schéma de base, format de données dont dépend un autre module) : `!` avant les deux-points (`feat(auth)!: …`) et un footer `BREAKING CHANGE: <ce qui casse>`, en majuscules comme l'exige la spec.
- `revert` : sujet `revert: <sujet du commit annulé>` et footer `Refs: <sha court>` (plus `Refs: <CRITÈRE>` s'il y en a un).
- **Pas de ligne `Co-Authored-By`** ni d'autre attribution.

Exemples :

```
feat(profile): show best WPM per race mode

Refs: AUTH-06
```

```
fix(home): equal margins on the login panel

Refs: AUTH-03
```

```
feat(room)!: require an invite for private rooms

Refs: SALLE-02
BREAKING CHANGE: canJoin now takes an invite token
```

```
chore: add feature-branches skill
```

Avant chaque commit, vérifie que tu es sur la bonne branche (`git branch --show-current`) et n'ajoute que les fichiers de ce changement (`git add <fichiers>`, pas `git add -A` si d'autres fichiers sans rapport traînent, comme `.claude/launch.json`).

Si tu as commité sur la mauvaise branche par erreur et que ce n'est pas poussé : `git cherry-pick <sha>` sur la bonne branche, puis demande à l'utilisateur avant de retirer le commit de l'autre (`git reset` réécrit l'historique). Jamais d'`--amend`, de rebase ou de `--force`.

## Déléguer à l'agent dev

Pour coder un critère entier, ou corriger les problèmes d'un rapport QA, la conversation principale peut confier le travail à l'agent **`dev`** (`.claude/agents/dev.md`, générique). Il charge les skills du projet (`orion-conventions`, ce skill, `criteria-check`), crée la branche, code test d'abord, commite, puis **fait lui-même vérifier son travail par un agent `qa`** et corrige ce qu'il relève, en deux tours au plus. Il ne pousse pas et ne merge pas.

1. Lance `dev` sur le critère (« Implémente AUTH-02 », avec la ligne de matrice et, s'il existe, le dernier rapport QA).
2. Lis son rapport : verdict QA, tests de régression ajoutés, choix faits.
3. Verdict QA « Rempli » : continue avec « Fin de feature ». Sinon, montre les rapports à l'utilisateur avant d'aller plus loin.

Deux agents `dev` peuvent travailler en parallèle sur deux critères indépendants seulement s'ils ne touchent pas les mêmes fichiers ; sinon, l'un après l'autre.

## Fin de feature : push et merge dans dev

Une feature est terminée quand le critère est implémenté et que l'utilisateur le dit (« c'est bon », « fini », « on merge ») ou valide le résultat. Ne pousse pas au fil des commits.

1. Vérifie que tout est commité (`git status --short`), puis lance la suite de régression (`bun test`) et les smoke tests (`bun run test:smoke`, avec Postgres démarré par `bun run db:up`). Un test rouge bloque le push : montre-le à l'utilisateur plutôt que de le contourner.
2. **QA du critère.** Si le rapport de `dev` contient déjà un verdict « Rempli » de son agent `qa` sur cette branche, et que rien n'a été commité depuis, utilise-le. Sinon, lance l'agent `qa` sur le critère de la branche (portée « critère », ex. « Vérifie AUTH-03 sur `fix/home/auth-03` »), sans lui dire ce que tu penses avoir fait : il doit le constater lui-même. Pendant qu'il tourne, ne pousse rien.
   - Verdict « Rempli » : reporte sa ligne de matrice dans `docs/EXIGENCES.md` (statut, fichiers, tests, notes), commite-la sur la branche (`docs: update requirement matrix` + `Refs: <ID>`), puis passe à l'étape suivante.
   - Tout autre verdict : arrête-toi. Montre le rapport (parties ⚠️ / ❌, hors scope) et demande s'il faut corriger d'abord ou pousser quand même. Si l'utilisateur pousse quand même, la ligne de matrice prend le statut de la QA (`partiel`, `non fait`), jamais `complet`.
   - Si l'agent `qa` n'existe pas dans ce dépôt, dis-le et passe à l'étape suivante.
3. Annonce ce qui va être poussé et mergé (branche, nombre de commits, verdict QA) et attends un oui — le push est visible sur GitHub, l'utilisateur pousse d'habitude lui-même.
4. Push : `git push -u origin <branche>`.
5. Merge dans dev, sans fast-forward pour garder la feature lisible :
   ```bash
   git switch dev
   git merge --no-ff --no-edit <branche>
   ```
   En cas de conflit, arrête-toi et montre les fichiers en conflit ; ne résous pas à l'aveugle.
6. Ne pousse pas `dev` et ne merge pas dans `main` sauf demande explicite.
7. Résume en une ou deux lignes : verdict QA, branche poussée, merge dans dev (sha), ce qui reste à pousser.

## Récap des décisions

| Situation | Action |
|---|---|
| Nouveau critère, indépendant | branche depuis `dev` |
| Nouveau critère qui utilise du code non mergé d'une autre branche | branche depuis cette branche, en le disant |
| Même critère, branche existante | basculer dessus |
| Branche parente `feature/<page>` existe | proposer de la renommer en `.../base` |
| Commit | Conventional Commits, anglais, sujet ≤ 50 caractères, footer `Refs: <CRITÈRE>`, sans co-auteur, sur la branche du critère |
| Travail non commité de la branche courante | stash, puis pop au retour (pas de commit à la place de l'utilisateur) |
| Coder un critère | agent `dev` (il lance `qa` et corrige, 2 tours max) |
| Feature terminée | QA du critère (agent `qa`) → matrice → confirmer → push → merge `--no-ff` dans dev |
