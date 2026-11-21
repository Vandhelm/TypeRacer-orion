import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { players, user } from "../../db/schema";
import { createMockDatabase } from "../../db/mocks/test-database";
import { DEMO_PASSWORD } from "../../db/mocks/data";
import { placeholderEmail } from "../accounts/username";
import { createAuth, socialProviders, warnMissingProviders } from "./auth";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

const signUp = (auth: ReturnType<typeof createAuth>, username: string, password = "sushi-roll-42") =>
  auth.api.signUpEmail({ body: { name: username, email: placeholderEmail(username), password, username, displayUsername: username } });

describe("username accounts", () => {
  let db: Awaited<ReturnType<typeof createMockDatabase>>;
  let auth: ReturnType<typeof createAuth>;
  beforeAll(async () => {
    db = await createMockDatabase();
    auth = createAuth(db);
  });

  test("sign-up creates a user linked to a new player", async () => {
    const { user: created } = await signUp(auth, "Nouveau_Thon");
    const [row] = await db.select().from(user).where(eq(user.id, created.id));
    const [player] = await db.select().from(players).where(eq(players.id, row!.playerId));
    expect(player!.name).toBe("Nouveau_Thon");
  });

  test("signs in with username and password", async () => {
    const result = await auth.api.signInUsername({ body: { username: "nouveau_thon", password: "sushi-roll-42" } });
    expect(result?.token).toBeTruthy();
  });

  test("rejects a wrong password", async () => {
    await expect(auth.api.signInUsername({ body: { username: "Nouveau_Thon", password: "wrong-password" } })).rejects.toThrow();
  });

  test("rejects a username taken by a guest or a bot", async () => {
    await expect(signUp(auth, "Tamago_8")).rejects.toThrow();
    await expect(signUp(auth, "thon_rouge")).rejects.toThrow();
  });

  test("COURSE-06 — rejects the name of a bot of the closed list, even never used yet, in any case", async () => {
    await expect(signUp(auth, "Tako_San")).rejects.toThrow();
    await expect(signUp(auth, "uni_kun")).rejects.toThrow();
    expect(await db.$count(players, eq(players.name, "Tako_San"))).toBe(0);
  });

  test("rejects too short, too long or odd usernames", async () => {
    await expect(signUp(auth, "ab")).rejects.toThrow();
    await expect(signUp(auth, "a".repeat(21))).rejects.toThrow();
    await expect(signUp(auth, "sushi roll")).rejects.toThrow();
  });

  test("rejects a short password", async () => {
    await expect(signUp(auth, "Court_Mdp", "1234567")).rejects.toThrow();
  });

  test("demo accounts sign in with the demo password", async () => {
    const result = await auth.api.signInUsername({ body: { username: "Corail_418", password: DEMO_PASSWORD } });
    expect(result?.token).toBeTruthy();
  });
});

