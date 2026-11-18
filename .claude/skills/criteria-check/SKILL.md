---
name: criteria-check
description: Vérifie que les exigences du travail de session (AUTH-02, SALLE-03…, texte dans docs/criteres.md) sont réellement codées, et tient à jour la matrice de traçabilité docs/EXIGENCES.md (complet / partiel / non fait). Quatre portées - un critère sur sa branche (avec contrôle du hors-scope), une section (« 5.2 »), une page (home, room, game, podium, profile) ou le site complet avec le parcours de bout en bout. Rapport par exigence avec preuves fichier:ligne et tests, sans toucher au code. Utilise ce skill dès que l'utilisateur demande si un critère, une section, une page ou le projet est conforme, complet, prêt à merger ou à remettre, demande une revue, un audit, une QA ou la mise à jour de la matrice, dit « vérifie AUTH-03 », « où j'en suis », « qu'est-ce qui manque », « ça sort pas du scope ? », et à la fin de chaque feature avant le push - même sans le mot « critère ».
---

# Vérifier les exigences

Deux questions, auxquelles il faut répondre honnêtement :

1. **L'exigence est-elle remplie ?** Chaque partie du texte est codée, et codée correctement.
2. **Pour une branche de critère : reste-t-elle dans son scope ?** Elle ne contient rien qui ne serve pas ce critère.

L'énoncé pénalise plus une exigence déclarée « complète » à tort qu'une exigence honnêtement « partielle » ou « non faite ». Un faux ✅ coûte donc plus cher qu'un doute signalé : dans le doute, ⚠️ ou ❓ avec la raison.

Le skill **ne modifie pas le code** : ni fichier source, ni commit, ni branche. Il produit un rapport et, hors portée « critère », les lignes à mettre dans `docs/EXIGENCES.md`.

## Qui exécute

La vérification tourne dans l'agent **`qa`** (`.claude/agents/qa.md`), qui charge ce skill et n'a que des outils de lecture. Il n'a pas le contexte de celui qui a écrit le code, donc il lit ce qui est écrit, pas ce qui était voulu.

- Si tu es la conversation principale : lance l'agent `qa` avec la portée et, pour un critère, la branche. Ne fais la vérification toi-même que si l'agent n'est pas disponible.
- Pour plusieurs sections (portée « site »), lance un agent `qa` par section, en parallèle, puis rassemble leurs rapports.
- Seule la conversation principale écrit `docs/EXIGENCES.md`, à partir des lignes renvoyées par les agents : un seul rédacteur, pas de conflit.

## 1. Choisir la portée

| Portée | Demande typique | Ce qu'on compare | Hors-scope |
|---|---|---|---|
| **Critère** | « vérifie AUTH-03 », fin de feature | le diff de la branche du critère contre `dev` | oui |
| **Section** | « section 5.2 », « les AUTH » | l'état actuel de `dev` | non |
| **Page** | « QA de la page room » | `dev`, critères de la page + transversaux | non |
| **Site** | « audit complet », « où j'en suis » | `dev`, toutes les sections + parcours | non |

Sans précision, déduis-la : branche de critère courante (`feature/home/auth-03`) → critère ; sinon demande en une question.

Le texte des exigences est dans `docs/criteres.md`, rangé par section de l'énoncé. Cite-le tel quel. Une exigence absente de ce fichier ne se vérifie pas : arrête-toi et demande son texte.

### Critères par page

| Page | Dossier | Critères |
|---|---|---|
| `home` | `src/views/home` | AUTH-01, AUTH-02, AUTH-03, JOIN-01, JOIN-02, JOIN-03, PERF-01 |
| `room` | `src/views/room` | SALLE-01 à SALLE-10, CONF-01 à CONF-12, COURSE-02, SEC-01 |
| `game` | `src/views/game` | COURSE-01, COURSE-03 à COURSE-10, BOT-01 à BOT-05, BONUS-01 à BONUS-04, PERF-02, PERF-03 |
| `podium` | `src/views/podium` | RES-01 à RES-05, COURSE-10, COURSE-11 |
| `profile` | `src/views/profile` | AUTH-03, AUTH-04, AUTH-05, AUTH-06, HIST-01, HIST-02, SEC-02 |

Transversaux, à vérifier **sur chaque page** de la portée : I18N-01, I18N-02, I18N-03, A11Y-01 à A11Y-04, DES-04, DES-05, DES-06. Pour une page, ne note que ce qui concerne cette page (« I18N-01 partiel : 3 chaînes en dur dans `RoomPage.tsx` »).

Projet entier seulement (portée site ou section 3, 4, 6) : TECH-01 à TECH-10, DES-01 à DES-03, TEST-01 à TEST-03, SEC-03.

