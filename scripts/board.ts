/**
 * Tableau de bord des agents, partagé par tous les worktrees (fichier dans le dossier git commun,
 * hors versionnement : chaque branche lit le même).
 *
 * Usage : bun scripts/board.ts <commande>
 *   status                                  qui tient quoi, depuis quand, file de merge
 *   next [--slots N] [--section 5.3]        exigences prêtes à prendre (pas complètes, libres, sans fichier commun avec une prise)
 *   claim <ID> --branch <b>                 réserve l'exigence (refus si prise ou si ses fichiers chevauchent une prise)
 *   stage <ID> <dev|qa|fix|merge>           avance l'étape
 *   release <ID>                            libère (après merge dans dev, ou abandon)
 *   block <ID> <raison…> / unblock <ID>     attend une décision de l'utilisateur
 *   check <ID> --branch <b>                 code 1 si l'exigence est prise par une autre branche
 *   lock <merge|pilot> <acquire|release> --branch <b>   un seul merge dans dev, un seul pilote à la fois
 *
 * Fichier : $ORION_BOARD, sinon <git-common-dir>/orion-board.json.
 */
import { $ } from "bun";
import { mkdirSync, readFileSync, rmdirSync, writeFileSync, existsSync } from "node:fs";
import { parseMatrix, type Row } from "./qa-stale";

export type Stage = "dev" | "qa" | "fix" | "merge";
export type Claim = { branch: string; files: string[]; since: string; stage: Stage };
export type Board = {
  claims: Record<string, Claim>;
  blocked: Record<string, { reason: string; since: string }>;
  locks: Record<string, { branch: string; since: string }>;
};
export type MatrixRow = Row & { section: string };

export const STALE_HOURS = 6;
const STAGES: Stage[] = ["dev", "qa", "fix", "merge"];

export const emptyBoard = (): Board => ({ claims: {}, blocked: {}, locks: {} });

/** Lignes de la matrice avec leur section (« 5.3 », « 3 »…). */
export function parseSections(text: string): MatrixRow[] {
  const out: MatrixRow[] = [];
  let section = "";
  for (const line of text.split("\n")) {
    const h = /^#{2,3} (\d+(?:\.\d+)?)\.? /.exec(line);
    if (h) section = h[1] ?? "";
    const [row] = parseMatrix(line);
    if (row) out.push({ ...row, section });
  }
  return out;
}