describe("GitHub and Discord accounts", () => {
  test("turns a GitHub or Discord login into a valid username", async () => {
    const { usernameFromLogin } = await import("./auth");
    expect(usernameFromLogin("octo-cat")).toBe("octo_cat");
    expect(usernameFromLogin("octo.cat")).toBe("octo_cat");
    expect(usernameFromLogin("ab")).toBe("ab_");
    expect(usernameFromLogin("a".repeat(30))).toHaveLength(20);
  });

  test("COURSE-06 — a GitHub user named like a bot gets a free name, never the bot's", async () => {
    const db = await createMockDatabase();
    const auth = createAuth(db);
    const ctx = await auth.$context;
    const created = await ctx.internalAdapter.createUser({ name: "Ebi", email: "ebi@example.com", emailVerified: true, displayUsername: "Ebi_Fry" }, { method: "oauth", oauth: { providerId: "github", profile: {} } });
    expect(created.displayUsername).toBe("Ebi_Fry_2");
    expect(await db.$count(players, eq(players.name, "Ebi_Fry"))).toBe(0);
  });

  test("a GitHub user whose name is taken gets a free one", async () => {
    const db = await createMockDatabase();
    const auth = createAuth(db);
    const ctx = await auth.$context;
    const created = await ctx.internalAdapter.createUser({ name: "Tamago", email: "tamago@example.com", emailVerified: true, displayUsername: "Tamago_8" }, { method: "oauth", oauth: { providerId: "github", profile: {} } });
    const [player] = await db.select().from(players).where(eq(players.id, created.playerId));
    expect(player!.name).toBe("Tamago_8_2");
    expect(created.displayUsername).toBe("Tamago_8_2");
  });

  test("a GitHub login equal to an existing account gets a free name", async () => {
    const db = await createMockDatabase();
    const auth = createAuth(db);
    await signUp(auth, "Octo_Cat");
    const ctx = await auth.$context;
    const created = await ctx.internalAdapter.createUser({ name: "Octo", email: "octo@example.com", emailVerified: true, displayUsername: "Octo_Cat" }, { method: "oauth", oauth: { providerId: "github", profile: {} } });
    expect(created.username).toBe("octo_cat_2");
    expect(created.displayUsername).toBe("Octo_Cat_2");
    expect(created.needsUsername).toBe(true);
  });

  test("a GitHub login that is free keeps its name, with nothing to choose", async () => {
    const db = await createMockDatabase();
    const ctx = await createAuth(db).$context;
    const created = await ctx.internalAdapter.createUser({ name: "Libre", email: "libre@example.com", emailVerified: true, displayUsername: "Pseudo_Libre" }, { method: "oauth", oauth: { providerId: "github", profile: {} } });
    expect(created.displayUsername).toBe("Pseudo_Libre");
    expect(created.needsUsername).toBe(false);
  });
});

describe("changing username", () => {
  test("renames the player too and clears the pending choice", async () => {
    const db = await createMockDatabase();
    const auth = createAuth(db);
    await signUp(auth, "Ancien_Nom");
    const { headers } = await auth.api.signInUsername({ body: { username: "Ancien_Nom", password: "sushi-roll-42" }, returnHeaders: true });
    const cookie = headers.get("set-cookie")!.split(";")[0]!;
    await auth.api.updateUser({ body: { username: "Nouveau_Nom", displayUsername: "Nouveau_Nom" }, headers: new Headers({ cookie }) });
    const [row] = await db.select().from(user).where(eq(user.username, "nouveau_nom"));
    const [player] = await db.select().from(players).where(eq(players.id, row!.playerId));
    expect(player!.name).toBe("Nouveau_Nom");
    expect(row!.needsUsername).toBe(false);
  });

  test("COURSE-06 — refuses renaming to a bot name", async () => {
    const db = await createMockDatabase();
    const auth = createAuth(db);
    await signUp(auth, "Futur_Bot");
    const { headers } = await auth.api.signInUsername({ body: { username: "Futur_Bot", password: "sushi-roll-42" }, returnHeaders: true });
    const cookie = headers.get("set-cookie")!.split(";")[0]!;
    await expect(auth.api.updateUser({ body: { username: "Ebi_Fry", displayUsername: "Ebi_Fry" }, headers: new Headers({ cookie }) })).rejects.toThrow();
    const [row] = await db.select().from(user).where(eq(user.username, "futur_bot"));
    expect(row).toBeDefined();
  });

  test("refuses a name already used by a guest", async () => {
    const db = await createMockDatabase();
    const auth = createAuth(db);
    await signUp(auth, "Autre_Nom");
    const { headers } = await auth.api.signInUsername({ body: { username: "Autre_Nom", password: "sushi-roll-42" }, returnHeaders: true });
    const cookie = headers.get("set-cookie")!.split(";")[0]!;
    await expect(auth.api.updateUser({ body: { username: "Tamago_8", displayUsername: "Tamago_8" }, headers: new Headers({ cookie }) })).rejects.toThrow();
  });
});

