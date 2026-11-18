# Exigences — matrice de traçabilité

Statut de chaque exigence de `docs/criteres.md` : **complet**, **partiel** ou **non fait** (vocabulaire de l'énoncé). `non vérifié` veut dire qu'aucune QA n'a encore porté sur l'exigence ; il doit avoir disparu avant la remise.

Les statuts viennent des rapports de l'agent `qa` (skill `criteria-check`). Une exigence ne passe à « complet » qu'avec un rapport QA qui le prouve : une fausse déclaration est pénalisée plus sévèrement qu'un « partiel » honnête.

## 3. Contraintes techniques (TECH)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| TECH-01 | complet | `app/`, `src/next/LegacyPage.tsx`, `next.config.ts`, `vercel.json`, `package.json` | `tests/tech/tech-01.test.ts`, `tests/smoke/app.smoke.ts` | Next.js 16.4.6, App Router, React 19.3.1. Ancienne pile Bun retirée. `ignoreBuildErrors: true` (TypeScript 7), types vérifiés par tsc en CI. Vérifié le 2026-11-18 (QA section 3, `feature/section/3-tech`). |
| TECH-02 | complet | `tsconfig.json`, `.oxlintrc.json`, `src/views/game/pool/createRacePool.ts`, `src/views/home/scene/createScene.ts` | `tests/tech/tech-02.test.ts`, CI `check:no-js` | Choix : oxlint applique la règle ESLint `@typescript-eslint/no-explicit-any` en erreur (typescript-eslint ne supporte pas TypeScript 7). Lint et tsc à 0 sur l'ensemble intégré. Vérifié le 2026-11-18 (QA section 3). |
| TECH-03 | partiel | `postcss.config.json`, `src/styles/base/tokens.css`, `src/styles/pages/*` | aucun | Tailwind v4 branché (`@theme`, quelques utilitaires) ; l'essentiel du style est en CSS écrit à la main. À trancher. Vérifié le 2026-11-18 (QA section 3). |
| TECH-04 | complet | `db/schema`, `db/migrations/`, `db/mocks/seed.ts`, `drizzle.config.ts` | `db/mocks/seed.test.ts` | Postgres et Drizzle ; seed avec corpus, comptes et historique (courses, résultats, échantillons). Vérifié le 2026-11-18 (QA section 3). |
| TECH-05 | partiel | `vercel.json`, `fly.toml`, `Dockerfile.realtime` | aucun | Écart assumé : Vercel et Fly.io, pas de VPS. HTTPS public non vérifié par la QA (smoke avec `BASE_URL` à lancer). Serveur temps réel non déployé. Vérifié le 2026-11-18 (QA section 3). |
| TECH-06 | partiel | `src/realtime/*`, `src/server/realtime-ticket.ts`, `src/server/guest.ts`, `src/views/room/LiveList.tsx`, `src/views/room/live.ts`, `RoomPage.tsx`, `GamePage.tsx` | `src/realtime/*.test.ts`, `src/server/realtime-ticket.test.ts`, `src/views/room/live.test.ts`, `src/server/guest.test.ts` | Choix : serveur Bun WebSocket séparé (ADR dans `docs/ARCHITECTURE.md`). Progression visible dans la salle et dans l'en-tête de la course. Non déployé (Fly.io préparé) : rien en production. Le canal ne vérifie pas l'appartenance à la salle (à faire avec SALLE). Progression déclarée par le client (documenté, COURSE-06). Vérifié le 2026-11-18 (QA section 3). |
| TECH-07 | complet | `src/server/races.ts`, `account.ts`, `guest.ts`, `room-gate.ts`, `proxy.ts`, `src/realtime/protocol.ts`, `src/realtime/ticket.ts` | `src/server/inputs.test.ts`, `src/realtime/protocol.test.ts`, `src/server/races.test.ts`, smoke TECH-07 | Routes API, pages serveur, cookies, ticket et messages WebSocket validés par Zod ; corps limité à 512 Ko. Aucune action serveur. Better Auth valide ses propres routes (équivalent). Vérifié le 2026-11-18 (QA section 3). |
| TECH-08 | partiel | `fly.toml`, `docs/ARCHITECTURE.md` | aucun | Vercel Hobby. Gratuité de Fly.io non établie ; base de production et accès de l'enseignant non documentés. Vérifié le 2026-11-18 (QA section 3). |
| TECH-09 | complet | `.github/workflows/ci.yml` | toute la suite | Lint, `tsc --noEmit` et `bun test` à chaque push, puis builds, smoke et contrôle no-JS (bloquant). Aucun run GitHub observé. Vérifié le 2026-11-18 (QA section 3). |
| TECH-10 | partiel | `.env.example`, `.gitignore` | aucun | Aucun secret commité. Manquent `BASE_URL` et `SMOKE_*` (variables des tests smoke). Vérifié le 2026-11-18 (QA section 3). |

## 4. Identité visuelle et design (DES)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| DES-01 | non vérifié |  |  |  |
| DES-02 | non vérifié |  |  |  |
| DES-03 | non vérifié |  |  |  |
| DES-04 | non vérifié |  |  |  |
| DES-05 | non vérifié |  |  |  |
| DES-06 | non vérifié |  |  |  |

## 5. Fonctionnalités

### 5.2 Comptes et profil (AUTH)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| AUTH-01 | partiel | `src/server/auth.ts`, `src/accounts/client.ts`, `src/views/home/HomePanel.tsx` | `src/server/auth.test.ts` | Better Auth : GitHub, Discord et identifiants (argon2id). OAuth activé seulement si les variables `GITHUB_*` et `DISCORD_*` existent : configuration de production à vérifier. Vérifié le 2026-11-17 (QA section 5.2). |
| AUTH-02 | complet | `src/server/guest.ts`, `src/server/room-gate.ts`, `src/players/nickname.ts`, `src/views/home/HomePanel.tsx`, `app/room/page.tsx` | `src/server/guest.test.ts`, `src/server/room-gate.test.ts`, `src/players/nickname.test.ts` (`bun test -t AUTH-02`) | Pseudo `[A-Za-z0-9_]{3,20}` validé côté serveur (Zod), même règle que les comptes (choix : ASCII seulement). Session invité dans le cookie `orion_guest` signé HMAC-SHA256 (HttpOnly, SameSite=Lax, 7 jours), secret `GUEST_SESSION_SECRET` ou `BETTER_AUTH_SECRET`. `/room` renvoie à l'accueil sans compte ni cookie valide. Rejoindre depuis l'explorateur renvoie à l'accueil sans message (JOIN-02). Vérifié le 2026-11-17 (QA critère, mode light, branche `feature/home/auth-02`). |
| AUTH-03 | complet | `src/server/room-gate.ts`, `app/room/page.tsx`, `src/views/room/room.ts`, `src/players/avatar.ts`, `src/views/profile/ProfileAvatar.tsx`, `src/server/races.ts`, `src/players/bots.ts`, `src/server/account.ts` | `src/server/room-gate.test.ts`, `src/views/room/room.test.ts`, `src/players/avatar.test.ts`, `src/views/profile/ProfileAvatar.test.tsx`, `src/server/races.test.ts`, `tests/smoke/app.smoke.ts` (`bun test -t AUTH-03`) | Création de salle refusée à l'invité côté serveur (`/room` sans code, invitation ni table → `/home#rooms`), jamais hôte côté client. Aucun historique serveur pour un invité, même avec le drapeau bot ou un nom libre (seuls les 7 bots de `BOT_NAMES` ont un historique). Pas de photo (401 sans session). Avatar SVG généré à partir d'un hash du nom, propre à chaque joueur. Choix : l'image commune du podium n'est pas un emplacement de photo. Vérifié le 2026-11-18 (QA critère, branches `fix/room/auth-03` et `fix/profile/auth-06`, mergées dans dev). |
| AUTH-04 | complet | `src/server/account.ts`, `src/server/auth.ts`, `src/server/api.ts`, `src/players/avatar.ts`, `src/server/races.ts`, `src/views/profile/OwnProfile.tsx`, `src/views/profile/account/PhotoSection.tsx`, `db/migrations/0007_legacy_avatars.sql`, `db/cli.ts` | `src/server/account.test.ts`, `src/server/auth.test.ts`, `src/players/avatar.test.ts`, `tests/smoke/app.smoke.ts` | Type réel (octets magiques et décodage sharp) et 2 Mo validés côté serveur. Carré WebP de 256 px au plus. `user.image` n'est écrit que par `/api/account/avatar` : `update-user` refuse `image`, l'inscription et OAuth forcent `image: null`. Anciennes photos : la migration 0007 efface les URL externes, et `normalizeStoredAvatars` (lancé après chaque migration) réduit les images non réduites ou efface celles qui ne se décodent pas. L'affichage ne montre qu'un WebP écrit par le serveur (`storedAvatar`). Vérifié en preview Vercel le 2026-11-18 : un JPEG de 1772×1772 px est accepté et affiché, un PNG de 2,9 Mo est refusé (413). Vérifié le 2026-11-18 (QA critère, `fix/profile/auth-04-legacy`, plus essai manuel en preview). |
| AUTH-05 | complet | `src/views/profile/account/NameSection.tsx`, `src/accounts/client.ts`, `src/server/auth.ts` | `src/server/auth.test.ts` | Choix : le pseudonyme d'affichage est le pseudo avec sa casse ; le modifier, c'est changer de pseudo (même règle qu'AUTH-02, unicité vérifiée par le serveur). `displayUsername` validé côté serveur : type, format, égal au pseudo à la casse près. Formulaire sans test. Vérifié le 2026-11-17 (QA critère, branche `fix/profile/auth-05`). |
| AUTH-06 | complet | `src/server/races.ts`, `src/views/profile/stats.ts`, `src/views/profile/ProfilePage.tsx`, `src/views/profile/OwnProfile.tsx`, `src/views/profile/CareerStats.tsx`, `app/game/page.tsx` | `src/server/races.test.ts`, `src/views/profile/stats.test.ts`, `src/views/podium/results.test.ts`, `src/views/profile/chart.test.ts`, `tests/smoke/app.smoke.ts` | Courses du compte connecté enregistrées d'après la session, et visibles sur le profil par tous les chemins. Rejeu exact refusé (409). Réserve : un compte peut encore inventer ses stats avec un `id` neuf (MPM et rang viennent du navigateur, à fermer avec COURSE-06). Deux fois le même bot dans un corps → 500. Vérifié le 2026-11-18 (QA critère, branche `fix/profile/auth-06`, mergée dans dev). |

### 5.3 Salles et visibilité (SALLE)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| SALLE-01 | non vérifié |  |  |  |
| SALLE-02 | non vérifié |  |  |  |
| SALLE-03 | non vérifié |  |  |  |
| SALLE-04 | non vérifié |  |  |  |
| SALLE-05 | non vérifié |  |  |  |
| SALLE-06 | non vérifié |  |  |  |
| SALLE-07 | non vérifié |  |  |  |
| SALLE-08 | non vérifié |  |  |  |
| SALLE-09 | non vérifié |  |  |  |
| SALLE-10 | non vérifié |  |  |  |

### 5.4 Rejoindre une course (JOIN)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| JOIN-01 | non vérifié |  |  |  |
| JOIN-02 | non vérifié |  |  |  |
| JOIN-03 | non vérifié |  |  |  |

### 5.5 Configuration de la course (CONF)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| CONF-01 | non vérifié |  |  |  |
| CONF-02 | non vérifié |  |  |  |
| CONF-03 | non vérifié |  |  |  |
| CONF-04 | non vérifié |  |  |  |
| CONF-05 | non vérifié |  |  |  |
| CONF-06 | non vérifié |  |  |  |
| CONF-07 | non vérifié |  |  |  |
| CONF-08 | non vérifié |  |  |  |
| CONF-09 | non vérifié |  |  |  |
| CONF-10 | non vérifié |  |  |  |
| CONF-11 | non vérifié |  |  |  |
| CONF-12 | non vérifié |  |  |  |

### 5.6 Déroulement d'une course (COURSE)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| COURSE-01 | non vérifié |  |  |  |
| COURSE-02 | non vérifié |  |  |  |
| COURSE-03 | non vérifié |  |  |  |
| COURSE-04 | non vérifié |  |  |  |
| COURSE-05 | non vérifié |  |  |  |
| COURSE-06 | non vérifié |  |  |  |
| COURSE-07 | non vérifié |  |  |  |
| COURSE-08 | non vérifié |  |  |  |
| COURSE-09 | non vérifié |  |  |  |
| COURSE-10 | non vérifié |  |  |  |
| COURSE-11 | non vérifié |  |  |  |

### 5.7 Bots (BOT)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| BOT-01 | non vérifié |  |  |  |
| BOT-02 | non vérifié |  |  |  |
| BOT-03 | non vérifié |  |  |  |
| BOT-04 | non vérifié |  |  |  |
| BOT-05 | non vérifié |  |  |  |

### 5.8 Bonus de remontée (BONUS)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| BONUS-01 | non vérifié |  |  |  |
| BONUS-02 | non vérifié |  |  |  |
| BONUS-03 | non vérifié |  |  |  |
| BONUS-04 | non vérifié |  |  |  |

### 5.9 Résultats et statistiques (RES)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| RES-01 | non vérifié |  |  |  |
| RES-02 | non vérifié |  |  |  |
| RES-03 | non vérifié |  |  |  |
| RES-04 | non vérifié |  |  |  |
| RES-05 | non vérifié |  |  |  |

### 5.10 Historique (HIST)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| HIST-01 | partiel | `src/server/history.ts`, `src/server/races.ts`, `src/views/profile/RaceHistory.tsx`, `src/views/profile/history.ts`, `src/views/podium/results.ts`, `src/views/game/race.ts` | `src/server/history.test.ts`, `src/views/profile/history.test.ts`, `src/views/podium/results.test.ts`, `src/views/game/race.test.ts` | Liste paginée par 10 côté serveur, joueur pris dans la session (invité 403, sans session 401). Grosse course envoyée sans keepalive ; temps et séries bornés à la durée ; refus signalé sur le podium. Partiel : ces derniers correctifs (tour 3) ne sont pas encore revérifiés par une QA ; limite documentée : grosse course sans réponse en 10 s. Migration 0008 à appliquer sur la base de dev. QA 2026-11-18, feature/section/5-10-hist. |
| HIST-02 | partiel | `src/server/history.ts`, `db/schema/races.ts`, `db/migrations/0008_race_others.sql`, `src/views/podium/hooks/useRaceResults.ts`, `src/views/podium/PodiumPage.tsx`, `src/views/profile/ProfilePage.tsx` | `src/server/history.test.ts`, `src/views/podium/history.test.ts`, `src/views/podium/PodiumScene.test.tsx` | `/podium?race=N` relu via `/api/history/N` : tous les participants à leur rang (`races.others`), course d'un autre = 404 comme inexistante, pas de « Rejouer ». Rendu vu au tour 2 ; partiel car les changements de podium des tours 2 et 3 n'ont pas été revus dans le navigateur. Courses antérieures à 0008 sans invités. Complet de la page dépend de RES-02/03/04. QA 2026-11-18. |

### 5.11 Internationalisation (I18N)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| I18N-01 | non vérifié |  |  |  |
| I18N-02 | non vérifié |  |  |  |
| I18N-03 | non vérifié |  |  |  |

## 6. Qualité

### 6.1 Tests (TEST)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| TEST-01 | non vérifié |  |  |  |
| TEST-02 | non vérifié |  |  |  |
| TEST-03 | non vérifié |  |  |  |

### 6.2 Performance (PERF)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| PERF-01 | non vérifié |  |  |  |
| PERF-02 | non vérifié |  |  |  |
| PERF-03 | non vérifié |  |  |  |

### 6.3 Accessibilité (A11Y)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| A11Y-01 | non vérifié |  |  |  |
| A11Y-02 | non vérifié |  |  |  |
| A11Y-03 | non vérifié |  |  |  |
| A11Y-04 | non vérifié |  |  |  |

### 6.4 Sécurité (SEC)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| SEC-01 | non vérifié |  |  |  |
| SEC-02 | non vérifié |  |  |  |
| SEC-03 | non vérifié |  |  |  |
