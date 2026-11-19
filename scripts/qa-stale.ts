/**
 * Liste les exigences à revérifier depuis leur dernière QA.
 *
 * Usage : bun scripts/qa-stale.ts [cible=dev] [--json]
 *
 * Une exigence est à revérifier si :
 * - elle n'a jamais été vérifiée (statut « non vérifié » ou absente de docs/qa/state.json) ;
 * - un de ses « Fichiers principaux » (docs/EXIGENCES.md) a changé entre le commit de sa QA et la cible ;
 * - un commit depuis sa QA porte son ID dans un footer `Refs:`.
 */
import { $ } from "bun";

export type Row = { id: string; status: string; files: string[] };
export type State = Record<string, { commit: string; date: string; scope: string }>;
export type Stale = { id: string; status: string; reasons: string[] };

const ROW = /^\| ([A-Z0-9]+-\d+) \|([^|]*)\|([^|]*)\|/;

export function parseMatrix(text: string): Row[] {
  const rows: Row[] = [];
  for (const line of text.split("\n")) {
    const m = ROW.exec(line);
    if (!m) continue;
    const files = [...m[3].matchAll(/`([^`]+)`/g)].map((f) => f[1].trim()).filter(Boolean);
    rows.push({ id: m[1], status: m[2].trim(), files });
  }
  return rows;
}

/** Un chemin de la matrice couvre-t-il ce fichier modifié ? Gère dossiers, `*`, `**` et `…`. */
export function covers(pattern: string, file: string): boolean {
  const p = pattern.replace(/…/g, "*").replace(/\/$/, "");
  if (!p.includes("*")) return file === p || file.startsWith(`${p}/`);
  return new Bun.Glob(p).match(file) || new Bun.Glob(`${p}/**`).match(file);
}

/** IDs cités dans les footers `Refs:` d'un message, plages comprises (`DES-01..06`). */
export function refsOf(message: string): Set<string> {
  const ids = new Set<string>();
  for (const line of message.split("\n")) {
    const m = /^Refs:\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    for (const r of m[1].matchAll(/([A-Z0-9]+)-(\d+)(?:\.\.(\d+))?/g)) {
      const [, prefix, from, to] = r;
      const width = from.length;
      const end = to ? Number(to) : Number(from);
      for (let n = Number(from); n <= end; n++) ids.add(`${prefix}-${String(n).padStart(width, "0")}`);
    }
  }
  return ids;
}

export function findStale(
  rows: Row[],
  state: State,
  changedSince: (commit: string) => string[],
  refsSince: (commit: string) => Set<string>,
): Stale[] {
  const out: Stale[] = [];
  for (const row of rows) {
    const entry = state[row.id];
    if (row.status === "non vérifié" || !entry) {
      out.push({ id: row.id, status: row.status, reasons: ["jamais vérifiée"] });
      continue;
    }
    const reasons: string[] = [];
    const touched = changedSince(entry.commit).filter((f) => row.files.some((p) => covers(p, f)));
    if (touched.length) reasons.push(`fichiers modifiés : ${touched.slice(0, 3).join(", ")}${touched.length > 3 ? ` (+${touched.length - 3})` : ""}`);
    if (refsSince(entry.commit).has(row.id)) reasons.push("commit Refs depuis la QA");
    if (reasons.length) out.push({ id: row.id, status: row.status, reasons });
  }
  return out;
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const json = args.includes("--json");
  const target = args.find((a) => !a.startsWith("--")) ?? "dev";
  const root = (await $`git rev-parse --show-toplevel`.text()).trim();
  const matrix = (await $`git show ${target}:docs/EXIGENCES.md`.cwd(root).text());
  const stateText = await $`git show ${target}:docs/qa/state.json`.cwd(root).nothrow().text();
  const state: State = stateText.trim() ? JSON.parse(stateText) : {};

  const diffCache = new Map<string, string[]>();
  const refsCache = new Map<string, Set<string>>();
  // Un seul appel git par commit de QA distinct.
  for (const c of new Set(Object.values(state).map((e) => e.commit))) {
    diffCache.set(c, (await $`git diff --name-only ${c} ${target}`.cwd(root).text()).split("\n").filter(Boolean));
    // Les commits de matrice seule ne comptent pas : ils citent les ID sans toucher au code.
    const log = await $`git log ${c}..${target} --format=%B%x00 -- . :!docs/EXIGENCES.md :!docs/qa`.cwd(root).text();
    refsCache.set(c, refsOf(log));
  }
  const stale = findStale(parseMatrix(matrix), state, (c) => diffCache.get(c) ?? [], (c) => refsCache.get(c) ?? new Set());

  if (json) {
    console.log(JSON.stringify({ target, stale }, null, 2));
  } else if (!stale.length) {
    console.log(`Rien à revérifier sur ${target}.`);
  } else {
    console.log(`${stale.length} exigence(s) à revérifier sur ${target} :\n`);
    for (const s of stale) console.log(`${s.id.padEnd(10)} ${s.status.padEnd(12)} ${s.reasons.join(" ; ")}`);
  }
}
