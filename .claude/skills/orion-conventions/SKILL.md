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
- **Styles** : ceux de la page (`src/styles/pages/<page>`) et la direction artistique existante. Deux thèmes (DES-05), mobile dès 360 px (DES-06), accessibilité : bonnes balises, libellés, focus visible (A11Y).
- **Images importées** : sous Next.js, `import x from "./a.png"` donne un objet `{ src }`, pas une chaîne. Utilise `x.src`.
- **Base de données** : schéma dans `db/schema`, migration générée par `bun run db:generate` et commitée avec le changement. Données de démo dans `db/mocks`.
- **Calculs** (MPM, précision, progression) : formules exactes de l'annexe A de `docs/criteres.md`, espaces comprises.

## Modèles à copier

Pars de ces modèles plutôt que d'inventer une structure. Ils reprennent le code déjà en place ; en cas de doute, ouvre le fichier cité.

### Route API (modèle : `src/server/rooms-api.ts`, `src/server/guest.ts`)

Trois couches, toujours les mêmes :

1. **Routage** dans `handleApi` (`src/server/api.ts`) : une ligne qui délègue à `handleX(req, db(), auth())`. Ne crée pas d'autre `route.ts` sous `app/api/`.
2. **Couche HTTP** dans `src/server/<domaine>-api.ts` (ou `<domaine>.ts` si c'est petit) : session → identité, corps → schéma Zod, refus → statut HTTP. Aucune règle métier ici.
3. **Règles** dans `src/server/<domaine>.ts` : fonctions qui prennent `db` en paramètre (testables sur PGlite) et lèvent une erreur typée pour un refus attendu.

```ts
// src/server/widgets-api.ts — WIDG-01 : en tête, l'exigence et ce que fait le fichier.
import { z } from "zod";
import type { Db } from "../../db/client";
import type { Auth } from "./auth";
import { guestSecret } from "./guest";
import { roomIdentity } from "./room-gate";
import { createWidget, WidgetRefused, type RefusalReason } from "./widgets";

const STATUS: Record<RefusalReason, number> = { not_found: 404, not_owner: 403 };
const json = (body: unknown, status = 200) => Response.json(body, { status });

// Schéma strict : un champ inconnu est refusé. Partagé avec le client s'il vit dans src/<domaine>/.
const CreateWidgetSchema = z.object({ name: z.string().trim().min(1).max(20) }).strict();

export async function handleWidgetsApi(req: Request, db: Db, auth: Auth, secret = guestSecret()): Promise<Response> {
  const who = await roomIdentity(req.headers, auth, secret); // identité = session, jamais le corps
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!who) return json({ error: "unauthorized" }, 401);
  if (who.kind !== "account") return json({ error: "account_required" }, 403);
  const input = CreateWidgetSchema.safeParse(await req.json().catch(() => undefined));
  if (!input.success) return json({ error: "invalid_body" }, 400);
  try {
    return json(await createWidget(db, who.playerId, input.data), 201);
  } catch (error) {
    if (error instanceof WidgetRefused) return json({ error: error.reason }, STATUS[error.reason]);
    throw error; // une erreur inattendue remonte : pas de 200 silencieux
  }
}
```

Règles :
- Réponse d'erreur : toujours `{ error: "<code_snake_case>" }` avec le bon statut (400 corps invalide, 401 sans session, 403 interdit, 404, 409 conflit d'état, 503 indisponible). Jamais de texte lisible : le client traduit le code (voir Traductions).
- `req.json().catch(() => undefined)` puis `safeParse` : un JSON cassé donne 400, pas 500.
- Rôle, `playerId`, `bot`, score : lus depuis la session ou la base, jamais depuis le corps (SEC-01).
- Écriture concurrente (places, hôte, code unique) : transaction avec verrou, comme `joinRoom` dans `src/server/rooms.ts`.

### Test (modèle : `src/server/rooms.test.ts`, `src/server/guest.test.ts`)

Fichier `*.test.ts` à côté du code testé. Chaque `describe` commence par l'ID de l'exigence, chaque `test` décrit un comportement en anglais. On teste la route par son handler, avec une vraie base PGlite, et on vérifie aussi l'état en base, pas seulement la réponse.

```ts
import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { widgets } from "../../db/schema";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { createAuth } from "./auth";
import { GUEST_COOKIE, signGuest } from "./guest";
import { handleWidgetsApi } from "./widgets-api";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const SECRET = "guest-secret-guest-secret-guest-secret";

async function setup() {
  const db = await createMockDatabase(); // base neuve, migrée et peuplée par db/mocks/seed.ts
  const auth = createAuth(db);
  const signUp = async (name: string) => {
    await auth.api.signUpEmail({ body: { name, email: placeholderEmail(name), password: "sushi-roll-42", username: name, displayUsername: name } });
    const { headers } = await auth.api.signInUsername({ body: { username: name, password: "sushi-roll-42" }, returnHeaders: true });
    return headers.get("set-cookie")!.split(";")[0]!;
  };
  const guest = (nickname: string) => `${GUEST_COOKIE}=${signGuest(nickname, SECRET)}`;
  const call = (method: string, path: string, cookie?: string, body?: unknown) =>
    handleWidgetsApi(
      new Request(`http://localhost${path}`, {
        method,
        headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      db, auth, SECRET,
    );
  return { db, signUp, guest, call };
}

