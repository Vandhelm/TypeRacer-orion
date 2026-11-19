# Exigences — matrice de traçabilité

Statut de chaque exigence de `docs/criteres.md` : **complet**, **partiel** ou **non fait** (vocabulaire de l'énoncé). `non vérifié` veut dire qu'aucune QA n'a encore porté sur l'exigence ; il doit avoir disparu avant la remise.

Les statuts viennent des rapports de l'agent `qa` (skill `criteria-check`). Une exigence ne passe à « complet » qu'avec un rapport QA qui le prouve : une fausse déclaration est pénalisée plus sévèrement qu'un « partiel » honnête.

## 3. Contraintes techniques (TECH)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| TECH-01 | complet | `app/`, `src/next/LegacyPage.tsx`, `next.config.ts`, `vercel.json`, `package.json` | `tests/tech/tech-01.test.ts`, `tests/smoke/app.smoke.ts` | Next.js 16.4.6, App Router, React 19.3.1. Ancienne pile Bun retirée. `ignoreBuildErrors: true` (TypeScript 7), types vérifiés par tsc en CI. Pages et layout passés au titre et à `lang` traduits, `app/not-found.tsx` ajouté. Vérifié le 2026-11-19 (QA suivi, light). |
| TECH-02 | complet | `tsconfig.json`, `.oxlintrc.json`, `src/views/game/pool/createRacePool.ts`, `src/views/home/scene/createScene.ts` | `tests/tech/tech-02.test.ts`, CI `check:no-js` | Choix : oxlint applique la règle ESLint `@typescript-eslint/no-explicit-any` en erreur (typescript-eslint ne supporte pas TypeScript 7). Lint et tsc à 0 sur l'ensemble intégré. Vérifié le 2026-11-18 (QA section 3). |
| TECH-03 | complet | `postcss.config.json`, `src/styles/base/tokens.css`, `src/styles/pages/*/index.css`, `src/components/**`, `src/views/*/styles.ts`, `src/views/**` | `tests/tech/tech-03.test.ts` | Tailwind v4, styles en classes dans le TSX. Le CSS écrit à la main est limité aux keyframes, pseudo-éléments décoratifs, scène 3D du podium, bassin créé en JS, styles pilotés par variable (`--heat`) et surcharges de page (règle dans `orion-conventions`). Visuel inchangé : styles calculés comparés avant/après sur 42 états (1280×800, 375×812, 1000×560). Rendu à revérifier avec DES-04 à DES-06. Vérifié le 2026-11-18 (QA critère, branche `feature/app/tech-03`). |
| TECH-04 | complet | `db/schema`, `db/migrations/`, `db/mocks/seed.ts`, `drizzle.config.ts` | `db/mocks/seed.test.ts` | Postgres et Drizzle ; seed avec corpus, comptes et historique (courses, résultats, échantillons). Migration 0008 (`races.others`, jsonb). Vérifié le 2026-11-19 (QA suivi, light). |
| TECH-05 | partiel | `vercel.json`, `fly.toml`, `Dockerfile.realtime` | aucun | Écart assumé : Vercel et Fly.io, pas de VPS. HTTPS public non vérifié par la QA (smoke avec `BASE_URL` à lancer). Serveur temps réel non déployé. Vérifié le 2026-11-18 (QA section 3). |
| TECH-06 | partiel | `src/realtime/*`, `src/server/realtime-ticket.ts`, `src/server/guest.ts`, `src/views/room/LiveList.tsx`, `src/views/room/live.ts`, `RoomPage.tsx`, `GamePage.tsx` | `src/realtime/*.test.ts`, `src/server/realtime-ticket.test.ts`, `src/views/room/live.test.ts`, `src/server/guest.test.ts` | Choix : serveur Bun WebSocket séparé (ADR dans `docs/ARCHITECTURE.md`). Progression visible dans la salle et dans l'en-tête de la course. Non déployé (Fly.io préparé) : rien en production. Le canal ne vérifie pas l'appartenance à la salle (à faire avec SALLE). Progression déclarée par le client (documenté, COURSE-06). `LiveList` passé en Tailwind, logique inchangée (jugé sur le diff). Vérifié le 2026-11-19 (QA suivi, light). |
| TECH-07 | complet | `src/server/races.ts`, `account.ts`, `guest.ts`, `room-gate.ts`, `proxy.ts`, `src/realtime/protocol.ts`, `src/realtime/ticket.ts` | `src/server/inputs.test.ts`, `src/realtime/protocol.test.ts`, `src/server/races.test.ts`, smoke TECH-07 | Routes API, pages serveur, cookies, ticket et messages WebSocket validés par Zod ; corps limité à 512 Ko. Aucune action serveur. Better Auth valide ses propres routes (équivalent). `races.others` construit depuis les résultats déjà validés, sans le flag `bot` ; pas de test sur son contenu. Vérifié le 2026-11-19 (QA suivi, light). |
| TECH-08 | partiel | `fly.toml`, `docs/ARCHITECTURE.md` | aucun | Vercel Hobby. Gratuité de Fly.io non établie ; base de production et accès de l'enseignant non documentés. Vérifié le 2026-11-18 (QA section 3). |
| TECH-09 | complet | `.github/workflows/ci.yml` | toute la suite | Lint, `tsc --noEmit` et `bun test` à chaque push, puis builds, smoke et contrôle no-JS (bloquant). Ajout des tests par exigence (`test:requirements`, artefact JSON). Aucun run GitHub observé. Vérifié le 2026-11-19 (QA suivi, light). |
| TECH-10 | partiel | `.env.example`, `.gitignore` | aucun | Aucun secret commité. Manquent `BASE_URL` et `SMOKE_*` (`SMOKE_DATABASE_URL`, `SMOKE_USERNAME`, `SMOKE_PASSWORD`, `SMOKE_SKIP_BUILD`), lues par les tests smoke. Vérifié le 2026-11-19 (QA suivi, light). |

## 4. Identité visuelle et design (DES)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| DES-01 | non fait | — | aucun | `docs/DEMARCHE-CREATIVE.md` absent. Vérifié le 2026-11-18 (QA site, light). |
| DES-02 | partiel | `src/components/brand/LogoTitle.tsx`, `app/layout.tsx` | aucun | Logo SVG dans l'appli ; favicon (ni `app/icon.*` ni `metadata.icons`) et croquis absents, `docs/DEMARCHE-CREATIVE.md` inexistant. Vérifié le 2026-11-19 (QA suivi, light). |
| DES-03 | non fait | — | aucun | Moodboard, palette et typographies non documentés (`docs/design-system.html` non suivi). Vérifié le 2026-11-18 (QA site, light). |
| DES-04 | partiel | `src/styles/base/tokens.css`, `src/views/game/RacePool.tsx` | aucun | Piste dédiée, pas de shadcn, ni émoji ni dégradé (migration Tailwind jugée sur le diff) ; rendu non vérifié (light). Vérifié le 2026-11-19 (QA suivi, light). |
| DES-05 | non fait | `src/styles/base/tokens.css` | aucun | Sombre seulement (`color-scheme: dark`), pas de sélecteur, pas de justification mono-thème. Vérifié le 2026-11-19 (QA suivi, light). |
| DES-06 | partiel | `src/styles/base/tokens.css`, `src/views/game/GamePage.tsx` | aucun | Pas de message « clavier physique » sur mobile ; variantes phone/tiny/compact ajoutées ; 360 px non vérifié. Vérifié le 2026-11-19 (QA suivi, light). |

## 5. Fonctionnalités

### 5.2 Comptes et profil (AUTH)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| AUTH-01 | partiel | `src/server/auth.ts`, `src/accounts/client.ts`, `src/views/home/HomePanel.tsx` | `src/server/auth.test.ts` | Better Auth : GitHub, Discord et identifiants (argon2id). OAuth activé seulement si les variables `GITHUB_*` et `DISCORD_*` existent : configuration de production à vérifier. Aucun test nommé AUTH-01. Vérifié le 2026-11-19 (QA suivi, light). |
| AUTH-02 | complet | `src/server/guest.ts`, `src/server/room-gate.ts`, `src/players/nickname.ts`, `src/views/home/HomePanel.tsx`, `app/room/page.tsx`, `app/game/page.tsx` | `src/server/guest.test.ts`, `src/server/room-gate.test.ts`, `src/players/nickname.test.ts` (`bun test -t AUTH-02`) | Pseudo `[A-Za-z0-9_]{3,20}` validé côté serveur (Zod), même règle que les comptes (choix : ASCII seulement). Session invité dans le cookie `orion_guest` signé HMAC-SHA256 (HttpOnly, SameSite=Lax), expiration de 7 jours inscrite dans le cookie signé ; le cookie lui-même n'a pas de `Max-Age` (cookie de session). Secret `GUEST_SESSION_SECRET` ou `BETTER_AUTH_SECRET`. `/room` et `/game` renvoient à l'accueil sans compte ni cookie valide. Rejoindre depuis l'explorateur renvoie à l'accueil sans message (JOIN-02). Vérifié le 2026-11-19 (QA suivi, light). |
| AUTH-03 | partiel | `src/server/room-gate.ts`, `app/room/page.tsx`, `src/views/room/room.ts`, `src/realtime/server.ts`, `src/players/avatar.ts`, `src/views/profile/ProfileAvatar.tsx`, `src/server/races.ts`, `src/players/bots.ts`, `src/server/account.ts` | `src/server/room-gate.test.ts`, `src/views/room/room.test.ts`, `src/players/avatar.test.ts`, `src/views/profile/ProfileAvatar.test.tsx`, `src/server/races.test.ts`, `tests/smoke/app.smoke.ts` (`bun test -t AUTH-03`) | Création refusée à l'invité seulement sur l'URL (`/room` sans code, invitation ni table → `/home#rooms`), jamais hôte côté client. Trou : aucun salon n'existe côté serveur, donc un invité avec `/room?code=<code inexistant>` obtient un salon, et le serveur temps réel ouvre tout code au premier `join` (à fermer avec SALLE-01). Aucun historique serveur pour un invité, même avec le drapeau bot ou un nom libre (seuls les 7 bots de `BOT_NAMES` ont un historique). Pas de photo (401 sans session). Avatar SVG généré à partir d'un hash du nom, propre à chaque joueur. Choix : l'image commune du podium n'est pas un emplacement de photo. Vérifié le 2026-11-19 (QA suivi, light). |
| AUTH-04 | complet | `src/server/account.ts`, `src/server/auth.ts`, `src/server/api.ts`, `src/players/avatar.ts`, `src/server/races.ts`, `src/views/profile/OwnProfile.tsx`, `src/views/profile/account/PhotoSection.tsx`, `db/migrations/0007_legacy_avatars.sql`, `db/cli.ts` | `src/server/account.test.ts`, `src/server/auth.test.ts`, `src/players/avatar.test.ts`, `tests/smoke/app.smoke.ts` | Type réel (octets magiques et décodage sharp) et 2 Mo validés côté serveur ; `content-length` et le champ `avatar` passent par Zod. Carré WebP de 256 px au plus. `user.image` n'est écrit que par `/api/account/avatar` : `update-user` refuse `image`, l'inscription et OAuth forcent `image: null`. Anciennes photos : la migration 0007 efface les URL externes, et `normalizeStoredAvatars` (lancé après chaque migration) réduit les images non réduites ou efface celles qui ne se décodent pas. L'affichage ne montre qu'un WebP écrit par le serveur (`storedAvatar`). Vérifié en preview Vercel le 2026-11-18 : un JPEG de 1772×1772 px est accepté et affiché, un PNG de 2,9 Mo est refusé (413). Vérifié le 2026-11-19 (QA suivi, light). |
| AUTH-05 | complet | `src/views/profile/account/NameSection.tsx`, `src/accounts/client.ts`, `src/server/auth.ts` | `src/server/auth.test.ts` | Choix : le pseudonyme d'affichage est le pseudo avec sa casse ; le modifier, c'est changer de pseudo (même règle qu'AUTH-02, unicité vérifiée par le serveur). `displayUsername` validé côté serveur : type, format, égal au pseudo à la casse près. Formulaire sans test ; aucun test nommé AUTH-05. Vérifié le 2026-11-19 (QA suivi, light). |
| AUTH-06 | complet | `src/server/races.ts`, `src/views/profile/stats.ts`, `src/views/profile/ProfilePage.tsx`, `src/views/profile/OwnProfile.tsx`, `src/views/profile/CareerStats.tsx`, `app/game/page.tsx` | `src/server/races.test.ts`, `src/views/profile/stats.test.ts`, `src/views/podium/results.test.ts`, `src/views/profile/chart.test.ts`, `tests/smoke/app.smoke.ts` | Courses du compte connecté enregistrées d'après la session, et visibles sur le profil par tous les chemins. Rejeu exact refusé (409). Réserve : un compte peut encore inventer ses stats avec un `id` neuf (MPM et rang viennent du navigateur, à fermer avec COURSE-06). Deux fois le même bot dans un corps → 500. Refonte Tailwind du profil jugée sur le diff. Vérifié le 2026-11-19 (QA suivi, light). |

### 5.3 Salles et visibilité (SALLE)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| SALLE-01 | partiel | `src/views/room/room.ts`, `app/room/page.tsx`, `src/server/room-gate.ts` | `src/server/room-gate.test.ts` | Salle créée seulement dans le navigateur (`localStorage`), aucune route serveur. Choix participant/spectateur absent. Vérifié le 2026-11-19 (QA suivi, light). |
| SALLE-02 | partiel | `src/rooms/access.ts`, `db/schema/rooms.ts` | `src/rooms/access.test.ts` | Format et alphabet bons ; code tiré dans le navigateur (`Math.random`) et jamais inséré : unicité non garantie. Vérifié le 2026-11-18 (QA site, light). |
| SALLE-03 | partiel | `src/rooms/access.ts`, `src/views/room/room.ts` | `src/rooms/access.test.ts` | Tableau des droits défini mais appliqué nulle part : tout `?code=`/`?invite=` ouvre une salle simulée. Vérifié le 2026-11-18 (QA site, light). |
| SALLE-04 | partiel | `src/rooms/access.ts`, `src/views/room/RoomTicket.tsx` | aucun | Un seul jeton par salle (UUID, 122 bits < 128). Ni lien par invité, statut, liaison IP, révocation ni invalidation. Vérifié le 2026-11-19 (QA suivi, light). |
| SALLE-05 | partiel | `src/views/room/room.ts`, `src/views/room/RoomIntro.tsx`, `db/schema/rooms.ts` | aucun | Capacité 2..8 au lieu de 2..30 (contrainte de base comprise). Pas de spectateurs. Vérifié le 2026-11-19 (QA suivi, light). |
| SALLE-06 | non fait | `db/schema/rooms.ts` | aucun | Pas de contrainte « une salle par personne ». Vérifié le 2026-11-18 (QA site, light). |
| SALLE-07 | non fait | — | aucun | Pas d'expulsion. Vérifié le 2026-11-18 (QA site, light). |
| SALLE-08 | non fait | — | aucun | Pas de passation d'hôte ni de fermeture. Vérifié le 2026-11-18 (QA site, light). |
| SALLE-09 | non fait | `db/schema/rooms.ts` | aucun | Colonne `status` non utilisée. Vérifié le 2026-11-18 (QA site, light). |
| SALLE-10 | non fait | — | aucun | Aucune limite de tentatives par IP. Vérifié le 2026-11-18 (QA site, light). |

### 5.4 Rejoindre une course (JOIN)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| JOIN-01 | partiel | `src/views/home/HomePanel.tsx`, `src/rooms/access.ts` | `src/rooms/access.test.ts` | Champ présent ; un code inexistant ouvre une salle simulée, aucune vérification serveur. Vérifié le 2026-11-19 (QA suivi, light). |
| JOIN-02 | partiel | `src/views/home/RoomsView.tsx`, `src/views/home/rooms.ts` | aucun | Liste fixe ; ni filtres, ni hôte/état/complexité, ni mise à jour. Vérifié le 2026-11-19 (QA suivi, light). |
| JOIN-03 | non fait | — | aucun | Pas de « Faire une course » fonctionnel. Vérifié le 2026-11-18 (QA site, light). |

### 5.5 Configuration de la course (CONF)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| CONF-01 | partiel | `src/views/room/RoomSettings.tsx`, `src/views/room/room.ts`, `src/server/races.ts` | aucun | Bornes 10..600 s (serveur 1..) au lieu de 30..600 s ; option « aucun » absente. Vérifié le 2026-11-19 (QA suivi, light). |
| CONF-02 | complet | `src/views/room/RoomSettings.tsx`, `src/views/game/course.ts` | aucun | Langue du texte fr/en, séparée de l'interface. Vérifié le 2026-11-19 (QA suivi, light). |
| CONF-03 | partiel | `src/views/game/course.ts`, `src/views/game/lexicon.ts`, `db/schema/texts.ts` | aucun | Texte cohérent en dur dans le code, `corpus_texts` non utilisée. Vérifié le 2026-11-18 (QA site, light). |
| CONF-04 | partiel | `src/views/game/course.ts`, `src/views/room/RoomSettings.tsx` | aucun | Respecté en aléatoire ; dépassé en cohérent, ignoré en citation. Vérifié le 2026-11-19 (QA suivi, light). |
| CONF-05 | partiel | `src/views/game/lexicon.ts`, `src/views/room/RoomSettings.tsx` | aucun | Trois niveaux, critères mesurables non documentés. Vérifié le 2026-11-19 (QA suivi, light). |
| CONF-06 | partiel | `src/views/game/course.ts`, `src/views/room/RoomSettings.tsx` | aucun | Option majuscules absente. Vérifié le 2026-11-19 (QA suivi, light). |
| CONF-07 | partiel | `src/views/game/course.ts`, `src/views/room/RoomSettings.tsx` | aucun | Exclusion seulement ; comportement en cohérent non documenté. Vérifié le 2026-11-19 (QA suivi, light). |
| CONF-08 | complet | `src/views/game/race.ts` | `src/views/game/race.test.ts` | Correction obligatoire et libre ; mode « fatal » en plus. Vérifié le 2026-11-19 (QA suivi, light). |
| CONF-09 | non fait | — | aucun | Pas d'option de bonus. Vérifié le 2026-11-18 (QA site, light). |
| CONF-10 | partiel | `src/views/room/RoomSettings.tsx`, `src/views/room/room.ts` | aucun | Bots pour toute la salle, niveau commun ; pas d'ajout individuel. Vérifié le 2026-11-19 (QA suivi, light). |
| CONF-11 | partiel | voir SALLE-03, SALLE-05 | — | Renvoie à SALLE-03 et SALLE-05 (partiels). Vérifié le 2026-11-18 (QA site, light). |
| CONF-12 | non fait | `src/realtime/protocol.ts` | aucun | Configuration en `localStorage`, aucun message temps réel. Vérifié le 2026-11-18 (QA site, light). |

### 5.6 Déroulement d'une course (COURSE)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| COURSE-01 | partiel | `src/views/game/race.ts`, `src/views/game/hooks/useRace.ts` | `src/views/game/race.test.ts` | Phases client countdown/racing/done seulement ; machine à états complète absente et non documentée. Vérifié le 2026-11-19 (QA suivi, light). |
| COURSE-02 | partiel | `src/views/room/RoomPage.tsx` | aucun | Règle `>= 2` côté client seulement ; « 1 humain » et spectateurs non gérés ; `/game` accessible directement. Vérifié le 2026-11-19 (QA suivi, light). |
| COURSE-03 | partiel | `src/views/game/hooks/useRace.ts`, `src/views/game/GamePage.tsx` | aucun | Décompte local non synchronisé ; texte tiré par chaque client, avant le décompte. Vérifié le 2026-11-19 (QA suivi, light). |
| COURSE-04 | partiel | `src/views/game/TypingPanel.tsx`, `src/views/game/TypingText.tsx`, `src/views/game/race.ts` | `src/views/game/race.test.ts` | Coller bloqué ; glisser-déposer non bloqué (contourne le coller) ; rendu non vérifié. Vérifié le 2026-11-19 (QA suivi, light). |
| COURSE-05 | partiel | `src/views/game/RacePool.tsx`, `src/views/game/pool/createRacePool.ts` | aucun | Manquent MPM par participant, vrais adversaires et vue spectateur. Vérifié le 2026-11-18 (QA site, light). |
| COURSE-06 | non fait | `src/realtime/server.ts`, `src/realtime/protocol.ts` | `src/realtime/server.test.ts` | Progression déclarée par le client et relayée ; aucun serveur autoritaire. Vérifié le 2026-11-18 (QA site, light). |
| COURSE-07 | non fait | — | aucun | Pas d'abandon. Vérifié le 2026-11-18 (QA site, light). |
| COURSE-08 | non fait | — | aucun | Pas de reprise ni délai de 30 s. Vérifié le 2026-11-18 (QA site, light). |
| COURSE-09 | partiel | `src/views/game/race.ts`, `src/views/game/hooks/useRace.ts` | `src/views/game/race.test.ts` | Fin calculée côté client ; fin au temps max bornée ; cas « tous abandonné » absent. Vérifié le 2026-11-19 (QA suivi, light). |
| COURSE-10 | partiel | `src/views/podium/results.ts` | `src/views/podium/results.test.ts` | Catégorie « abandon » absente ; rang stocké et relu pour l'historique. Vérifié le 2026-11-19 (QA suivi, light). |
| COURSE-11 | partiel | `src/views/podium/PodiumScene.tsx` | `src/views/podium/PodiumScene.test.tsx` | « Rejouer » ouvert à tous, sans changement de configuration, masqué pour une course de l'historique ; fermeture de salle absente. Vérifié le 2026-11-19 (QA suivi, light). |

### 5.7 Bots (BOT)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| BOT-01 | partiel | `src/views/game/race.ts`, `src/views/room/room.ts` | `src/views/game/race.test.ts` | 4 réglages (25–100 MPM) au lieu de 5 niveaux ; non documentés. Vérifié le 2026-11-19 (QA suivi, light). |
| BOT-02 | partiel | `src/views/game/race.ts` | aucun | Ni hésitation ni ralentissement sur mots difficiles. Vérifié le 2026-11-19 (QA suivi, light). |
| BOT-03 | partiel | `src/views/game/race.ts` | `src/views/game/race.test.ts` | Fautes sans temps de correction ; mode d'erreur ignoré. Vérifié le 2026-11-19 (QA suivi, light). |
| BOT-04 | partiel | `src/views/room/RoomPage.tsx`, `src/views/game/GamePage.tsx` | aucun | Pas de marqueur bot sur la piste. Vérifié le 2026-11-19 (QA suivi, light). |
| BOT-05 | partiel | `src/views/game/race.ts`, `src/views/game/hooks/useRace.ts` | `src/views/game/race.test.ts` | Aléa injectable mais pas de graine. Vérifié le 2026-11-19 (QA suivi, light). |

### 5.8 Bonus de remontée (BONUS)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| BONUS-01 | non fait | — | aucun | Aucun code de bonus. Vérifié le 2026-11-18 (QA site, light). |
| BONUS-02 | non fait | — | aucun | Aucun code de bonus. Vérifié le 2026-11-18 (QA site, light). |
| BONUS-03 | non fait | — | aucun | Aucun code de bonus. Vérifié le 2026-11-18 (QA site, light). |
| BONUS-04 | non fait | — | aucun | Aucun code de bonus. Vérifié le 2026-11-18 (QA site, light). |

### 5.9 Résultats et statistiques (RES)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| RES-01 | complet | `src/views/podium/PodiumScene.tsx`, `src/views/podium/results.ts` | `src/views/podium/results.test.ts`, `src/views/podium/PodiumScene.test.tsx` | Vérifié le 2026-11-19 (QA suivi, light). |
| RES-02 | partiel | `src/views/podium/PodiumBoard.tsx`, `src/views/podium/results.ts` | aucun | Manquent MPM brut, erreurs, temps, statut et bonus ; `<ol>` au lieu de `<table>`. Vérifié le 2026-11-19 (QA suivi, light). |
| RES-03 | partiel | `src/views/profile/SpeedChart.tsx`, `src/views/profile/KeyboardHeatmap.tsx` | `src/views/profile/chart.test.ts`, `src/views/profile/keyboard.test.ts` | Graphique MPM à un seul joueur ; carte de chaleur cumulée sur la carrière. Vérifié le 2026-11-19 (QA suivi, light). |
| RES-04 | non fait | — | aucun | Aucun indicateur de record personnel. Vérifié le 2026-11-18 (QA site, light). |
| RES-05 | partiel | `src/server/races.ts`, `db/schema/races.ts` | `src/server/races.test.ts` | Sans bonus ni statut détaillé ; valeurs crues du navigateur (bornées par Zod, non recalculées, rang = ordre envoyé) ; colonne `others` ajoutée pour les non-inscrits. Vérifié le 2026-11-19 (QA suivi, light). |

### 5.10 Historique (HIST)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| HIST-01 | complet | `src/server/history.ts`, `src/server/races.ts`, `src/views/profile/RaceHistory.tsx`, `src/views/profile/history.ts`, `src/views/podium/results.ts`, `src/views/game/race.ts`, `src/views/game/GamePage.tsx` | `src/server/history.test.ts`, `src/views/profile/history.test.ts`, `src/views/podium/results.test.ts`, `src/views/game/race.test.ts` | 10 courses par page côté serveur, joueur pris dans la session (invité 403, sans session 401). Vu dans le navigateur le 2026-11-18 : course réelle listée, course de 600 s et course à 8 joueurs (84 Ko) enregistrées, pagination fr/en à 1280 et 360 px. Refus signalé sur le podium ; limites : petite course refusée après 1,5 s non signalée, grosse course sans réponse en 10 s. Migration 0008 obligatoire avant déploiement (sans elle, POST /api/races → 500). Refonte Tailwind jugée sur le diff, rendu non revu. Vérifié le 2026-11-19 (QA suivi, light). |
| HIST-02 | complet | `src/server/history.ts`, `db/schema/races.ts`, `db/migrations/0008_race_others.sql`, `src/views/podium/hooks/useRaceResults.ts`, `src/views/podium/PodiumPage.tsx`, `src/views/podium/PodiumScene.tsx`, `src/views/podium/PodiumBoard.tsx`, `src/views/profile/ProfilePage.tsx` | `src/server/history.test.ts`, `src/views/podium/history.test.ts`, `src/views/podium/PodiumScene.test.tsx` | `/podium?race=N` relu via `/api/history/N` : tous les participants à leur rang (`races.others`), détail RES-02 et séries via `/profile?race=N&player=i`. Course d'un autre = 404 comme une course inexistante, pas de « Rejouer ». Vu en fr/en à 1280 et 360 px le 2026-11-18. Courses antérieures à 0008 sans invités. Refonte Tailwind jugée sur le diff. Vérifié le 2026-11-19 (QA suivi, light). |

### 5.11 Internationalisation (I18N)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| I18N-01 | complet | `src/i18n/locales/fr.json`, `src/i18n/locales/en.json`, `src/i18n/server.ts`, `src/i18n/request.ts`, `app/layout.tsx`, `app/not-found.tsx`, `app/*/page.tsx` | `tests/i18n/i18n-01.test.ts` | Titres et `<html lang>` rendus côté serveur selon le cookie puis `Accept-Language`. Pas de meta description (le titre seul est traduit). Réserves mineures : placeholder « Corail_418 » (`HomePanel.tsx:170`) et kanji « 始 » (`GamePage.tsx:79`) en dur. Aucun texte en dur ajouté par la refonte Tailwind (diff). Rendu fr/en vu le 2026-11-18. Vérifié le 2026-11-19 (QA suivi, light). |
| I18N-02 | complet | `src/components/tabs/LanguageSwitcher.tsx`, `src/i18n/index.ts`, `src/i18n/server.ts`, `src/i18n/request.ts`, `src/next/NotFoundSwitcher.tsx`, les 5 `*Page.tsx` | `tests/i18n/i18n-02.test.ts` | Cookie `orion-lang` (un an, `Path=/`), repli sur le navigateur côté client et serveur, puis anglais. La 404 recharge la page après le choix. Vérifié le 2026-11-19 (QA suivi, light). |
| I18N-03 | complet | `src/i18n/format.ts` | `src/i18n/format.test.ts`, `src/views/profile/format.test.tsx`, `src/views/room/useRoomLabels.test.tsx` | `Intl` en fr-CA ou en-CA. Réserve mineure : graduations des axes des graphiques non formatées (`ProgressChart.tsx:51`, `SpeedChart.tsx`). Vérifié le 2026-11-18 (QA section 5.11, nombres et dates en fr et en à l'écran). |

## 6. Qualité

### 6.1 Tests (TEST)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| TEST-01 | complet | `src/**/*.test.ts`, `db/mocks/seed.test.ts`, `tests/tech/`, `tests/i18n/`, `scripts/*.test.ts` | `bun test` (404 réussis) | Vérifié le 2026-11-19 (QA suivi, light). |
| TEST-02 | non fait | — | aucun | Pas de Playwright. Vérifié le 2026-11-18 (QA site, light). |
| TEST-03 | non fait | — | aucun | Dépend de TEST-02. Vérifié le 2026-11-18 (QA site, light). |

### 6.2 Performance (PERF)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| PERF-01 | partiel | `app/home/page.tsx` | aucun | Lighthouse non mesuré. Vérifié le 2026-11-19 (QA suivi, light). |
| PERF-02 | complet | `src/realtime/server.ts`, `src/realtime/client.ts`, `src/realtime/protocol.ts` | `src/realtime/server.test.ts` | 10 envois/s max ; écriture en base en fin de course. Vérifié le 2026-11-18 (QA site, light). |
| PERF-03 | partiel | `src/views/game/pool/createRacePool.ts` | aucun | Fluidité à 8 couloirs non mesurée. Vérifié le 2026-11-18 (QA site, light). |

### 6.3 Accessibilité (A11Y)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| A11Y-01 | partiel | `src/styles/base/tokens.css`, `src/components/forms/TextField.tsx` | aucun | Un seul thème ; muted vers 6,4:1 ok ; placeholders blanc 30 % vers 2,4:1 sous AA ; reste non mesuré. Vérifié le 2026-11-19 (QA suivi, light). |
| A11Y-02 | partiel | `src/views/*/…Page.tsx`, `src/views/podium/PodiumBoard.tsx`, `src/components/navigation/Navbar.tsx` | aucun | Pas de `<footer>` ; podium en `<ol>` et sans `<main>` ni `<h1>` ; `/game` sans `<main>`. Vérifié le 2026-11-19 (QA suivi, light). |
| A11Y-03 | partiel | `src/views/room/TextEditorDialog.tsx`, `src/views/profile/ProfileAvatar.tsx` | aucun | Champ nom du texte sans libellé (l.109) ; SVG d'avatar généré sans alternative. Vérifié le 2026-11-19 (QA suivi, light). |
| A11Y-04 | partiel | `src/components/**`, `src/views/**` | aucun | `focus-visible:outline` sur boutons et onglets, `.name-input` désormais en `focus:border-white` ; parcours clavier non vérifié. Vérifié le 2026-11-19 (QA suivi, light). |

### 6.4 Sécurité (SEC)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| SEC-01 | non fait | `src/realtime/server.ts`, `src/views/room/room.ts`, `src/views/room/RoomPage.tsx` | aucun | Aucune action d'hôte côté serveur. Vérifié le 2026-11-19 (QA suivi, light). |
| SEC-02 | complet | `src/server/account.ts`, `src/server/auth.ts` | `src/server/account.test.ts` | Type par octets, 2 Mo max, sharp. Sans `content-length`, lecture complète avant contrôle (mineur). Vérifié le 2026-11-18 (QA site, light). |
| SEC-03 | complet | `src/server/auth.ts` | `src/server/auth.test.ts` (indirect) | argon2id via `Bun.password`. Vérifié le 2026-11-18 (QA site, light). |
