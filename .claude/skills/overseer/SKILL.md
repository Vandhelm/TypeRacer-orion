---
name: overseer
description: Chef d'orchestre. Prend une demande de développement (une ou plusieurs exigences, une section entière d'exigences, une fonctionnalité, un lot de corrections, un audit), la découpe, lance les agents dev, qa et Explore selon un mode light (par défaut), medium ou complex, enchaîne dev → qa → dev, puis vérifie et rapporte. Tourne dans la conversation principale (seule à pouvoir lancer des agents). Utilise ce skill pour toute tâche à répartir entre plusieurs agents, ou quand l'utilisateur nomme un mode (« en medium », « go for it, complex », « /overseer »).
---

# Overseer

Tu ne codes pas toi-même : tu organises les agents `dev`, `qa` et `Explore`, puis tu rends un résultat vérifié. Tout ce qui est propre au projet vient de ses skills et de ses agents.

**Pourquoi un skill :** un sous-agent ne peut pas lancer d'autres agents. C'est donc toi, dans la conversation principale, qui lances chaque `dev` et chaque `qa`. Les `dev` et les `qa` ne lancent pas d'agents.

## 1. Le mode

Les tokens coûtent : **le mode par défaut est light**. Un mode nommé par l'utilisateur (« medium », « complex », « go for it », « mets le paquet ») l'emporte toujours. Ne demande jamais le mode : une exigence → light, plusieurs exigences ou une section → medium, et complex quand l'utilisateur le dit ou que le skill du projet le prévoit. Si la tâche te semble trop grosse pour light, termine en light et propose le mode supérieur dans ton rapport.

| | **light** (défaut) | **medium** | **complex** |
|---|---|---|---|
| Agents `dev` en parallèle | 1 | jusqu'à 3 | autant que nécessaire |
| Total d'agents lancés | 3 | 8 | 15 |
| Tours de correction dev ↔ qa | 1 | 3 | 10 |
| QA | rapide : le critique seulement | complète (méthode du projet) | complète, plus une seconde QA indépendante |
| Tests adverses | si sécurité ou droits en jeu | oui | oui, systématiques |
| `Explore` avant de coder | non | un, si le terrain est inconnu | plusieurs en parallèle |

Tu lances toi-même chaque agent : le compte est exact. Passe le mode dans chaque message (« Mode : medium »).

## 1 bis. Le modèle de chaque agent

Passe toujours `model` dans l'appel `Agent` : il l'emporte sur le frontmatter. Choisis-le d'après la tâche, pas d'après le mode seul.

| Agent | `haiku` | `sonnet` | `opus` |
|---|---|---|---|
| `Explore` | localiser des fichiers ou du code | comprendre un flux | — |
| `qa` | — | light et medium | complex, ou sécurité, droits, temps réel en jeu |
| `dev` | — | **par défaut** : nouvelle exigence, correction d'un rapport QA, i18n, style, textes | escalade après un tour échoué, schéma de base, sécurité, droits, temps réel |

- **Escalade :** un tour de correction qui échoue fait monter le `dev` suivant d'un cran (sonnet → opus). Ne redescends pas sur la même unité.
- Un agent ne change pas de modèle en cours de route : le choix se fait au lancement.
- **Effort :** passe toujours `effort` dans l'appel `Agent` : `low` pour `Explore`, `medium` pour `dev` et `qa`, `high` quand le modèle est `opus` (sécurité, droits, temps réel, escalade).
- Note le modèle de chaque agent dans le rapport final.

**Light avec une seule unité :** pas de phase de découpe ni d'`Explore`. Lance directement un `dev`, puis un `qa`, puis au plus un `dev` de correction.

## 2. Comprendre et découper

1. `CLAUDE.md` est déjà dans ton contexte. Charge avec `Skill` seulement les skills dont la description touche aux branches, au push, au merge ou à la vérification. **Ils passent avant ce fichier**, en particulier pour savoir si tu as le droit de pousser ou de merger.
2. Les agents `dev` et `qa` du projet (`.claude/agents/`) remplacent les versions globales du même nom : lis leur description pour savoir ce qu'ils attendent dans leur message.
3. Découpe la demande en unités indépendantes. Deux unités qui touchent les mêmes fichiers ne sont pas indépendantes : elles passent l'une après l'autre, par le même `dev`.
4. En medium ou complex, si le code concerné t'est inconnu, lance d'abord `Explore` (avec `model: "haiku"` pour une simple localisation) et ne garde que ses conclusions.

## 3. Boucle par unité

```
dev (code + tests + commits) → qa (constate) → [problèmes ?] → dev (corrige, avec le rapport qa) → qa → …
```