describe("WIDG-01 — only an account creates a widget", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => {
    t = await setup();
  });

  test("a guest calling the API directly is refused (403) and nothing is written", async () => {
    const before = await t.db.$count(widgets); // la base de démo a déjà des lignes : compare, ne suppose pas 0
    const res = await t.call("POST", "/api/widgets", t.guest("Corail_418"), { name: "Bol" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "account_required" });
    expect(await t.db.$count(widgets)).toBe(before);
  });

  test("an unknown field in the body is refused (400)", async () => {
    const res = await t.call("POST", "/api/widgets", await t.signUp("Maki_Test"), { name: "Bol", owner: 1 });
    expect(res.status).toBe(400);
  });
});
```

À couvrir pour chaque exigence : le cas nominal, le refus côté serveur par appel direct (SEC-01), le corps invalide (TECH-07), et le cas limite de l'énoncé (capacité pleine, doublon, expiration…). Logique pure (calculs, formatage) : test sans base, en important la fonction. Composant de page : extraire la logique dans `src/views/<page>/<x>.ts` et la tester avec `const t = ((key: string) => key) as unknown as TFunction` (voir `src/views/room/room.test.ts`). Accès concurrent réel : `createServerDatabase()` (Postgres, ignoré sans `DATABASE_URL`).

### Traductions (I18N-01)

- Fichiers : `src/i18n/locales/fr.json` et `src/i18n/locales/en.json`, mêmes clés dans les deux, rangées par page : `home.*`, `rooms.*` (explorateur de salons), `room.*`, `game.*`, `podium.*`, `profile.*`, `account.*`, plus `nav.*` (navigation commune). Clés en camelCase, imbriquées par zone (`room.errors.full`, `account.photo.errors.size`).
- Dans un composant React : `const { t } = useTranslation();` (`react-i18next`), puis `t("room.copyLink")`, avec variables `t("home.linkFailed", { provider })`. Hors React : `import i18n from "../../i18n"` (chemin relatif depuis `src/views/<page>/`) puis `i18n.t(...)`.
- Erreurs du serveur : le code `{ error: "full" }` devient `t(\`room.errors.${error}\`)`. Ajoute donc une clé `<page>.errors.<code>` pour chaque nouveau code renvoyé, dans les deux langues.
- Attributs aussi : `aria-label`, `title`, `placeholder`, `alt` passent par `t()`.
- Vérifier que les deux fichiers ont les mêmes clés :
  ```bash
  diff <(jq -r 'paths(scalars)|join(".")' src/i18n/locales/fr.json | sort) <(jq -r 'paths(scalars)|join(".")' src/i18n/locales/en.json | sort)
  ```

### Migration Drizzle (modèle : `db/migrations/0008_room_members.sql`, `0009_room_results.sql`)

1. Modifie le schéma TypeScript dans `db/schema/<domaine>.ts` (un nouveau fichier s'exporte depuis `db/schema/index.ts` ; un nouvel enum va dans `db/schema/enums.ts`).
2. Génère avec un nom court en snake_case : `bun run db:generate --name room_results`. Cela crée `db/migrations/00NN_<nom>.sql` et met à jour `db/migrations/meta/` : commite les deux.
3. Ajoute en première ligne du `.sql` un commentaire `-- <ID> : <pourquoi>`.
4. Si des lignes existent déjà, complète le SQL à la main pour ne rien casser : ajouter la colonne nullable, la remplir (`UPDATE`), puis `SET NOT NULL`, comme dans 0008 :
   ```sql
   -- SALLE-01 : un membre est un compte ou un invité. Les lignes existantes sont des comptes participants.
   ALTER TABLE "room_members" ADD COLUMN "member_key" text;--> statement-breakpoint
   UPDATE "room_members" SET "member_key" = 'player:' || "player_id";--> statement-breakpoint
   ALTER TABLE "room_members" ALTER COLUMN "member_key" SET NOT NULL;
   ```
5. Les invariants vont dans la base (contraintes `unique`, `check`, clés étrangères avec `onDelete`), pas seulement dans le code.
6. Mets à jour `db/mocks/data.ts`/`seed.ts` si la démo en a besoin, puis `bun test` : chaque test rejoue toutes les migrations sur PGlite, donc une migration cassée échoue tout de suite.
7. Ne modifie jamais une migration déjà mergée dans `dev` : écris-en une nouvelle.

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
