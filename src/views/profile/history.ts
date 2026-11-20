// HIST-01 : l'historique des courses du compte connecté, lu page par page sur le serveur.
import type { TFunction } from "i18next";
import { z } from "zod";
import { rankLabel } from "../podium/results";

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
  // RES-04 : la course a battu le record MPM ou de précision du joueur, quand elle a été courue (décidé par le serveur)
  wpmRecord: z.boolean().optional(),
  accuracyRecord: z.boolean().optional(),
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
/** RES-04 : les records battus par cette course, en toutes lettres (« Record MPM · Record précision ») ; vide sinon. */
export const recordText = (t: TFunction, race: Pick<HistoryRace, "wpmRecord" | "accuracyRecord">) =>
  [race.wpmRecord && t("profile.history.record.wpm"), race.accuracyRecord && t("profile.history.record.accuracy")].filter(Boolean).join(" · ");
/** « 2e sur 3 » : le rang parmi tous les participants de la course. */
export const historyRankText = (t: TFunction, race: Pick<HistoryRace, "rank" | "players">) => t("profile.history.rank", { rank: rankLabel(t, race.rank), players: race.players });
