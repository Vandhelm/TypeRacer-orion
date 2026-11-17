# Exigences — matrice de traçabilité

Statut de chaque exigence de `docs/criteres.md` : **complet**, **partiel** ou **non fait** (vocabulaire de l'énoncé). `non vérifié` veut dire qu'aucune QA n'a encore porté sur l'exigence ; il doit avoir disparu avant la remise.

Les statuts viennent des rapports de l'agent `qa` (skill `criteria-check`). Une exigence ne passe à « complet » qu'avec un rapport QA qui le prouve : une fausse déclaration est pénalisée plus sévèrement qu'un « partiel » honnête.

## 3. Contraintes techniques (TECH)

| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |
|---|---|---|---|---|
| TECH-01 | non fait | `package.json`, `build.ts`, `server.ts` | aucun | Choix assumé : Bun (vu en classe) avec React et TypeScript, au lieu de Next.js App Router. Pages HTML par entrée (`home.html`, `room.html`…) bâties par `build.ts`. Inscrit le 2026-11-17. |
| TECH-02 | non vérifié |  |  |  |
| TECH-03 | non vérifié |  |  |  |
| TECH-04 | non vérifié |  |  |  |
| TECH-05 | partiel | `vercel.json`, `api/` | aucun | Application déployée publiquement en HTTPS sur Vercel, pas sur un VPS. Choix assumé : on garde la plateforme utilisée depuis le début. À confirmer avec l'enseignant. Inscrit le 2026-11-17. |
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
| AUTH-01 | partiel | `src/server/auth.ts`, `src/accounts/client.ts`, `src/pages/home/HomePanel.tsx` | `src/server/auth.test.ts` | Better Auth : GitHub, Discord et identifiants (argon2id). OAuth activé seulement si les variables `GITHUB_*` et `DISCORD_*` existent : configuration de production à vérifier. Vérifié le 2026-11-17 (QA section 5.2). |
| AUTH-02 | partiel | `src/players/nickname.ts`, `src/pages/home/HomePanel.tsx` | aucun | Pseudo `[A-Za-z0-9_]{3,20}` côté client seulement (choix ASCII à documenter). Pas de cookie signé (`sessionStorage`). On peut rejoindre sans pseudo (`Invite_XXXX` attribué). Vérifié le 2026-11-17 (QA section 5.2). |
| AUTH-03 | partiel | `src/pages/home/HomePanel.tsx`, `src/pages/room/room.ts`, `src/server/races.ts`, `src/pages/profile/ProfileAvatar.tsx`, `src/styles/pages/profile/profile.css` | `src/server/races.test.ts` | Pas d'historique ni de photo pour un invité. Création de salle bloquée par le bouton seulement (`/room?new` ouvert, rien côté serveur). Avatar identique pour tous, pas généré. Vérifié le 2026-11-17 (QA section 5.2). |
| AUTH-04 | partiel | `src/server/account.ts`, `src/accounts/avatar.ts`, `src/pages/profile/account/PhotoSection.tsx` | `src/server/account.test.ts` | Type réel (octets magiques) et 2 Mo validés côté serveur. Redimensionnement à 256 px dans le navigateur seulement : le serveur stocke ce qu'il reçoit. Vérifié le 2026-11-17 (QA section 5.2). |
| AUTH-05 | partiel | `src/pages/profile/account/NameSection.tsx`, `src/accounts/client.ts`, `src/server/auth.ts` | `src/server/auth.test.ts` | `username` validé par le plugin. `displayUsername` non validé côté serveur et utilisé pour renommer le joueur. Vérifié le 2026-11-17 (QA section 5.2). |
| AUTH-06 | partiel | `src/server/races.ts`, `src/pages/profile/CareerStats.tsx`, `src/pages/profile/ProgressChart.tsx`, `src/pages/profile/OwnProfile.tsx` | `src/server/races.test.ts`, `src/pages/profile/stats.test.ts`, `src/pages/profile/chart.test.ts` | Statistiques et graphique affichés. Les courses des comptes connectés ne sont pas enregistrées (`recordRace` ne garde que les bots) : profil d'un compte toujours vide. Vérifié le 2026-11-17 (QA section 5.2). |

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
