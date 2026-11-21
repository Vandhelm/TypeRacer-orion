import { beforeAll, describe, expect, test } from "bun:test";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { createAuth } from "./auth";
import { currentUser } from "./session";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

describe("TECH-01 — compte connecté lu côté serveur pour le premier rendu", () => {
  let auth: ReturnType<typeof createAuth>;
  let cookie: string;
  beforeAll(async () => {
    auth = createAuth(await createMockDatabase());
    await auth.api.signUpEmail({ body: { name: "Compte_Home", email: placeholderEmail("Compte_Home"), password: "sushi-roll-42", username: "Compte_Home", displayUsername: "Compte_Home" } });
    const { headers } = await auth.api.signInUsername({ body: { username: "Compte_Home", password: "sushi-roll-42" }, returnHeaders: true });
    cookie = headers.get("set-cookie")!.split(";")[0]!;
  });

  test("avec le cookie de session : le compte, seulement les champs utiles à l'interface", async () => {
    const me = await currentUser(new Headers({ cookie }), auth);
    expect(me).toMatchObject({ name: "Compte_Home", displayUsername: "Compte_Home" });
    expect(Object.keys(me!).sort()).toEqual(["displayUsername", "id", "image", "name", "needsUsername", "username"]);
  });

  test("sans session ou avec un cookie inventé : null", async () => {
    expect(await currentUser(new Headers(), auth)).toBeNull();
    expect(await currentUser(new Headers({ cookie: "better-auth.session_token=faux" }), auth)).toBeNull();
  });
});
