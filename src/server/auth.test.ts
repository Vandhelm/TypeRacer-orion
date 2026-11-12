import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { players, user } from "../../db/schema";
import { createMockDatabase } from "../../db/mocks/test-database";
import { DEMO_PASSWORD } from "../../db/mocks/data";
import { placeholderEmail } from "../accounts/username";
import { createAuth } from "./auth";

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

describe("GitHub accounts", () => {
  test("turns a GitHub login into a valid username", async () => {
    const { usernameFromGithub } = await import("./auth");
    expect(usernameFromGithub("octo-cat")).toBe("octo_cat");
    expect(usernameFromGithub("ab")).toBe("ab_");
    expect(usernameFromGithub("a".repeat(30))).toHaveLength(20);
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

  test("refuses a name already used by a guest", async () => {
    const db = await createMockDatabase();
    const auth = createAuth(db);
    await signUp(auth, "Autre_Nom");
    const { headers } = await auth.api.signInUsername({ body: { username: "Autre_Nom", password: "sushi-roll-42" }, returnHeaders: true });
    const cookie = headers.get("set-cookie")!.split(";")[0]!;
    await expect(auth.api.updateUser({ body: { username: "Tamago_8", displayUsername: "Tamago_8" }, headers: new Headers({ cookie }) })).rejects.toThrow();
  });
});
