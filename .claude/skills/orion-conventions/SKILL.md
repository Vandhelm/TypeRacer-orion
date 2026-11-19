---
name: orion-conventions
description: Conventions de code du projet TypeRacer-orion (O.R.I.O.N, course de frappe multijoueur notée exigence par exigence) - pile Bun + Next.js App Router + Vercel, TypeScript strict, règles côté serveur, validation Zod, traductions fr/en, styles par page, migrations Drizzle, formules MPM, commandes de test. Utilise ce skill avant d'écrire ou de relire du code dans ce dépôt, dès qu'on implémente, corrige ou vérifie une exigence (AUTH-02, SALLE-04…), qu'on ajoute une page, une route API, un texte, une table ou un test - même pour un petit changement.
---

# Conventions du projet O.R.I.O.N

Une course de frappe multijoueur en temps réel, travail de session noté exigence par exigence. Le texte des exigences est dans `docs/criteres.md` ; leur statut dans `docs/EXIGENCES.md`. Les règles ci-dessous découlent de ces exigences : les respecter évite de perdre des points sur des critères transversaux.

## Pile

- **Bun** : gestionnaire de paquets (`bun add`), exécuteur de scripts et de tests (`bun test`), runtime de Next.js (`bun --bun next …`). L'authentification dépend de `Bun.password` : ne lance pas Next.js avec Node.
- **Next.js 16, App Router** (TECH-01), en migration progressive : les routes sont dans `app/`, mais chaque page passe encore par `src/next/LegacyPage.tsx` et le code de la page vit dans `src/views/<page>`. Une page « migrée pour de bon » n'utilise plus `LegacyPage`. Ne crée jamais de dossier `pages/` (Next.js le prendrait pour des routes).
- **API** : toutes les routes `/api/*` passent par `app/api/[...path]/route.ts`, qui appelle `handleApi` (`src/server/api.ts`).
- **React 19**, **Tailwind 4** (via `@tailwindcss/postcss`), **PostgreSQL** avec **Drizzle**, **Better Auth** pour les comptes.
- **Vercel** héberge (preview et production). Le serveur exigé par TECH-05 est un VPS : c'est un écart documenté, ne le relance pas.

## Règles de code

- **TypeScript strict** (TECH-02) : aucun fichier `.js`/`.jsx` nouveau, aucun `any` explicite, aucun `@ts-ignore` ou `@ts-expect-error` sans commentaire qui le justifie. `next build` ne vérifie pas les types (TypeScript 7) : `bun run typecheck` le fait.
- **Règles côté serveur** (SEC-01) : toute interdiction ou tout droit (invité, hôte, capacité, salle unique) est appliqué par le serveur, pas seulement en cachant un bouton. Ne crois jamais sur parole une donnée du client (rôle, score, `bot: true`).
- **Entrées serveur validées par un schéma** (TECH-07) : routes API, actions serveur et messages temps réel, avec Zod. S'il n'est pas installé : `bun add zod`, dans un commit `build:` à part.
- **Textes** (I18N-01) : aucune chaîne visible en dur. Chaque clé va dans `src/i18n/locales/fr.json` et `src/i18n/locales/en.json`, dans le même commit que le code qui l'utilise.
- **Styles** (TECH-03) : Tailwind partout, en classes dans le TSX. Les classes répétées d'une page vont dans `src/views/<page>/styles.ts`, les tokens et les variantes (`laptop`, `tablet`, `phone`, `narrow`, `tiny`, `compact`) dans `src/styles/base/tokens.css`. Le CSS de `src/styles/pages/<page>` et `src/styles/components` ne garde que ce qui s'écrit mal en utilitaires : keyframes, pseudo-éléments décoratifs (fil, perforation, tampon), scène 3D du podium, bassin de course créé en JS, styles pilotés par une variable (`--heat`), et les surcharges d'un composant propres à une page (`.room-leave`, `.profile-tabs .view-tab`). Les utilitaires sont dans une couche CSS : le CSS écrit à la main l'emporte toujours, donc ne style jamais la même propriété d'un élément aux deux endroits. `all: unset` : classe `unset` (couche base), jamais `[all:unset]`. Une variante qui couvre deux media queries s'écrit avec `or`, pas une virgule. Respecte la direction artistique existante, deux thèmes (DES-05), mobile dès 360 px (DES-06), accessibilité : bonnes balises, libellés, focus visible (A11Y).
- **Images importées** : sous Next.js, `import x from "./a.png"` donne un objet `{ src }`, pas une chaîne. Utilise `x.src`.
- **Base de données** : schéma dans `db/schema`, migration générée par `bun run db:generate` et commitée avec le changement. Données de démo dans `db/mocks`.
- **Calculs** (MPM, précision, progression) : formules exactes de l'annexe A de `docs/criteres.md`, espaces comprises.

## Tests et vérifications

| Commande | Rôle |
|---|---|
| `bun test` | tests unitaires et de régression (base PGlite en mémoire, sans Docker) |
| `bun test -t <ID>` | rejoue les tests d'une exigence : chaque `describe` commence par son ID (`describe("AUTH-05 — …")`) |
| `bun run test:smoke` | `next build` + `next start` sur une base jetable `<base>_smoke` ; il faut Postgres (`bun run db:up`) |
| `BASE_URL=https://… bun run test:smoke` | mêmes vérifications contre un déploiement, en lecture seule |
| `bun run typecheck`, `bun run lint` | types et règles TECH-02 (Oxlint) |
| `bun run next:build` | build de production |

Dans un agent, coupe toujours la sortie : `bun test 2>&1 | tail -30` (idem pour `typecheck`, `lint`, `test:smoke`). Relance sans `tail` seulement si la trace d'un échec est tronquée.

La CI GitHub Actions lance tout cela à chaque push.

## Git et exigences

- Branches, commits, push et merge : skill `feature-branches` (`feature/<page>/<id>` en minuscules, Conventional Commits, footer `Refs: <ID>`, sujet ≤ 50 caractères, sans co-auteur).
- Vérifier une exigence et tenir la matrice : skill `criteria-check`.
