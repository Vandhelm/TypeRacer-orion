// HIST-01 : l'historique des courses du compte connecté, lu page par page sur le serveur.
import { z } from "zod";

const HistoryRaceSchema = z.object({
  id: z.number().int(),
  at: z.string(),
  rank: z.number(),
  wpm: z.number(),
  accuracy: z.number(),
  seconds: z.number(),
  finished: z.boolean(),
  eliminated: z.boolean(),
  textType: z.string(),
  language: z.string(),
  wordCount: z.number(),
  players: z.number(),
});
export type HistoryRace = z.infer<typeof HistoryRaceSchema>;

const HistoryPageSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  pages: z.number().int(),
  races: z.array(z.unknown()),
});
export type HistoryPage = Omit<z.infer<typeof HistoryPageSchema>, "races"> & { races: HistoryRace[] };

/** La réponse du serveur, vérifiée ; une course mal formée est écartée. null : ce n'est pas une page. */
export function parseHistoryPage(value: unknown): HistoryPage | null {
  const page = HistoryPageSchema.safeParse(value);
  if (!page.success) return null;
  const races = page.data.races.flatMap((race) => {
    const parsed = HistoryRaceSchema.safeParse(race);
    return parsed.success ? [parsed.data] : [];
  });
  return { ...page.data, races };
}

export const historyUrl = (page: number) => `/api/history?page=${page}`;

export async function fetchHistory(page: number, signal?: AbortSignal): Promise<HistoryPage> {
  const response = await fetch(historyUrl(page), { signal });
  if (!response.ok) throw new Error(`history ${response.status}`);
  const parsed = parseHistoryPage(await response.json());
  if (!parsed) throw new Error("history: malformed page");
  return parsed;
}

/** Même libellé que la carte de la dernière course. */
export const outcomeKey = (race: Pick<HistoryRace, "finished" | "eliminated">) =>
  race.eliminated ? "profile.out" : race.finished ? "profile.finished" : "profile.notFinished";
