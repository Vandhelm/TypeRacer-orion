# Exigences — matrice de traçabilité

Statut de chaque exigence de `docs/criteres.md` : **complet**, **partiel** ou **non fait** (vocabulaire de l'énoncé). `non vérifié` veut dire qu'aucune QA n'a encore porté sur l'exigence ; il doit avoir disparu avant la remise.

Les statuts viennent des rapports de l'agent `qa` (skill `criteria-check`). Une exigence ne passe à « complet » qu'avec un rapport QA qui le prouve : une fausse déclaration est pénalisée plus sévèrement qu'un « partiel » honnête.

## 3. Contraintes techniques (TECH)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| TECH-01 | complet | `app/`, `src/next/LegacyPage.tsx`, `src/next/LegacyRoot.tsx`, `next.config.ts`, `vercel.json`, `package.json` | `tests/smoke/app.smoke.ts` (`bun test -t TECH-01`) | Next.js 16.4.6 (dernière stable au 2026-11-17), App Router, React 19.3.1. Choix : migration progressive. Les pages sont l'ancienne app React rendue dans le navigateur (`LegacyPage`, `ssr: false`), avec navigation par rechargement complet. `server.ts`, `*.html`, `main.tsx`, `build.ts` et `server 2.ts` sont encore à retirer. `ignoreBuildErrors: true`, types vérifiés par `tsc` en CI. Déploiement Vercel non vérifié (TECH-05). Vérifié le 2026-11-17 (QA critère, branche `feature/app/tech-01`). |
| TECH-02 | non vérifié |  |  |  |
| TECH-03 | non vérifié |  |  |  |
| TECH-04 | non vérifié |  |  |  |
| TECH-05 | partiel | `vercel.json`, `app/` | aucun | Application déployée publiquement en HTTPS sur Vercel, pas sur un VPS. Choix assumé : on garde la plateforme utilisée depuis le début. À confirmer avec l'enseignant. Inscrit le 2026-11-17. |
| TECH-06 | non vérifié |  |  |  |
| TECH-07 | non vérifié |  |  |  |
| TECH-08 | non vérifié |  |  |  |
| TECH-09 | non vérifié |  |  |  |
| TECH-10 | non vérifié |  |  |  |

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
| AUTH-04 | complet | `src/server/account.ts`, `src/server/auth.ts`, `src/server/api.ts`, `src/accounts/avatar.ts`, `src/views/profile/account/PhotoSection.tsx` | `src/server/account.test.ts`, `src/server/auth.test.ts` | Type réel (octets magiques et décodage sharp) et 2 Mo validés côté serveur. Carré WebP de 256 px au plus. `user.image` n'est écrit que par `/api/account/avatar` : `update-user` refuse `image`, et le hook de mise à jour retire `image` de toute autre écriture interne. L'inscription et OAuth forcent `image: null`. À faire : nettoyer les `user.image` existants qui ne sont pas des WebP en `data:`. `sharp` en production non vérifié (TECH-05). Vérifié le 2026-11-18 (QA critère, mode medium, `fix/profile/auth-04`). |
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
| HIST-01 | non vérifié |  |  |  |
| HIST-02 | non vérifié |  |  |  |

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
