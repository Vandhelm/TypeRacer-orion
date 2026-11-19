import { describe, expect, test } from "bun:test";
import { covers, findStale, parseMatrix, refsOf, type State } from "./qa-stale";

const matrix = [
  "| ID | Statut | Fichiers principaux | Tests associés | Notes et choix |",
  "|---|---|---|---|---|",
  "| AUTH-01 | complet | `src/server/auth.ts`, `db/schema` | `src/server/auth.test.ts` | ok |",
  "| SALLE-07 | non fait | — | aucun | rien |",
  "| DES-01 | non vérifié |  |  |  |",
  "| A11Y-02 | partiel | `src/views/*/…Page.tsx` | aucun | x |",
].join("\n");

describe("parseMatrix", () => {
  test("lit ID, statut et chemins entre backticks", () => {
    const rows = parseMatrix(matrix);
    expect(rows.map((r) => r.id)).toEqual(["AUTH-01", "SALLE-07", "DES-01", "A11Y-02"]);
    expect(rows[0]).toEqual({ id: "AUTH-01", status: "complet", files: ["src/server/auth.ts", "db/schema"] });
    expect(rows[1].files).toEqual([]);
  });
});

describe("covers", () => {
  test("fichier exact et dossier", () => {
    expect(covers("src/server/auth.ts", "src/server/auth.ts")).toBe(true);
    expect(covers("db/schema", "db/schema/rooms.ts")).toBe(true);
    expect(covers("db/schema", "db/schema2.ts")).toBe(false);
    expect(covers("app/", "app/room/page.tsx")).toBe(true);
  });
  test("motifs * et …", () => {
    expect(covers("src/views/*/…Page.tsx", "src/views/room/RoomPage.tsx")).toBe(true);
    expect(covers("src/styles/components/**", "src/styles/components/a/b.css")).toBe(true);
    expect(covers("app/*/page.tsx", "app/room/layout.tsx")).toBe(false);
  });
});

describe("refsOf", () => {
  test("IDs simples, listes et plages", () => {
    const ids = refsOf("fix: x\n\nRefs: AUTH-03, SALLE-02\n");
    expect([...ids]).toEqual(["AUTH-03", "SALLE-02"]);
    expect([...refsOf("Refs: DES-01..03")]).toEqual(["DES-01", "DES-02", "DES-03"]);
  });
  test("ignore les ID hors footer Refs", () => {
    expect(refsOf("feat: AUTH-01 login").size).toBe(0);
  });
});

describe("findStale", () => {
  const state: State = {
    "AUTH-01": { commit: "aaa", date: "2026-11-18", scope: "section 5.2" },
    "SALLE-07": { commit: "aaa", date: "2026-11-18", scope: "site" },
    "A11Y-02": { commit: "bbb", date: "2026-11-18", scope: "site" },
  };
  const rows = parseMatrix(matrix);

  test("rien n'a changé : seule l'exigence jamais vérifiée ressort", () => {
    const stale = findStale(rows, state, () => [], () => new Set());
    expect(stale).toEqual([{ id: "DES-01", status: "non vérifié", reasons: ["jamais vérifiée"] }]);
  });

  test("un fichier principal modifié rend l'exigence périmée", () => {
    const stale = findStale(rows, state, (c) => (c === "aaa" ? ["db/schema/users.ts", "README.md"] : []), () => new Set());
    expect(stale.map((s) => s.id)).toEqual(["AUTH-01", "DES-01"]);
    expect(stale[0].reasons[0]).toContain("db/schema/users.ts");
  });

  test("un commit Refs rend périmée une exigence sans fichiers", () => {
    const stale = findStale(rows, state, () => [], (c) => (c === "aaa" ? new Set(["SALLE-07"]) : new Set()));
    expect(stale.map((s) => s.id)).toEqual(["SALLE-07", "DES-01"]);
  });

  test("absente de l'état : à vérifier même avec un statut", () => {
    const stale = findStale(rows, {}, () => [], () => new Set());
    expect(stale).toHaveLength(4);
  });
});
