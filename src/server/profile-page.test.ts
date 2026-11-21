import { beforeAll, describe, expect, test } from "bun:test";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { createAuth } from "./auth";
import { profileData, profileQuery } from "./profile-page";
import { parseRace, recordRace } from "./races";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

const SUMMARY = {
  textType: "words", language: "fr", duration: 60, level: "common", punctuation: false, numbers: false, specials: false, accents: true,
  excluded: "", mistakes: "fix", botSpeed: "medium", botAccuracy: "high", length: "short", wordCount: 20, sessionSeconds: 90,
};
const result = (name: string, bot: boolean, wpm: number) => ({
  name, bot, wpm, raw: wpm + 5, accuracy: 95.5, seconds: 3, chars: [40, 2, 0, 0], consistency: 80, idle: 0, finished: true, eliminated: false,
  wpmSeries: [wpm - 2, wpm, wpm + 1], rawSeries: [wpm, wpm + 5, wpm + 6], errorSeries: [0, 1, 0],
});

describe("TECH-01 — /profile rendu côté serveur : paramètres d'URL", () => {
  test("garde player, name et race ; une clé répétée donne sa première valeur", () => {
    expect(profileQuery({ player: "2", name: ["Nori", "Maki"], race: "12" })).toEqual({ player: "2", name: "Nori", race: "12" });
  });

  test("sans paramètre ou avec des valeurs invalides : rien", () => {
    expect(profileQuery({})).toEqual({ player: null, name: null, race: null });
    expect(profileQuery({ name: "x".repeat(300) })).toEqual({ player: null, name: null, race: null });
    expect(profileQuery("n'importe quoi")).toEqual({ player: null, name: null, race: null });
  });

  test("un nom fait seulement d'espaces compte comme absent", () => {
    expect(profileQuery({ name: "   " }).name).toBeNull();
  });
});

describe("TECH-01 — /profile rendu côté serveur : données préchargées", () => {
  let db: Awaited<ReturnType<typeof createMockDatabase>>;
  let auth: ReturnType<typeof createAuth>;
  let cookie: string;

  beforeAll(async () => {
    db = await createMockDatabase();
    auth = createAuth(db);
    await auth.api.signUpEmail({ body: { name: "Compte_Ssr", email: placeholderEmail("Compte_Ssr"), password: "sushi-roll-42", username: "Compte_Ssr", displayUsername: "Compte_Ssr" } });
    const { headers } = await auth.api.signInUsername({ body: { username: "Compte_Ssr", password: "sushi-roll-42" }, returnHeaders: true });
    cookie = headers.get("set-cookie")!.split(";")[0]!;
    await recordRace(db, parseRace({ id: crypto.randomUUID(), summary: SUMMARY, content: "le riz attend", players: [result("Nori_Ninja", true, 72), result("Invite_Ssr", false, 60)] }));
  });

  const empty = { player: null, name: null, race: null };

  test("connecté, sans paramètre : son compte et ses stats", async () => {
    const data = await profileData(new Headers({ cookie }), auth, db, empty);
    expect(data.me?.name).toBe("Compte_Ssr");
    expect(data.stats).toMatchObject({ name: "Compte_Ssr", races: 0 });
  });

  test("?name=X : les stats de X, même sans session", async () => {
    const data = await profileData(new Headers(), auth, db, { ...empty, name: "nori_ninja" });
    expect(data.me).toBeNull();
    expect(data.stats).toMatchObject({ name: "Nori_Ninja", races: 1, bestWpm: 72 });
  });

  test("?name=X inconnu : null (aucune course), pas une erreur", async () => {
    expect((await profileData(new Headers(), auth, db, { ...empty, name: "Personne" })).stats).toBeNull();
  });

  test("?player=N : le nom vient de la course de l'onglet, rien à précharger", async () => {
    expect((await profileData(new Headers({ cookie }), auth, db, { ...empty, player: "0" })).stats).toBeUndefined();
  });
});
