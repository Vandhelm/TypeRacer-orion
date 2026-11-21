import { describe, expect, test } from "bun:test";
import { e2eDatabaseUrl } from "./env";

describe("TEST-02 e2eDatabaseUrl", () => {
  test("prend E2E_DATABASE_URL telle quelle", () => {
    expect(e2eDatabaseUrl({ E2E_DATABASE_URL: "postgres://u@h:5432/autre", DATABASE_URL: "postgres://u@h:5432/orion" })).toBe(
      "postgres://u@h:5432/autre",
    );
  });

  test("suffixe le nom de DATABASE_URL par _e2e", () => {
    expect(e2eDatabaseUrl({ DATABASE_URL: "postgres://u@h:5432/orion" })).toBe("postgres://u@h:5432/orion_e2e");
  });

  test("n'ajoute pas un second _e2e quand le nom le porte déjà (webServer de playwright.config.ts)", () => {
    const once = e2eDatabaseUrl({ DATABASE_URL: "postgres://u@h:5432/orion" });
    expect(e2eDatabaseUrl({ DATABASE_URL: once })).toBe("postgres://u@h:5432/orion_e2e");
  });

  test("garde les paramètres de requête", () => {
    expect(e2eDatabaseUrl({ DATABASE_URL: "postgres://u@h:5432/orion?sslmode=require" })).toBe(
      "postgres://u@h:5432/orion_e2e?sslmode=require",
    );
  });

  test("refuse l'absence des deux variables", () => {
    expect(() => e2eDatabaseUrl({})).toThrow("TEST-02");
  });
});