Si un dossier de page a changé de nom ou qu'une page manque dans ce tableau, liste `src/views` et dis-le dans le rapport plutôt que de deviner.

## 2. Délimiter ce qu'on lit

N'utilise que des commandes en lecture (`git diff`, `git log`, `git show`, `grep`, `bun test`). Ne fais ni `switch`, ni `checkout`, ni `stash` dans le dépôt de l'utilisateur : il a peut-être du travail en cours. Pour lire un fichier d'une autre branche : `git show <branche>:<chemin>`.

**Portée critère :**
- Branche pas encore mergée : `git diff --stat dev...<branche>` puis `git diff dev...<branche>` (trois points : ce que la branche a ajouté depuis son départ de `dev`).
- Branche déjà mergée (`git merge-base --is-ancestor <branche> dev`) : retrouve le merge (`git log dev --merges --ancestry-path <branche>..dev --format="%h %s" | tail -1`) et compare ses deux côtés : `git diff <merge>^1 <merge>`.
- Les commits du critère portent le footer `Refs: <ID>` : `git log --all --grep "Refs: AUTH-03"`. Si la branche mélange plusieurs critères, ce sont eux qui délimitent le scope ; dis-le.

**Portées section, page et site :** lis l'état de `dev` (`git show dev:<chemin>`, ou le répertoire de travail s'il est sur `dev` et propre). Pas de contrôle du hors-scope : on vérifie ce qui existe, pas ce qu'une branche a ajouté.

## 3. Découper chaque exigence

Découpe le texte en parties atomiques et vérifiables, numérotées par exigence (AUTH-04.1, AUTH-04.2…). Pour chacune, note sa force :

