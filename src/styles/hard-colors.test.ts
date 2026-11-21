// DES-05 : une couleur qui porte un sens ou l'identité passe par un token de thème (src/styles/base/tokens.css), sinon
// elle ne change pas avec le thème. Ce test lit le code (TS, TSX, CSS de src/ et app/, hors tests et tokens.css) et
// refuse toute couleur écrite en dur qui a une teinte. Le noir, le blanc et les gris sont permis partout : sans teinte,
// une dichromatie les voit tels quels, et ils sont la base des deux thèmes. Une couleur purement décorative reste
// permise si elle est inscrite ci-dessous, fichier par fichier, avec sa raison.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseCssColor } from "./contrast";

type Allowed = { why: string; colors: string[] };

const FLAVORS_2D = ["#8b3cf0", "rgba(60,10,140,.45)", "#d8c2ff", "#6a22c9", "#a8357a", "rgba(80,10,50,.45)", "#f3b9dc", "#82235c", "#fff07a", "rgba(170,140,20,.42)", "#e8cf3c", "#ff8a3a", "rgba(160,60,0,.5)", "#ffe0c8", "#e0661a"];
const FLAVORS_3D = ["#8b3cf0", "#7429dc", "#5419b0", "#3a0c86", "#6a22c9", "#b0407f", "#962f69", "#741f50", "#4f0f34", "#82235c", "#fff27e", "#f3dc52", "#d9b82c", "#9a7d0e", "#e8cf3c", "#ff8f40", "#f07224", "#cc5512", "#8a3200", "#e0661a"];
const POOL_FLAVORS = ["#8b3cf0", "#d8c2ff", "#5419b0", "#7429dc", "#3a0c86", "#b0407f", "#f3b9dc", "#741f50", "#962f69", "#4f0f34", "#fff27e", "#d9b82c", "#f3dc52", "#9a7d0e", "#ff8f40", "#ffe0c8", "#cc5512", "#f07224", "#8a3200"];

/** Le décoratif permis, et pourquoi. Une entrée qui ne sert plus fait échouer le test : la liste reste à jour. */
export const DECORATIVE: Record<string, Allowed> = {
  "src/rooms/seats.ts": {
    why: "the colour the server stores per seat (SALLE-05); shown through --color-seat-N (seatFill), equal to the default tokens (cvd.test.ts)",
    colors: ["hsl(6, 71%, 58%)", "hsl(266, 85%, 59%)", "hsl(54, 100%, 74%)", "hsl(25, 100%, 63%)", "hsl(326, 47%, 47%)", "hsl(161, 65%, 60%)", "hsl(220, 85%, 65%)", "hsl(${Math.round((seat * 137.508)"],
  },
  "src/views/home/scene/createScene.ts": {
    why: "food and tableware of the sushi counter (ice cream flavours, rice, sushi fish, chopsticks, soy sauce, tea): no meaning, the same in both themes",
    colors: [...new Set([...FLAVORS_2D, ...FLAVORS_3D, "#cfccc5", "#ebe8e2", "#bdb9b1", "#f3f1ec", "#a3221a", "#c0342a", "#7a1812", "#c94535", "rgba(255,200,190,.35)", "#d9d6cf", "#efece6", "#2a0a07", "#3a3a2a"])],
  },
  "src/views/game/pool/createRacePool.ts": {
    why: "ice cream flavours picked at random for each scoop: they tell no player apart",
    colors: POOL_FLAVORS,
  },
  "src/styles/contrast.ts": { why: "the colour formats the contrast helper reads, in its documentation", colors: ["rgb(r, g, b)", "rgba(r, g, b, a)", "hsl(h, s%, l%)"] },
};

const COLOR = /#[0-9a-fA-F]{3,8}\b|\b0x[0-9a-fA-F]{6}\b|\b(?:rgba?|hsla?)\([^)]*\)/g;

/**
 * Vrai si la couleur a une teinte. Dans un gabarit, chaque `${…}` compte pour 0 : `rgba(255,255,255,${a})` reste un
 * blanc ; un hsl() n'a de teinte écrite en dur que si sa saturation est un nombre non nul (`hsl(${hue}, 45%, 16%)`),
 * pas si elle est calculée (`hsl(${h}, ${s}%, …)`, une nuance tirée d'un token). Une écriture illisible compte comme une teinte.
 */
function hasHue(written: string): boolean {
  if (written.includes("${") && /^hsla?\(/i.test(written)) {
    const saturation = /^hsla?\([^,]*,\s*([^,%]*)%/i.exec(written)?.[1]?.trim();
    if (saturation === undefined) return true;
    return saturation.startsWith("${") ? false : Number(saturation) > 0;
  }
  const value = written.replace(/\$\{[^}]*\}/g, "0");
  const hex = /^(?:#|0x)([0-9a-f]+)$/i.exec(value)?.[1];
  if (hex) {
    if (![3, 4, 6, 8].includes(hex.length)) return false; // pas une couleur (#123456789, identifiant)
    const full = hex.length <= 4 ? [...hex.slice(0, 3)].map((d) => d + d).join("") : hex.slice(0, 6);
    return !(full.slice(0, 2) === full.slice(2, 4) && full.slice(2, 4) === full.slice(4, 6));
  }
  try {
    const { r, g, b } = parseCssColor(value);
    return !(r === g && g === b);
  } catch {
    return true;
  }
}

const files = [...new Bun.Glob("{src,app}/**/*.{ts,tsx,css}").scanSync({ cwd: `${import.meta.dir}/../..` })].filter(
  (file) => !/\.(test|e2e|perf)\.tsx?$/.test(file) && file !== "src/styles/base/tokens.css",
);

function hardColors(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of files) {
    const source = readFileSync(`${import.meta.dir}/../../${file}`, "utf8");
    const colors = [...source.matchAll(COLOR)].map((m) => m[0]).filter(hasHue);
    if (colors.length) found.set(file, colors);
  }
  return found;
}

describe("DES-05 — no colour with a hue is written outside the theme tokens", () => {
  test("the scan reads the code it guards (a known decorative colour is found)", () => {
    expect(files).toContain("src/views/home/scene/createScene.ts");
    expect(hardColors().get("src/views/home/scene/createScene.ts")).toContain("#8b3cf0");
  });

  test("black, white and greys are allowed; a hue is not", () => {
    for (const neutral of ["#000", "#fff", "#f2f2f2", "rgba(255,255,255,.35)", "rgba(0,0,0,.7)", "0x101010", "hsl(0, 0%, 72%)"]) expect(hasHue(neutral)).toBe(false);
    for (const hue of ["#e0574a", "rgba(255,140,120,.45)", "0xd23c30", "hsl(6, 71%, 58%)", "hsl(${hue}, 45%, 16%)", "hsl(${Math.round(x)"]) expect(hasHue(hue)).toBe(true);
    // a shade computed from a token (the fins of a fish) writes no hue of its own
    expect(hasHue("hsl(${h}, ${s}%, ${Math.min(l + 20, 90)")).toBe(false);
  });

  test("every colour with a hue is a documented decorative one", () => {
    const offenders = [...hardColors()].flatMap(([file, colors]) => colors.filter((c) => !DECORATIVE[file]?.colors.includes(c)).map((c) => `${file}: ${c}`));
    expect(offenders).toEqual([]);
  });

  test("the list of decorative colours has no stale entry", () => {
    const found = hardColors();
    const stale = Object.entries(DECORATIVE).flatMap(([file, { colors }]) => colors.filter((c) => !found.get(file)?.includes(c)).map((c) => `${file}: ${c}`));
    expect(stale).toEqual([]);
  });
});