describe("changing display username", () => {
  async function signedIn(name: string) {
    const db = await createMockDatabase();
    const auth = createAuth(db);
    await signUp(auth, name);
    const { headers } = await auth.api.signInUsername({ body: { username: name, password: "sushi-roll-42" }, returnHeaders: true });
    const cookie = headers.get("set-cookie")!.split(";")[0]!;
    const playerName = async () => {
      const [row] = await db.select().from(user).where(eq(user.username, name.toLowerCase()));
      const [player] = await db.select().from(players).where(eq(players.id, row!.playerId));
      return { player: player!.name, displayUsername: row?.displayUsername, username: row?.username };
    };
    return { auth, db, headers: new Headers({ cookie }), playerName };
  }

  test("refuses a display username that breaks the username rule", async () => {
    const { auth, headers, playerName } = await signedIn("Garde_Nom");
    await expect(auth.api.updateUser({ body: { displayUsername: "x" }, headers })).rejects.toThrow();
    await expect(auth.api.updateUser({ body: { displayUsername: "a".repeat(200) }, headers })).rejects.toThrow();
    await expect(auth.api.updateUser({ body: { displayUsername: "sushi roll" }, headers })).rejects.toThrow();
    expect(await playerName()).toEqual({ player: "Garde_Nom", displayUsername: "Garde_Nom", username: "garde_nom" });
  });

  test("refuses a display username that is not the username", async () => {
    const { auth, headers, playerName } = await signedIn("Vrai_Nom");
    await expect(auth.api.updateUser({ body: { displayUsername: "Faux_Nom" }, headers })).rejects.toThrow();
    await expect(auth.api.updateUser({ body: { username: "Autre_Nom", displayUsername: "Faux_Nom" }, headers })).rejects.toThrow();
    expect(await playerName()).toEqual({ player: "Vrai_Nom", displayUsername: "Vrai_Nom", username: "vrai_nom" });
  });

  test("refuses a display username that is not a string", async () => {
    const { auth, headers, playerName } = await signedIn("Type_Nom");
    // Le type de l'API n'accepte que des chaînes, mais la route HTTP prend n'importe quel JSON : on simule ce corps-là.
    const raw = (body: Record<string, unknown>) => body as { username?: string; displayUsername?: string };
    await expect(auth.api.updateUser({ body: raw({ displayUsername: null }), headers })).rejects.toThrow();
    await expect(auth.api.updateUser({ body: raw({ displayUsername: 42 }), headers })).rejects.toThrow();
    await expect(auth.api.updateUser({ body: raw({ username: "Type_Neuf", displayUsername: null }), headers })).rejects.toThrow();
    expect(await playerName()).toEqual({ player: "Type_Nom", displayUsername: "Type_Nom", username: "type_nom" });
  });

  test("changes the case as the name form sends it", async () => {
    const { auth, headers, playerName } = await signedIn("abc_def");
    await auth.api.updateUser({ body: { username: "ABC_def", displayUsername: "ABC_def" }, headers });
    expect(await playerName()).toEqual({ player: "ABC_def", displayUsername: "ABC_def", username: "abc_def" });
  });

  test("changes only the case of the display username", async () => {
    const { auth, headers, playerName } = await signedIn("Casse_Nom");
    await auth.api.updateUser({ body: { displayUsername: "CASSE_nom" }, headers });
    expect(await playerName()).toEqual({ player: "CASSE_nom", displayUsername: "CASSE_nom", username: "casse_nom" });
  });

  test("a username alone renames the display username and the player", async () => {
    const { auth, db, headers } = await signedIn("Seul_Nom");
    await auth.api.updateUser({ body: { username: "Seul_Neuf" }, headers });
    const [row] = await db.select().from(user).where(eq(user.username, "seul_neuf"));
    const [player] = await db.select().from(players).where(eq(players.id, row!.playerId));
    expect(row!.displayUsername).toBe("Seul_Neuf");
    expect(player!.name).toBe("Seul_Neuf");
  });
});

