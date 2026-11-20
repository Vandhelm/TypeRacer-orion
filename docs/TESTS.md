# Tests

| Commande | Rôle | Base |
|---|---|---|
| `bun test` | tests unitaires et de régression (`*.test.ts`) | PGlite en mémoire, sans Docker |
| `bun run test:smoke` | l'application démarre et répond (`tests/smoke/app.smoke.ts`) | `<base>_smoke` jetable |
| `bun run test:e2e` | parcours de bout en bout dans Chromium, avec Playwright (TEST-02) | `<base>_e2e` jetable |

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
| `E2E_SKIP_BUILD` | `1` : ne reconstruit pas l'application | vide |
| `BETTER_AUTH_SECRET` | secret des sessions | celui du `.env`, sinon une valeur de test |

Le fichier `.env` est lu s'il existe. Le serveur de test reçoit aussi `TRUST_PROXY=1` : sans proxy déclaré, `next start` ne connaît pas l'IP du client et refuse tous les liens d'invitation (SALLE-04) ; Next.js pose alors `x-forwarded-for` à l'IP de la socket, mais seulement si l'en-tête est absent (`node_modules/next/dist/server/base-server.js`) : un client qui envoie le sien choisit son IP. C'est acceptable parce que ce réglage est limité au serveur de test local, lancé par Playwright ; un déploiement n'utilise `TRUST_PROXY=1` que derrière un vrai proxy qui réécrit l'en-tête.

Tous les tests viennent de la même IP : la limite de débit de Better Auth sur la connexion et l'inscription (3 essais en 10 s) peut répondre 429. Les helpers attendent alors le délai annoncé (`X-Retry-After`) et renvoient le formulaire, sans désactiver la limite.

### Résultats

`test-results/` (traces et captures des échecs) et `playwright-report/` (rapport HTML, en CI) sont ignorés par git. Revoir un échec : `bunx playwright show-trace test-results/<test>/trace.zip`.
