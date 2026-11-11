export type RacePoolImages = { fish: string[]; pipe: string };

export type RacePoolApi = {
  /** fraction: share of the text this player has typed, from 0 to 1. Serves one ice cream scoop per fifth of the text. */
  setProgress(lane: number, fraction: number): void;
  /** The player has finished: stamps their rank, then the fish eats its tower. */
  finish(lane: number, label: string): void;
  destroy(): void;
};

export function loadRacePoolImages(): Promise<RacePoolImages>;

export function createRacePool(root: HTMLElement, options: { players: { me?: boolean }[]; images: RacePoolImages }): RacePoolApi;