- **Obligatoire** : « doit », « ne peut pas », présent de l'indicatif qui décrit un comportement (« un invité choisit un pseudonyme »).
- **Permis** : « est permis », « peut ». Son absence n'est pas un défaut ; s'il est présent, vérifie qu'il respecte les limites du texte.
- **Référence** : renvoi à une autre exigence (« voir SALLE-03 »). Ne la revérifie pas ; renvoie à son statut.
- **Document** : « documenté », « à documenter ». Cherche le document (`docs/`, README, commentaire d'en-tête) et vérifie qu'il dit ce qui est demandé.

Une phrase contient souvent plusieurs parties. « Il n'a ni historique persistant ni photo de profil ; un avatar généré est affiché à la place » en donne trois.

Fais ressortir les valeurs précises (bornes, listes, formats, seuils) : « 3 à 20 caractères », « 128 bits », « 10 par minute », « 30 secondes ». Ce sont elles qui cassent le plus souvent. Les formules de calcul (MPM, précision, progression) sont dans l'annexe A de `docs/criteres.md` : compare le code à la formule, espaces compris.

## 4. Vérifier chaque partie

Trouve le code qui la réalise et lis-le vraiment. Un nom de fonction prometteur ne prouve rien.

- **Où** : fichier et ligne. En portée critère, cherche d'abord dans le diff ; si c'était déjà fait avant la branche, dis-le (« déjà dans `dev`, `src/…:42` »).
- **Correct ?** Pose les questions qui font échouer ce genre de code :
  - bornes : juste en dessous, sur, et juste au-dessus de chaque limite ; vide ; espaces autour ; caractères non ASCII ;
  - interdictions et droits : appliqués **côté serveur** ? Un bouton caché n'empêche pas un appel direct à l'API ou au socket ;
  - entrées serveur : validées par un schéma (TECH-07) ?
  - sécurité : un cookie « signé » est-il vérifié à la lecture, avec un secret qui ne vient pas du code ? un jeton a-t-il l'entropie demandée ? une donnée envoyée par le client (`bot: true`, un score) est-elle crue sur parole ?
  - tous les chemins : chaque endroit où l'action est possible (route API, page, socket, URL directe comme `/room?new`) applique la règle ;
  - ce qui s'affiche vraiment : pour une partie visible, suis la classe jusqu'au CSS (`grep -rn "<classe>" src/styles`). Un `font-size: 0`, un `display: none` ou une image de fond peut remplacer ce que le composant rend ;
  - le sens exact des mots : « généré » veut dire propre à chaque joueur, pas une image identique pour tous ; « signé » veut dire vérifié ; « en temps réel » veut dire sans rechargement.
- **Testé ?** Cherche les tests (`grep -rln "<nom>" src --include="*.test.ts"`, et `e2e/` pour Playwright). Lance ceux qui existent : `bun test <fichiers>`. Si la branche à vérifier n'est pas celle du répertoire de travail et que les fichiers diffèrent, ne bascule pas : indique que les tests n'ont pas été lancés et pourquoi. Une partie sans test n'est pas un échec, mais elle va dans la colonne « Tests associés » comme « aucun ». Les tests sont nommés par critère : `bun test -t <ID>` rejoue ceux d'une exigence.
- **Test de régression à ajouter.** Pour chaque partie ⚠️ ou ❌, et chaque partie ✅ sans test, écris dans le rapport le cas exact qui doit devenir un test : entrée, appel, résultat attendu (« `updateUser({ body: { displayUsername: null } })` → refusé, `players.name` inchangé »). Tu ne peux pas l'écrire toi-même ; l'agent `dev` le transformera en test avant de corriger.

Verdict par partie :

| Verdict | Sens |
|---|---|
| ✅ | codé, correct, preuve fichier:ligne lue |
| ⚠️ | codé mais un cas manque ou est faux (dis lequel, avec un cas concret) |
| ❌ | rien ne le réalise |
| ➖ | permis et absent, ou référence à une autre exigence |
| ❓ | impossible à établir en lisant le code (config de production, rendu réel, score Lighthouse) ; dis ce qu'il faudrait pour trancher |

Statut de l'exigence, pour la matrice :
- **complet** : toutes les parties obligatoires sont ✅ ;
- **partiel** : au moins une partie ✅ ou ⚠️, mais pas toutes ✅ ;
- **non fait** : aucune partie obligatoire n'est réalisée ;
- une exigence dont une partie reste ❓ n'est jamais « complet » : « partiel » avec la vérification à faire dans les notes.

## 4 bis. Vérifier le rendu (modes medium et complex)

En medium et complex, toute partie visible se vérifie aussi **dans le navigateur** : les transversaux DES-04, DES-05, DES-06, I18N-01 à I18N-03, A11Y, et les pages `home`, `room`, `game`, `podium`, `profile`. En light, saute cette étape et laisse ces parties à ❓ « rendu non vérifié » si le code seul ne tranche pas.

**Serveur.** Postgres d'abord (`bun run db:up`). Checkout principal : `preview_start` avec `orion` (port 3000) de `.claude/launch.json` ; `orion-next` (3002) pour une page déjà migrée vers Next.js. Worktree : lance `bun --env-file=.env.example server.ts` depuis le worktree en tâche de fond avec `PORT=3010` (ou un autre port libre), puis navigue vers ce port, et arrête-le à la fin.

**URL.** `/` (home), `/room`, `/game`, `/podium`, `/profile` (voir `server.ts`). `room`, `game` et `podium` demandent un état : atteins-le par le parcours, en invité (pseudonyme de test → « Faire une course » ou créer une salle). Pour `podium`, termine une course avec des bots si c'est possible ; sinon dis jusqu'où tu es allé.

**Contrôles par exigence :**

| Exigence | Ce qu'on regarde à l'écran |
|---|---|
| toutes | la page se charge, aucune erreur console, rien de vide ni de chevauché, le contenu attendu par les critères de la page est là |
| DES-04 | capture de la page : rien qui ressemble au rendu par défaut (signes listés dans `docs/criteres.md`) |
| DES-05 | bascule le thème (sélecteur de la page, ou `resize_window` avec `colorScheme`) : lisible dans les deux, contraste correct, aucun bloc resté dans l'autre thème |
| DES-06 | `resize_window` à 360 × 800 : pas de défilement horizontal (`document.documentElement.scrollWidth <= 360`), tout reste utilisable ; sur `/game`, le message « clavier physique » remplace la course |
| I18N-01 | change de langue : aucun texte resté dans l'autre langue, aucune clé de traduction brute (`home.title`), `<title>` traduit |
| I18N-02 | le sélecteur est sur la page ; recharge : le choix tient |
| I18N-03 | une date ou un nombre affiché change de format avec la langue |

Rapporte une capture par contrôle visuel. Ce que l'écran montre l'emporte sur le code : si le code est juste mais la page cassée, c'est ⚠️ avec ce que montre la capture. Une page que tu n'as pas pu ouvrir reste ❓ avec la raison, jamais ✅.

## 5. Hors scope (portée critère seulement)

Passe chaque fichier du diff et chaque bloc de changement significatif, et rattache-le :

- à une partie du critère ;
- ou à un **support nécessaire** : tests de ces parties, types, migration, imports, traductions des textes ajoutés ;
- sinon, c'est **hors scope** : dis à quoi ça sert et, si tu le reconnais, à quelle exigence ça appartient.

Sont hors scope, même s'ils sont utiles : une fonctionnalité au-delà du texte, une refonte d'une autre page, des fichiers embarqués par erreur (`.claude/launch.json`, `server 2.ts`). Le hors-scope n'est pas forcément mauvais ; il doit vivre sur sa propre branche.

## 6. Parcours complet (portée site)

En plus des sections, suis le parcours d'un joueur dans le code, de bout en bout, et vérifie que chaque étape passe la main à la suivante (route, état, message temps réel) :

1. **Invité** : accueil → pseudonyme (AUTH-02) → rejoindre par code (JOIN-01) ou « Faire une course » (JOIN-03) → salle d'attente → course → résultats.
2. **Connecté** : connexion (AUTH-01) → créer une salle (SALLE-01) → configurer (CONF) → inviter (SALLE-04) → lancer (COURSE-02) → décompte → course avec bots et bonus → résultats (RES) → relancer ou fermer (COURSE-11) → historique (HIST-01) → réaffichage (HIST-02) → profil (AUTH-06).

Pour chaque étape : ✅ branchée, ⚠️ branchée avec un trou (dis lequel), ❌ coupée (dis où le parcours s'arrête). Un parcours coupé est le premier problème à rapporter : l'application doit être fonctionnelle en production (TECH-05).

Lance aussi `bun run test:smoke` (il faut Postgres : `bun run db:up`) : il vérifie que chaque page et l'API répondent. Si des tests Playwright existent (TEST-02), lance-les et rapporte le résultat ; sinon dis que le parcours n'a été suivi que dans le code.

## 7. Rapport

En français, sans rien ajouter avant. Portée critère : 25 lignes au plus, une ligne par partie et par problème, preuves en `fichier:ligne`, jamais de code cité. Sortie des tests coupée (`2>&1 | tail -30`).

### Portée critère

```markdown
## <ID> — <Rempli | Incomplet | Rempli mais hors scope | Incomplet et hors scope>

**Branche :** `<branche>` comparée à `<base>` (<n> commits, <n> fichiers)
**Texte :** > <citation exacte>

### Parties
| # | Partie | Force | Verdict | Preuve |
|---|---|---|---|---|
| AUTH-04.1 | … | Obligatoire | ✅ | `src/…:12` — … |

### Problèmes
1. **AUTH-04.2 ⚠️** — <ce qui ne va pas, cas concret, fichier:ligne>

### Hors scope
- `<fichier>` — <ce que ça fait> → <exigence probable ou « sans lien »>

### Tests
<commande et résultat, ou pourquoi aucun ; parties sans test>

### Tests de régression à ajouter
- <partie> — <entrée> → <résultat attendu>

### Ligne de matrice
| <ID> | <statut> | <fichiers principaux> | <tests> | <notes> |
```

« Rempli » seulement si toutes les parties obligatoires sont ✅.

### Portées section, page et site

```markdown
## QA <section 5.2 Comptes et profil | page room | site complet> — <n> complet, <n> partiel, <n> non fait

### Résumé
| ID | Statut | Raison principale |
|---|---|---|

### Détail
#### <ID> — <statut>
> <citation exacte>
| # | Partie | Force | Verdict | Preuve |
…

### Parcours (site seulement)
| Étape | Verdict | Preuve ou point de rupture |

### Problèmes prioritaires
1. <le plus grave d'abord : parcours coupé, sécurité, faux « complet » actuel de la matrice>

### Lignes de matrice
| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
```

Omets une section vide, mais dis-le en une ligne (« Rien hors scope. »).

## 8. Mettre à jour `docs/EXIGENCES.md` (conversation principale)

C'est la matrice demandée par l'énoncé. Format :

```markdown
| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| AUTH-04 | partiel | `src/server/account.ts`, `src/accounts/avatar.ts` | `src/server/account.test.ts` | Redimensionnement non fait. Vérifié le 2026-11-17 (QA section 5.2). |
```

- Une ligne par exigence de `docs/criteres.md`, dans le même ordre, regroupées sous les mêmes titres de section. Si le fichier n'existe pas, crée-le avec toutes les exigences, en `non vérifié` pour celles hors de la portée.
- Remplace seulement les lignes de la portée vérifiée ; garde les autres telles quelles.
- Ne passe jamais une ligne à `complet` sans un rapport QA qui le dit. Si la matrice dit `complet` et que la QA dit autre chose, la QA gagne, et signale-le en tête du rapport : c'est exactement la fausse déclaration que l'énoncé pénalise.
- Les choix faits face à une ambiguïté (« règle de bonus retenue : … ») vont dans « Notes et choix » ; ne les efface pas en mettant à jour.
- Ajoute la date et la portée de la vérification dans les notes.
- Commit à part : `docs: update requirement matrix` avec un footer `Refs:` listant les ID vérifiés, sur la branche où la vérification a été faite.
