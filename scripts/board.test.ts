import { describe, expect, test } from "bun:test";
import { claim, emptyBoard, overlaps, parseSections, pickNext, staleClaims, type MatrixRow } from "./board";

const matrix = `
## 3. Contraintes techniques (TECH)
| ID | Statut | Fichiers principaux | Tests associés | Notes |
|---|---|---|---|---|
| TECH-01 | complet | \`app/\` | — | — |
| TECH-10 | partiel | \`.env.example\` | — | — |
### 5.3 Salles et visibilité (SALLE)
| SALLE-01 | non fait | \`src/views/room/**\`, \`src/server/rooms.ts\` | — | — |
| SALLE-02 | partiel | \`src/views/room/RoomPage.tsx\` | — | — |
| SALLE-03 | non vérifié | \`src/server/visibility.ts\` | — | — |
`;

const rows = parseSections(matrix);
const row = (id: string) => rows.find((r) => r.id === id) as MatrixRow;

describe("board — matrice", () => {
  test("lit les sections", () => {
    expect(rows.map((r) => `${r.id}@${r.section}`)).toEqual(["TECH-01@3", "TECH-10@3", "SALLE-01@5.3", "SALLE-02@5.3", "SALLE-03@5.3"]);
  });
});

describe("board — chevauchement", () => {
  test("dossier et fichier dedans", () => expect(overlaps("src/views/room/**", "src/views/room/RoomPage.tsx")).toBe(true));
  test("fichiers distincts", () => expect(overlaps("src/server/rooms.ts", "src/server/visibility.ts")).toBe(false));
  test("nom de base seul", () => expect(overlaps("RoomPage.tsx", "src/views/room/RoomPage.tsx")).toBe(true));
  test("préfixe de nom sans être un dossier", () => expect(overlaps("src/server/room", "src/server/rooms.ts")).toBe(false));
});

describe("board — next", () => {
  test("saute les complets et ce qui chevauche une prise ou un autre choix", () => {
    const b = emptyBoard();
    expect(pickNext(rows, b, 3).map((r) => r.id)).toEqual(["TECH-10", "SALLE-01", "SALLE-03"]);
  });
  test("filtre par section et respecte les prises et blocages", () => {
    const b = emptyBoard();
    claim(b, row("SALLE-02"), "feature/room/salle-02");
    b.blocked["SALLE-03"] = { reason: "texte ambigu", since: "" };
    expect(pickNext(rows, b, 2, "5.3").map((r) => r.id)).toEqual([]);
    expect(pickNext(rows, b, 2, "5").map((r) => r.id)).toEqual([]);
    expect(pickNext(rows, b, 2).map((r) => r.id)).toEqual(["TECH-10"]);
  });
});

describe("board — claim", () => {
  test("refuse une exigence prise par une autre branche, accepte la même", () => {
    const b = emptyBoard();
    expect(claim(b, row("SALLE-03"), "a")).toBeNull();
    expect(claim(b, row("SALLE-03"), "a")).toBeNull();
    expect(claim(b, row("SALLE-03"), "b")).toContain("déjà prise par a");
  });
  test("refuse des fichiers en commun", () => {
    const b = emptyBoard();
    claim(b, row("SALLE-01"), "a");
    expect(claim(b, row("SALLE-02"), "b")).toContain("mêmes fichiers que SALLE-01");
  });
  test("signale les prises de plus de 6 h", () => {
    const b = emptyBoard();
    claim(b, row("TECH-10"), "a", new Date("2026-11-19T00:00:00Z"));
    expect(staleClaims(b, new Date("2026-11-19T07:00:00Z"))).toEqual(["TECH-10"]);
  });
});
