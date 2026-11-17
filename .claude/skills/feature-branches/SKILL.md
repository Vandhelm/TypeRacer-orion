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
- `<page>` : la page ou zone concernée, en kebab-case (`home`, `profile-stats`, `room`, `auth`). Prends le nom déjà utilisé dans le dépôt (dossier `src/pages/<page>`, branches existantes) plutôt que d'en inventer un.
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

Format (Conventional Commits, en anglais) :

```
<type>(<page>): <ce que fait le changement, à l'impératif, minuscule, sans point>
```

- Types : `feat`, `fix`, `style` (visuel/CSS sans logique), `refactor`, `test`, `docs`, `chore`.
- Scope : la page ou zone (`profile`, `home`, `auth`, `room`).
- Sujet de **50 caractères maximum**, type et scope compris (règle 50/72 : GitHub tronque les sujets plus longs dans la liste des commits et les titres de PR). Il dit le *quoi* du point de vue de l'utilisateur ou du code, pas « update file ». Compte avant de commiter (`printf %s "<sujet>" | wc -c`) ; si ça dépasse, raccourcis le sujet plutôt que le scope.
- Pas de corps, ou quelques mots si le pourquoi n'est pas évident : une ligne vide après le sujet, puis des lignes de 72 caractères maximum.
- **Pas de ligne `Co-Authored-By`** ni d'autre attribution.

Exemples :
- `feat(profile): show best WPM per race mode`
- `fix(auth): keep session after Discord redirect`
- `style(home): equal margins on the login panel`
- `test(profile): cover stats with no finished race`

Avant chaque commit, vérifie que tu es sur la bonne branche (`git branch --show-current`) et n'ajoute que les fichiers de ce changement (`git add <fichiers>`, pas `git add -A` si d'autres fichiers sans rapport traînent, comme `.claude/launch.json`).

Si tu as commité sur la mauvaise branche par erreur et que ce n'est pas poussé : `git cherry-pick <sha>` sur la bonne branche, puis demande à l'utilisateur avant de retirer le commit de l'autre (`git reset` réécrit l'historique). Jamais d'`--amend`, de rebase ou de `--force`.

## Fin de feature : push et merge dans dev

Une feature est terminée quand le critère est implémenté et que l'utilisateur le dit (« c'est bon », « fini », « on merge ») ou valide le résultat. Ne pousse pas au fil des commits.

1. Vérifie que tout est commité (`git status --short`) et lance les tests concernés s'il y en a (`bun test <fichier>`).
2. Annonce ce qui va être poussé et mergé (branche, nombre de commits) et attends un oui — le push est visible sur GitHub, l'utilisateur pousse d'habitude lui-même.
3. Push : `git push -u origin <branche>`.
4. Merge dans dev, sans fast-forward pour garder la feature lisible :
   ```bash
   git switch dev
   git merge --no-ff --no-edit <branche>
   ```
   En cas de conflit, arrête-toi et montre les fichiers en conflit ; ne résous pas à l'aveugle.
5. Ne pousse pas `dev` et ne merge pas dans `main` sauf demande explicite.
6. Résume en une ou deux lignes : branche poussée, merge dans dev (sha), ce qui reste à pousser.

## Récap des décisions

| Situation | Action |
|---|---|
| Nouveau critère, indépendant | branche depuis `dev` |
| Nouveau critère qui utilise du code non mergé d'une autre branche | branche depuis cette branche, en le disant |
| Même critère, branche existante | basculer dessus |
| Branche parente `feature/<page>` existe | proposer de la renommer en `.../base` |
| Commit | conventionnel, anglais, sujet ≤ 50 caractères, sans co-auteur, sur la branche du critère |
| Travail non commité de la branche courante | stash, puis pop au retour (pas de commit à la place de l'utilisateur) |
| Feature terminée | confirmer → push → merge `--no-ff` dans dev |