describe("AUTH-04 — seule /api/account/avatar écrit la photo", () => {
  async function signedIn(name: string) {
    const db = await createMockDatabase();
    const auth = createAuth(db);
    await signUp(auth, name);
    const { headers } = await auth.api.signInUsername({ body: { username: name, password: "sushi-roll-42" }, returnHeaders: true });
    const cookie = headers.get("set-cookie")!.split(";")[0]!;
    const image = async () => (await db.select({ image: user.image }).from(user).where(eq(user.username, name.toLowerCase())))[0]!.image;
    const updateUser = (body: Record<string, unknown>) =>
      auth.handler(
        new Request("http://localhost:3000/api/auth/update-user", {
          method: "POST",
          headers: { cookie, origin: "http://localhost:3000", "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    return { auth, db, image, updateUser };
  }

  test("POST /api/auth/update-user refuse un GIF de 3 Mo et ne change pas user.image", async () => {
    const { image, updateUser } = await signedIn("Photo_Gif");
    const gif = `data:image/gif;base64,${Buffer.alloc(3 * 1024 * 1024, 0x47).toString("base64")}`;
    const response = await updateUser({ image: gif });
    expect(response.status).toBe(400);
    expect(await image()).toBeNull();
  });

  test("POST /api/auth/update-user refuse une URL externe et ne change pas user.image", async () => {
    const { image, updateUser } = await signedIn("Photo_Url");
    const response = await updateUser({ image: "https://evil.example/x.svg" });
    expect(response.status).toBe(400);
    expect(await image()).toBeNull();
  });

  test("POST /api/auth/update-user refuse aussi image: null et un nom accompagné d'une image", async () => {
    const { image, updateUser } = await signedIn("Photo_Nul");
    expect((await updateUser({ image: null })).status).toBe(400);
    expect((await updateUser({ name: "x", image: "https://evil.example/x.svg" })).status).toBe(400);
    expect(await image()).toBeNull();
  });

  test("l'inscription ignore une image fournie par le client", async () => {
    const db = await createMockDatabase();
    const auth = createAuth(db);
    const body = { name: "Photo_Inscr", email: placeholderEmail("Photo_Inscr"), password: "sushi-roll-42", username: "Photo_Inscr", displayUsername: "Photo_Inscr", image: "https://evil.example/x.svg" };
    const { user: created } = await auth.api.signUpEmail({ body });
    const [row] = await db.select({ image: user.image }).from(user).where(eq(user.id, created.id));
    expect(row!.image).toBeNull();
  });

  test("un compte GitHub ou Discord ne garde pas l'avatar externe du fournisseur", async () => {
    const db = await createMockDatabase();
    const ctx = await createAuth(db).$context;
    const created = await ctx.internalAdapter.createUser({ name: "Gh", email: "gh@example.com", emailVerified: true, displayUsername: "Photo_Gh", image: "https://avatars.githubusercontent.com/u/1" }, { method: "oauth", oauth: { providerId: "github", profile: {} } });
    const [row] = await db.select({ image: user.image }).from(user).where(eq(user.id, created.id));
    expect(row!.image).toBeNull();
  });

  test("une mise à jour interne (liaison GitHub ou Discord) ne réécrit pas la photo", async () => {
    const { auth, db, image } = await signedIn("Photo_Lien");
    const ctx = await auth.$context;
    const [row] = await db.select({ id: user.id }).from(user).where(eq(user.username, "photo_lien"));
    await ctx.internalAdapter.updateUser(row!.id, { image: "https://avatars.githubusercontent.com/u/1" });
    expect(await image()).toBeNull();
  });
});

describe("AUTH-01 — GitHub, Discord et identifiants", () => {
  const OAUTH = { GITHUB_CLIENT_ID: "gh-id", GITHUB_CLIENT_SECRET: "gh-secret", DISCORD_CLIENT_ID: "dc-id", DISCORD_CLIENT_SECRET: "dc-secret" };
  let db: Awaited<ReturnType<typeof createMockDatabase>>;
  beforeAll(async () => {
    db = await createMockDatabase();
  });

  const post = (auth: ReturnType<typeof createAuth>, path: string, body: unknown) =>
    auth.handler(
      new Request(`http://localhost:3000/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify(body),
      }),
    );
  const startSocial = (auth: ReturnType<typeof createAuth>, provider: string) => post(auth, "/sign-in/social", { provider, callbackURL: "/" });
  const redirectOf = async (res: Response) => new URL(((await res.json()) as { url: string }).url);

  test("with their variables, both providers are configured", () => {
    const providers = socialProviders(OAUTH);
    expect(Object.keys(providers).sort()).toEqual(["discord", "github"]);
    expect(providers.github?.clientId).toBe("gh-id");
    expect(providers.discord?.clientId).toBe("dc-id");
  });

  test("with their variables, GitHub and Discord sign-in redirect to the provider", async () => {
    const auth = createAuth(db, OAUTH);
    for (const [provider, host, clientId] of [["github", "github.com", "gh-id"], ["discord", "discord.com", "dc-id"]] as const) {
      const res = await startSocial(auth, provider);
      expect(res.status).toBe(200);
      const url = await redirectOf(res);
      expect(url.host).toBe(host);
      expect(url.searchParams.get("client_id")).toBe(clientId);
      expect(url.searchParams.get("redirect_uri")).toBe(`http://localhost:3000/api/auth/callback/${provider}`);
    }
  });

  test("a provider without its id, its secret, or with blank values is not configured", () => {
    expect(socialProviders({})).toEqual({});
    expect(Object.keys(socialProviders({ ...OAUTH, GITHUB_CLIENT_SECRET: undefined }))).toEqual(["discord"]);
    expect(Object.keys(socialProviders({ ...OAUTH, DISCORD_CLIENT_ID: "" }))).toEqual(["github"]);
    expect(Object.keys(socialProviders({ ...OAUTH, GITHUB_CLIENT_ID: "   " }))).toEqual(["discord"]);
  });

  test("an unconfigured or unknown provider is refused when the API is called directly", async () => {
    const auth = createAuth(db, { ...OAUTH, DISCORD_CLIENT_SECRET: undefined });
    for (const provider of ["discord", "facebook"]) {
      const res = await startSocial(auth, provider);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });

  test("in production, a missing provider is reported at startup", () => {
    const warnings: string[] = [];
    warnMissingProviders({ NODE_ENV: "production", GITHUB_CLIENT_ID: "gh-id", GITHUB_CLIENT_SECRET: "gh-secret" }, (m) => warnings.push(m));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("DISCORD_CLIENT_ID");
    expect(warnings[0]).not.toContain("GITHUB_CLIENT_ID");
  });

  test("in production with both providers, or in local development, nothing is reported", () => {
    const warnings: string[] = [];
    warnMissingProviders({ ...OAUTH, NODE_ENV: "production" }, (m) => warnings.push(m));
    warnMissingProviders({ NODE_ENV: "development" }, (m) => warnings.push(m));
    warnMissingProviders({ NODE_ENV: "test" }, (m) => warnings.push(m));
    expect(warnings).toEqual([]);
  });

  test("username and password sign-in works over HTTP, also in production", async () => {
    const auth = createAuth(db, { ...OAUTH, NODE_ENV: "production" });
    await signUp(auth, "Prod_Thon");
    const ok = await post(auth, "/sign-in/username", { username: "Prod_Thon", password: "sushi-roll-42" });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toContain("session_token");
    const wrong = await post(auth, "/sign-in/username", { username: "Prod_Thon", password: "sushi-roll-43" });
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get("set-cookie")).toBeNull();
    const notText = await post(auth, "/sign-in/username", { username: "Prod_Thon", password: 42 });
    expect(notText.status).toBe(400);
  });
});