/** Partie fixe d'un chemin de la matrice (avant le premier joker). */
function stem(pattern: string): string {
  const p = pattern.replace(/…/g, "*").replace(/\/$/, "");
  const i = p.search(/[*?[{]/);
  return (i < 0 ? p : p.slice(0, i)).replace(/\/$/, "");
}

/** Deux chemins de la matrice peuvent-ils désigner un même fichier ? Prudent : dans le doute, oui. */
export function overlaps(a: string, b: string): boolean {
  const x = stem(a);
  const y = stem(b);
  if (!x || !y) return true;
  const under = (p: string, q: string) => p === q || p.startsWith(`${q}/`);
  if (under(x, y) || under(y, x)) return true;
  // nom de fichier seul (« RoomPage.tsx ») : compare au nom de base
  const base = (p: string) => p.split("/").pop() ?? p;
  return (!x.includes("/") || !y.includes("/")) && base(x) === base(y);
}

export function filesOverlap(a: string[], b: string[]): boolean {
  return a.some((p) => b.some((q) => overlaps(p, q)));
}

/** Prochaines exigences à prendre, dans l'ordre de la matrice, sans chevauchement entre elles ni avec les prises. */
export function pickNext(rows: MatrixRow[], board: Board, slots: number, section?: string): MatrixRow[] {
  const taken = Object.values(board.claims).map((c) => c.files);
  const picked: MatrixRow[] = [];
  for (const row of rows) {
    if (picked.length >= slots) break;
    if (row.status === "complet") continue;
    if (section && row.section !== section && !row.section.startsWith(`${section}.`)) continue;
    if (board.claims[row.id] || board.blocked[row.id]) continue;
    if (taken.some((f) => filesOverlap(row.files, f))) continue;
    picked.push(row);
    taken.push(row.files);
  }
  return picked;
}

/** Réserve une exigence ; renvoie une erreur lisible ou null. */
export function claim(board: Board, row: MatrixRow, branch: string, now = new Date()): string | null {
  const held = board.claims[row.id];
  if (held && held.branch !== branch) return `${row.id} est déjà prise par ${held.branch} (étape ${held.stage})`;
  if (held) return null;
  if (board.blocked[row.id]) return `${row.id} attend une décision : ${board.blocked[row.id]?.reason}`;
  for (const [id, c] of Object.entries(board.claims)) {
    if (c.branch !== branch && filesOverlap(row.files, c.files)) return `${row.id} touche les mêmes fichiers que ${id} (${c.branch}) : attends sa fin`;
  }
  board.claims[row.id] = { branch, files: row.files, since: now.toISOString(), stage: "dev" };
  return null;
}

export function staleClaims(board: Board, now = new Date()): string[] {
  return Object.entries(board.claims)
    .filter(([, c]) => now.getTime() - new Date(c.since).getTime() > STALE_HOURS * 3600_000)
    .map(([id]) => id);
}

// ——— accès au fichier, sous verrou (mkdir est atomique) ———

async function boardPath(): Promise<string> {
  if (process.env.ORION_BOARD) return process.env.ORION_BOARD;
  const common = (await $`git rev-parse --path-format=absolute --git-common-dir`.text()).trim();
  return `${common}/orion-board.json`;
}

async function withBoard<T>(fn: (b: Board) => T): Promise<T> {
  const path = await boardPath();
  const lock = `${path}.lock`;
  for (let i = 0; ; i++) {
    try {
      mkdirSync(lock);
      break;
    } catch {
      if (i > 100) throw new Error(`verrou ${lock} bloqué : supprime-le s'il ne reste aucun board.ts en cours`);
      await Bun.sleep(50);
    }
  }
  try {
    const board: Board = existsSync(path) ? { ...emptyBoard(), ...JSON.parse(readFileSync(path, "utf8")) } : emptyBoard();
    const out = fn(board);
    writeFileSync(path, `${JSON.stringify(board, null, 2)}\n`);
    return out;
  } finally {
    rmdirSync(lock);
  }
}

async function matrixRows(): Promise<MatrixRow[]> {
  const text = await $`git show dev:docs/EXIGENCES.md`.nothrow().text();
  return parseSections(text);
}

function opt(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

if (import.meta.main) {
  const [cmd = "status", ...args] = Bun.argv.slice(2);
  const id = args.find((a) => /^[A-Z0-9]+-\d+$/.test(a));
  const branch = opt(args, "branch");
  const fail = (msg: string): never => {
    console.error(msg);
    process.exit(1);
  };
  const rows = await matrixRows();
  const rowOf = (x?: string) => rows.find((r) => r.id === x) ?? fail(`exigence inconnue dans la matrice de dev : ${x}`);

  switch (cmd) {
    case "status": {
      await withBoard((b) => {
        const stale = new Set(staleClaims(b));
        const claims = Object.entries(b.claims);
        console.log(claims.length ? "En cours :" : "Rien en cours.");
        for (const [k, c] of claims) console.log(`  ${k.padEnd(10)} ${c.stage.padEnd(6)} ${c.branch}  depuis ${c.since.slice(0, 16)}${stale.has(k) ? "  ⚠ plus de 6 h" : ""}`);
        for (const [k, v] of Object.entries(b.blocked)) console.log(`  ${k.padEnd(10)} bloqué  ${v.reason}`);
        for (const name of ["pilot", "merge"]) {
          const l = b.locks[name];
          console.log(`Verrou ${name} : ${l ? `${l.branch} depuis ${l.since.slice(0, 16)}` : "libre"}`);
        }
      });
      break;
    }
    case "next": {
      const slots = Number(opt(args, "slots") ?? 2);
      const picked = await withBoard((b) => pickNext(rows, b, slots, opt(args, "section")));
      if (!picked.length) console.log("Rien de prêt : tout est complet, pris, bloqué ou en conflit de fichiers.");
      for (const r of picked) console.log(`${r.id.padEnd(10)} ${r.status.padEnd(12)} ${r.section.padEnd(5)} ${r.files.join(", ")}`);
      break;
    }
    case "claim": {
      if (!branch) fail("--branch requis");
      const row = rowOf(id);
      const err = await withBoard((b) => claim(b, row, branch as string));
      if (err) fail(err);
      console.log(`${row.id} réservée pour ${branch}`);
      break;
    }
    case "stage": {
      const stage = args.find((a) => (STAGES as string[]).includes(a)) as Stage | undefined;
      if (!stage) fail(`étape attendue : ${STAGES.join("|")}`);
      await withBoard((b) => {
        const c = b.claims[id ?? ""] ?? fail(`${id} n'est pas prise`);
        c.stage = stage as Stage;
      });
      console.log(`${id} → ${stage}`);
      break;
    }
    case "release":
      await withBoard((b) => void delete b.claims[id ?? ""]);
      console.log(`${id} libérée`);
      break;
    case "block": {
      const reason = args.filter((a) => a !== id).join(" ") || "décision attendue";
      await withBoard((b) => {
        delete b.claims[id ?? ""];
        b.blocked[id ?? ""] = { reason, since: new Date().toISOString() };
      });
      console.log(`${id} bloquée : ${reason}`);
      break;
    }
    case "unblock":
      await withBoard((b) => void delete b.blocked[id ?? ""]);
      console.log(`${id} débloquée`);
      break;
    case "check": {
      const held = await withBoard((b) => b.claims[id ?? ""]);
      if (held && held.branch !== branch) fail(`${id} est prise par ${held.branch} (étape ${held.stage})`);
      break;
    }
    case "lock": {
      if (!branch) fail("--branch requis");
      const [name = "", action] = args;
      if (!["merge", "pilot"].includes(name)) fail("verrou attendu : merge ou pilot");
      const err = await withBoard((b) => {
        if (action === "acquire") {
          const held = b.locks[name];
          if (held && held.branch !== branch) return `verrou ${name} tenu par ${held.branch} depuis ${held.since.slice(0, 16)}`;
          b.locks[name] = { branch: branch as string, since: new Date().toISOString() };
        } else if (action === "release") {
          if (b.locks[name]?.branch === branch) delete b.locks[name];
        } else return "acquire ou release";
        return null;
      });
      if (err) fail(err);
      console.log(`verrou ${name} ${action} : ${branch}`);
      break;
    }
    default:
      fail(`commande inconnue : ${cmd}`);
  }
}