- **Message au `dev` :** l'exigence et sa source, le mode, le dernier rapport QA s'il existe (seulement les problèmes et les tests de régression à ajouter), et les choix déjà faits par l'utilisateur. Ne lui dicte pas l'implémentation.
- **Message au `qa` :** la portée (exigence et branche) et le mode, **sans le rapport du dev ni ton avis** : il doit constater lui-même.
- **Parallèle :** lance dans la même réponse les `dev` d'unités indépendantes, **chacun avec `isolation: "worktree"`** : dans un même checkout, leurs `git checkout` se marchent dessus. Un seul `dev` à la fois peut travailler sans worktree.
- **Worktree :** il part de la branche par défaut (`main`), **pas** du HEAD courant, et n'a ni `.env` ni `node_modules`. Dis au `dev` de créer sa branche avec `git switch -c <branche> <base>`, en nommant la base exacte (`dev`, ou la branche dont il dépend) et, si le projet a un `.env.example`, de lancer les commandes avec `bun --env-file=.env.example` (ou l'équivalent). Donne au `qa` le chemin du worktree pour lancer les tests.
- **Verdict favorable avec des tests de régression suggérés :** en light, ne relance pas de `dev` pour eux ; liste-les dans le rapport. En medium et complex, ils font l'objet du tour de correction.
- Limite de tours atteinte sans verdict favorable : arrête cette unité et garde le dernier rapport.
- En complex, quand toutes les unités ont fini, lance une **seconde QA indépendante** (un `qa` par unité, sans les rapports précédents).

## 4. Vérifier, sans refaire

Le `dev` a déjà lancé les vérifications et le `qa` a déjà constaté. Ne relance pas la suite de tests :

- `git log --oneline <base>..<branche>` : les commits annoncés existent.
- `git status --short` (dans le worktree s'il y en a un) : rien d'oublié.
- Contradiction entre un `dev` et un `qa` : le `qa` gagne, ou relance un tour si le mode le permet.
- En medium et complex seulement, rejoue une commande de test citée par le `qa` si son verdict repose dessus.

## 4 bis. Portée section (un lot d'exigences d'un coup)

Quand l'utilisateur demande une section entière (« fais la section 5.3 », « tous les AUTH », « tout TECH ») :

1. **Mode** : **medium** par défaut pour une section (light ne lance qu'un `dev`, trop peu pour un lot). **complex** seulement si l'utilisateur le dit, ou si le skill du projet le prévoit pour cette section (sécurité, temps réel, serveur autoritaire) — lance-le alors directement et indique-le dans le rapport, sans demander.
2. **Liste de travail** : prends la source des exigences et le fichier de suivi du projet (voir ses skills). Garde les exigences de la section qui ne sont pas « complet ». Lance d'abord un `qa` sur la section entière (mode light, critique seulement) pour partir de l'état réel, pas du fichier de suivi.
3. **Décisions humaines d'abord** : si une exigence de la section dépend d'un choix que le projet réserve à l'utilisateur (architecture, contenu créatif, compte ou secret), arrête-toi **avant** de lancer les `dev` et pose toutes ces questions en une fois. Les autres ambiguïtés, tranche-les et note-les.
4. **Groupes** : regroupe les exigences qui touchent les mêmes fichiers (un `dev` les enchaîne) ; les groupes indépendants partent en parallèle, chacun en worktree. Ordonne selon les dépendances à l'intérieur de la section.
5. **Branche de section** : suis le skill du projet. À défaut, une branche par exigence, puis une branche d'intégration de la section où tu merges les branches validées, tu résous les conflits, tu lances `bun test`, `typecheck` et `lint` (sortie coupée). Pas de `qa` final de section : chaque exigence a déjà le sien. En complex, la seconde QA indépendante joue ce rôle.
6. **Un seul point d'arrêt** : à la fin, rends le rapport de section (tableau par exigence : statut QA, branche, commits, choix faits, reste à faire) et les lignes de suivi, puis applique les règles du projet pour le merge. Ne pousse jamais : donne les commandes `git push` prêtes à copier. Les choix faits sans l'utilisateur vont dans la colonne « choix faits », pas dans une question.
7. **Budget** : medium = 8 agents par **groupe** d'exigences, pas pour la section entière ; annonce le total prévu avant de lancer si la section a plus de 3 groupes.

## 5. Finir

- Branches, push, merge, fichiers de suivi : fais exactement ce que disent les skills du projet. Sans règle du projet, ne pousse pas et ne merge pas : propose-le.
- Worktrees : donne pour chaque unité sa branche et le chemin du worktree ; n'intègre les branches ensemble que si l'utilisateur le demande. L'outil crée aussi une branche `worktree-agent-…` vide : propose de la supprimer avec le worktree une fois la feature mergée (`git worktree remove <chemin>` puis `git branch -D worktree-agent-…`).
- Le CLAUDE.md global de l'utilisateur prime sur les skills du projet pour le push : s'il dit « je pousse moi-même », ne pousse jamais, même si un skill le prévoit après accord.
- Rapport final, court :

```markdown
**Mode :** <mode> — **Agents lancés :** <n>/<budget>

| Unité | Branche | Commits | QA (tours) | Modèles | Reste |
|---|---|---|---|---|---|

**Lignes de suivi à reporter :** <si le projet en a>
**Mode supérieur utile ?** <une ligne, ou rien>
```
