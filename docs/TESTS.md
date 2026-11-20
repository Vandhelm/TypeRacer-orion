# Tests

| Commande | Rôle | Base |
|---|---|---|
| `bun test` | tests unitaires et de régression (`*.test.ts`) | PGlite en mémoire, sans Docker |
| `bun run test:smoke` | l'application démarre et répond (`tests/smoke/app.smoke.ts`) | `<base>_smoke` jetable |
| `bun run test:e2e` | parcours de bout en bout dans Chromium, avec Playwright (TEST-02) | `<base>_e2e` jetable |
| `bun run test:a11y` | contraste des textes (WCAG AA) sur chaque page, axe-core dans Chromium (A11Y-01) ; hors de `bun test` | `<base>_e2e` jetable |
| `bun run lighthouse [url]` | Lighthouse sur l'accueil, mobile et desktop, seuil 90 par catégorie (PERF-01) ; hors de `bun test` | celle du serveur mesuré |

## Tests de bout en bout (TEST-02, TEST-03)

Specs : `tests/e2e/*.e2e.ts`, configuration : `playwright.config.ts`. Le suffixe `.e2e.ts` les tient hors de `bun test`, qui ne ramasse que `*.test.ts`, `*_test.ts`, `*.spec.ts` et `*_spec.ts`.

Parcours couverts, chacun avec des comptes neufs créés par le test (`freshUsername`, jamais un compte de démo) :

- `auth.e2e.ts` : inscription, déconnexion, connexion et session gardée au rechargement ; mauvais mot de passe refusé (401, pas de session) ; nom déjà pris refusé.
- `room.e2e.ts` : un compte crée un salon, un invité y entre par un lien d'invitation et l'hôte le voit arriver en temps réel ; un lien déjà utilisé est refusé à un second invité ; un invité ne crée pas de salon, ni depuis la page ni par un appel direct à `POST /api/rooms` (403).
- `race.e2e.ts` : course de 30 s sur un texte très court contre les bots du salon (réglages attendus côté serveur avant le départ), frappe au clavier de tout le texte affiché, arrivée, podium avec l'hôte premier.

**TEST-03** : les tests se connectent par nom d'utilisateur et mot de passe (AUTH-01) uniquement. Le serveur de test est lancé sans GitHub ni Discord (`GITHUB_*` et `DISCORD_*` vides), aucun parcours OAuth n'est suivi.

### Lancer

```bash
bun install
bunx playwright install chromium   # une fois par machine
bun run db:up                      # Postgres du projet (docker-compose.yml), ou tout autre Postgres
bun run test:e2e
```

Sans Docker, un Postgres local jetable suffit (Homebrew `postgresql`), puis `E2E_DATABASE_URL=postgres://orion@localhost:5544/orion_e2e bun run test:e2e` :

```bash
LANG=C LC_ALL=C initdb -D /tmp/orion-pg -U orion --auth=trust --locale=C
LANG=C LC_ALL=C pg_ctl -D /tmp/orion-pg -o "-p 5544 -k ''" -l /tmp/orion-pg.log -w start
# après les tests : pg_ctl -D /tmp/orion-pg -m fast stop && rm -rf /tmp/orion-pg
```

- `LANG=C` et `--locale=C` : sinon `initdb` peut refuser la locale du terminal (« configuration invalide de la locale »).
- `-k ''` (TCP seulement) ou un `-k` court (`-k /tmp`) : le chemin de la socket Unix est limité à 103 octets sur macOS ; un dossier de données profond fait échouer le démarrage (« Unix-domain socket path … is too long »).

Le `webServer` de `playwright.config.ts` fait tout le reste, dans cet ordre :

1. `tests/e2e/prepare-database.ts` : crée la base `_e2e` si besoin (en se connectant à la base `postgres` du même serveur), puis `bun db/cli.ts reset` avec `NODE_ENV=test` : schéma vidé, migrations de `db/migrations` rejouées, données de démo de `db/mocks` chargées. Ta base de développement n'est jamais touchée.
2. `bun run next:build`, sauf avec `E2E_SKIP_BUILD=1` (réutilise le build présent).
3. `next start` sur le port 3100 et le serveur temps réel sur le port 3101, à côté d'un `bun run dev` éventuel (3000 et 3001).

