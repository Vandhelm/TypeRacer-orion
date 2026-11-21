// PERF-03 : le calcul des mesures de fluidité de la piste (tests/e2e/race-pool.perf.ts). Logique pure, testée par
// frames.test.ts. Pas un fichier *.e2e.ts ni *.perf.ts : Playwright ne le prend pas pour des tests.

/** Une image dure 16,7 ms à 60 Hz ; au-delà de 1,5 image (25 ms), une image a sauté. */
export const FRAME_BUDGET_MS = 1000 / 60;
export const DROPPED_FRAME_MS = FRAME_BUDGET_MS * 1.5;
/** Une longue tâche occupe le fil principal plus de 50 ms (définition de l'API Long Tasks). */
export const LONG_TASK_MS = 50;

export type Task = { start: number; duration: number };

export type FrameStats = {
  /** images comptées et durée de la fenêtre mesurée, en secondes */
  frames: number;
  seconds: number;
  /** images par seconde, en moyenne sur la fenêtre */
  fps: number;
  /** durée d'image : médiane, 95e centile et pire, en ms */
  medianMs: number;
  p95Ms: number;
  worstMs: number;
  /** part des images de plus de DROPPED_FRAME_MS, de 0 à 1 */
  droppedShare: number;
  /** longues tâches dans la fenêtre : nombre, durée totale et pire, en ms */
  longTasks: number;
  longTaskMs: number;
  worstLongTaskMs: number;
};

const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!;
}

/**
 * Les mesures d'une fenêtre : `stamps`, l'heure de chaque image (requestAnimationFrame, en ms, croissante) ;
 * `tasks`, les longues tâches observées. Seules les tâches commencées dans la fenêtre des images comptent.
 */
export function frameStats(stamps: readonly number[], tasks: readonly Task[]): FrameStats {
  const first = stamps[0] ?? 0;
  const last = stamps.at(-1) ?? 0;
  const durations = stamps.slice(1).map((stamp, i) => stamp - stamps[i]!);
  const sorted = [...durations].sort((a, b) => a - b);
  const seconds = (last - first) / 1000;
  const inside = tasks.filter((task) => task.start >= first && task.start <= last && task.duration > LONG_TASK_MS);
  return {
    frames: durations.length,
    seconds: round(seconds, 2),
    fps: seconds > 0 ? round(durations.length / seconds) : 0,
    medianMs: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    worstMs: round(sorted.at(-1) ?? 0),
    droppedShare: durations.length ? round(durations.filter((d) => d > DROPPED_FRAME_MS).length / durations.length, 3) : 0,
    longTasks: inside.length,
    longTaskMs: round(inside.reduce((sum, task) => sum + task.duration, 0)),
    worstLongTaskMs: round(Math.max(0, ...inside.map((task) => task.duration))),
  };
}
