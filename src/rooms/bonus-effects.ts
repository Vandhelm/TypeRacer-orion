// BONUS-02 : les types de bonus de remontée et leur effet, choisis par le serveur temps réel à l'attribution (BONUS-01).
// Logique pure, partagée par le serveur (src/realtime/server.ts) et la page de course (src/views/game/bonus.ts).
// Règles documentées dans docs/ARCHITECTURE.md, « Types de bonus (BONUS-02) » :
// - « fewer_words » (-3 mots) aide le coureur en retard : les 3 derniers mots de son propre texte disparaissent ;
// - « extra_words » (+3 mots) ralentit le meneur : 3 mots tirés du texte de la course s'ajoutent à la fin du sien ;
// - « fog » (brouillard) ralentit le meneur : les mots après celui qu'il tape sont flous pendant FOG_MS.

export const BONUS_KINDS = ["fewer_words", "extra_words", "fog"] as const;
export type BonusKind = (typeof BONUS_KINDS)[number];
/** Qui subit l'effet : le coureur en retard lui-même (aide), ou le meneur (ralentit). */
export const BONUS_TARGET: Record<BonusKind, "self" | "leader"> = { fewer_words: "self", extra_words: "leader", fog: "leader" };
/** Mots ajoutés au meneur ou retirés au coureur en retard. */
export const WORDS_CHANGED = 3;
/** Durée du brouillard, en millisecondes. */
export const FOG_MS = 5000;

/** L'effet d'un bonus, sur `target` (id du joueur) ; envoyé tel quel dans le message `bonus`. */
export type BonusEffect =
  | { kind: "fewer_words"; target: string; removed: number }
  | { kind: "extra_words"; target: string; words: string[] }
  | { kind: "fog"; target: string; durationMs: number };

/** Un coureur vu par l'effet : sa progression acceptée, s'il est arrivé, et son texte (null : inconnu du serveur). */
export type EffectRunner = { playerId: string; progress: number; finished: boolean; words: readonly string[] | null };

const unit = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : value === Infinity ? 1 : 0);

/** Les mots validés à cette progression (mots validés ÷ nombre de mots, comme la page de course). */
export const wordsDone = (words: number, progress: number) => Math.round(unit(progress) * words);

/**
 * Le type du bonus, tiré de la graine du salon : `checkpoint` (1 à 3) et `order` (rang du coureur parmi ceux servis à ce
 * point) font tourner les types, donc un coureur servi aux 3 points de contrôle reçoit chacun des 3 types une fois.
 */
export function bonusKind(seed: number, checkpoint: number, order: number): BonusKind {
  return BONUS_KINDS[((seed >>> 0) % BONUS_KINDS.length + checkpoint - 1 + order) % BONUS_KINDS.length]!;
}

/** Le meneur à ralentir : le coureur le plus avancé encore en course, devant le bénéficiaire (ex æquo : par id). */
function leaderOf(runners: readonly EffectRunner[], beneficiary: EffectRunner | undefined): EffectRunner | undefined {
  const floor = unit(beneficiary?.progress ?? 0);
  return runners
    .filter((r) => !r.finished && r.playerId !== beneficiary?.playerId && unit(r.progress) > floor)
    .sort((a, b) => unit(b.progress) - unit(a.progress) || a.playerId.localeCompare(b.playerId))[0];
}

/** Mots retirables : jamais le mot en cours, donc au moins un mot reste à taper. */
const removable = (runner: EffectRunner) => (runner.words ? Math.min(WORDS_CHANGED, runner.words.length - wordsDone(runner.words.length, runner.progress) - 1) : 0);

type Plan = { kind: BonusKind; beneficiary: string; runners: readonly EffectRunner[]; pool: readonly string[] | null; random: () => number };

/** L'effet du type `kind`, ou s'il ne peut pas s'appliquer, du type suivant (dans l'ordre de BONUS_KINDS) ; null : aucun. */
export function planEffect({ kind, beneficiary, runners, pool, random }: Plan): BonusEffect | null {
  const self = runners.find((r) => r.playerId === beneficiary);
  const leader = leaderOf(runners, self);
  const start = BONUS_KINDS.indexOf(kind);
  for (let i = 0; i < BONUS_KINDS.length; i++) {
    const candidate = BONUS_KINDS[(start + i) % BONUS_KINDS.length]!;
    if (candidate === "fewer_words" && self && removable(self) > 0) return { kind: candidate, target: beneficiary, removed: removable(self) };
    if (candidate === "extra_words" && leader?.words && pool?.length) {
      const words = Array.from({ length: WORDS_CHANGED }, () => pool[Math.floor(random() * pool.length)]!);
      return { kind: candidate, target: leader.playerId, words };
    }
    if (candidate === "fog" && leader) return { kind: candidate, target: leader.playerId, durationMs: FOG_MS };
  }
  return null;
}

/**
 * Le texte de la cible après l'effet, `done` mots déjà validés. Le serveur et la page appliquent la même règle :
 * les mots ajoutés vont à la fin, les mots retirés partent de la fin sans jamais toucher le mot en cours.
 */
export function editWords(words: readonly string[], effect: BonusEffect, done: number): string[] {
  if (effect.kind === "extra_words") return [...words, ...effect.words];
  if (effect.kind === "fewer_words") return words.slice(0, words.length - Math.max(0, Math.min(effect.removed, words.length - done - 1)));
  return [...words];
}