Pourquoi pas `bun run dev` : sous Bun, `next dev` (Turbopack) ne charge pas `sharp` (« Failed to load external module sharp-… ») et toutes les pages répondent 500. `next start` est aussi ce que servent la production et les smoke tests.

### Variables

| Variable | Rôle | Défaut |
|---|---|---|
| `E2E_DATABASE_URL` | base des tests, remise à zéro à chaque lancement | `DATABASE_URL` suffixée par `_e2e` (l'une des deux est obligatoire) |
| `E2E_PORT`, `E2E_REALTIME_PORT` | ports du serveur de test et du temps réel | 3100 et 3101 |
| `E2E_SKIP_BUILD` | `1` : ne reconstruit pas l'application | vide |
| `BETTER_AUTH_SECRET` | secret des sessions | celui du `.env`, sinon une valeur de test |

Le fichier `.env` est lu s'il existe. Le serveur de test reçoit aussi `TRUST_PROXY=1` : sans proxy déclaré, `next start` ne connaît pas l'IP du client et refuse tous les liens d'invitation (SALLE-04) ; Next.js pose alors `x-forwarded-for` à l'IP de la socket, mais seulement si l'en-tête est absent (`node_modules/next/dist/server/base-server.js`) : un client qui envoie le sien choisit son IP. C'est acceptable parce que ce réglage est limité au serveur de test local, lancé par Playwright ; un déploiement n'utilise `TRUST_PROXY=1` que derrière un vrai proxy qui réécrit l'en-tête.

Tous les tests viennent de la même IP : la limite de débit de Better Auth sur la connexion et l'inscription (3 essais en 10 s) peut répondre 429. Les helpers attendent alors le délai annoncé (`X-Retry-After`) et renvoient le formulaire, sans désactiver la limite.

### Résultats

`test-results/` (traces et captures des échecs) et `playwright-report/` (rapport HTML, en CI) sont ignorés par git. Revoir un échec : `bunx playwright show-trace test-results/<test>/trace.zip`.

## Contraste des textes (A11Y-01)

Deux niveaux :

- `src/styles/contrast.test.ts` (dans `bun test`, `bun test -t A11Y-01`) : formule WCAG 2.x (`src/styles/contrast.ts`) ; chaque jeton de texte de `src/styles/base/tokens.css` (`line`, `muted`, `red-text`, `chart-raw`) atteint 4,5:1 sur le noir et sur les faces `face-front-a` / `face-front-b`, le blanc atteint 4,5:1 sur `red-solid` et `red-hover`, `line-soft` (traits) atteint 3:1 ; et aucun fichier de `src/` ne donne à un texte une couleur sous 4,5:1 (`text-line-soft`, `text-line-faint`, `text-[rgba(255,255,255,a)]`, `placeholder:` compris, `color: var(--color-line-soft)` en CSS). Seul l'état `disabled:` est exempté (WCAG 1.4.3, composant inactif).
- `tests/e2e/contrast.e2e.ts` (`bun run test:a11y`, même installation que les tests e2e ci-dessus) : axe-core (`@axe-core/playwright`, règle `color-contrast`) sur l'accueil (déconnecté, chaque volet, connexion refusée, connecté), le salon (chaque onglet de réglages, bots, option inactive mais modifiable), la course (champ sans focus, faute de frappe, texte à moitié tapé), le podium et le profil (chaque onglet), plus une passe par élément atteint au clavier (focus). Attendu : 0 violation.

axe ne mesure pas les placeholders et ne conclut pas sur un fond en dégradé, un pseudo-élément ou un texte d'un caractère. Le test mesure lui-même ces nœuds : couleur du texte, opacités des parents comprises, sur la pile de leurs fonds (pseudo-éléments compris, un dégradé compté par sa couleur la plus claire). Un fond peint par un élément voisin superposé (scène 3D du podium, bassin de course) n'est pas vu : ces nœuds sont listés en fin de lancement avec le rapport mesuré sur leurs propres fonds, à vérifier à la main.

```bash
E2E_DATABASE_URL=postgres://orion@localhost:5544/orion_e2e bun run test:a11y
```

`E2E_PORT` et `E2E_REALTIME_PORT` (3100 et 3101 par défaut) changent les ports du serveur de test, pour lancer deux suites en même temps.

Un seul thème existe (sombre). Le critère demande les deux thèmes : le thème clair (DES-05) n'est pas fait, et devra repasser ces deux tests.

## Lighthouse sur la page d'accueil (PERF-01)

`scripts/lighthouse.ts` mesure les quatre catégories (performance, accessibilité, bonnes pratiques, SEO) de la page d'accueil en mobile (profil par défaut de Lighthouse : écran de 412 px, réseau 4G lent et processeur ralenti 4 fois, simulés) puis en desktop (`--preset=desktop`). Chaque profil est mesuré trois fois et garde la médiane de chaque catégorie, comme le conseille Lighthouse : le score de performance varie de quelques points selon la charge de la machine. Le script sort en erreur si une médiane est sous 90. Il ne fait pas partie de `bun test` ni de la CI : il lui faut un build de production qui tourne et un Chrome.

```bash
bun run next:build                              # build de production : jamais `next dev` (non minifié, et cassé sous Bun par sharp)
PORT=3200 bun run next:start                    # avec DATABASE_URL et BETTER_AUTH_SECRET, comme pour les tests e2e
bun run lighthouse http://localhost:3200/       # options : --threshold=90 --runs=3
```

- Chrome : celui de Playwright (`bunx playwright install chromium`), ou celui donné par `CHROME_PATH`.
- Base : n'importe quelle base migrée et peuplée ; un Postgres jetable comme ci-dessus suffit (`NODE_ENV=test bun db/cli.ts reset` avec la bonne `DATABASE_URL`).
- Rapports JSON : `reports/lighthouse/home-<mobile|desktop>-<n>.json`, ignorés par git. Les ouvrir dans <https://googlechrome.github.io/lighthouse/viewer/> pour le détail.
- Mesurer un déploiement : `bun run lighthouse https://<preview>.vercel.app/`.

### Scores

Mesurés le 20/11/2026 sur un MacBook (Apple M4) chargé, build de production, base de démo, médiane de 3 mesures (performance, accessibilité, bonnes pratiques, SEO) :

| Profil | Avant (`dev`, 7a29df8) | Après (`feature/home/perf-01`) |
|---|---|---|
| Mobile | 70 · 96 · 100 · 90 | 96 · 100 · 100 · 100 |
| Desktop | 96 · 96 · 100 · 90 | 100 · 100 · 100 · 100 |

Sur `dev`, une première mesure isolée donnait 60 et 84 en performance (mobile et desktop). Sur la branche, la performance mobile va de 85 à 100 d'une mesure à l'autre sur cette machine chargée, d'où la médiane.

Ce qui faisait perdre des points, et ce qui a changé :

- **Temps de blocage (TBT, mobile 9,5 s)** : la crème glacée 3D du décor déformait toutes les boules fondues à chaque image (environ 2 800 sommets et leurs normales chacune) et construisait les 12 assiettes dans la tâche qui hydrate la page. Désormais chaque boule à l'écran est déformée une image sur six, à tour de rôle (le mouvement a une période de 10 s au moins, l'œil ne voit pas la différence), les boules hors écran ne le sont pas, la sphère de base est calculée une seule fois, et les assiettes se construisent une par tâche après le premier rendu. Three.js (plus de 600 Ko) est chargé à part, à ce moment-là seulement (`src/views/home/scene/createScene.ts`, `scene-quality.ts`).
- **Sans carte graphique** (WebGL logiciel : SwiftShader, llvmpipe), la 3D coûtait des dizaines de millisecondes par image : le contexte est demandé avec `failIfMajorPerformanceCaveat`, et en cas de refus les assiettes passent au dessin 2D de secours, qui existait déjà mais ne s'affichait jamais.
- **Planche des têtes de poisson** : 104 Ko de base64 dans le JavaScript de la page, devenus une image à part (`src/assets/home/fish-sheet.webp`).
- **Accessibilité** : les textes secondaires (navigation, onglets, libellés des champs, surtitre) utilisaient la couleur des traits `line-soft` (contraste 3:1 sur le noir) ; ils passent à `muted` (6,6:1), le jeton des textes secondaires. Les onglets FR / EN ont un nom accessible qui commence par le texte visible (« EN, English »).
- **SEO** : meta description de l'accueil, traduite (`home.metaDescription`).

Les tests `src/views/home/home-lighthouse.test.tsx`, `src/views/home/scene/scene-quality.test.ts` et `scripts/lighthouse.test.ts` (`bun test -t PERF-01`) gardent ces corrections sans navigateur.
