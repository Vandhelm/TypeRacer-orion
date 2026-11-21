// RES-03 : les données des graphiques des résultats d'une course. La vitesse de chaque participant (humains et bots)
// sur un même graphique, et les touches ratées par le joueur pendant cette course.
import type { KeyCounts } from "../../players/keys";
import type { ChartLine } from "../profile/chart";
import { DOT, LINE } from "../profile/styles";
import type { PlayerResult } from "./results";

const CURVE = "fill-none stroke-[1.5] [stroke-linecap:round] [stroke-linejoin:round]";
/**
 * Une couleur par participant (tokens --color-chart-N) ; le joueur local garde le rouge. Écrites en entier pour Tailwind.
 * DES-05 : et un pointillé par participant (stroke-dasharray), le joueur local en trait plein : une courbe se reconnaît
 * sans sa couleur (daltonismes, couleurs forcées), sur le graphique comme dans la légende.
 */
const SERIES = [
  { line: `${CURVE} stroke-chart-1`, dot: "fill-chart-1 stroke-black stroke-2", dash: "8 4" },
  { line: `${CURVE} stroke-chart-2`, dot: "fill-chart-2 stroke-black stroke-2", dash: "1 4" },
  { line: `${CURVE} stroke-chart-3`, dot: "fill-chart-3 stroke-black stroke-2", dash: "8 3 1 3" },
  { line: `${CURVE} stroke-chart-4`, dot: "fill-chart-4 stroke-black stroke-2", dash: "4 4" },
  { line: `${CURVE} stroke-chart-5`, dot: "fill-chart-5 stroke-black stroke-2", dash: "12 4" },
  { line: `${CURVE} stroke-chart-6`, dot: "fill-chart-6 stroke-black stroke-2", dash: "1 3 1 3 6 3" },
  { line: `${CURVE} stroke-chart-7`, dot: "fill-chart-7 stroke-black stroke-2", dash: "2 3 2 7" },
  { line: `${CURVE} stroke-chart-8`, dot: "fill-chart-8 stroke-black stroke-2", dash: "12 3 3 3" },
];
const MINE = { line: LINE.wpm, dot: DOT.wpm };

/** Une valeur lisible : un nombre fini et positif, sinon 0 (une série relue ne casse pas l'échelle). */
const clean = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);

/**
 * Une courbe par participant qui a au moins une seconde mesurée, dans l'ordre final. `missing` : ceux qui n'en ont
 * aucune (abandon parti avant sa course, humain d'une course de l'historique sans série à lui).
 */
export function raceLines(players: PlayerResult[]): { lines: ChartLine[]; missing: string[] } {
  let next = 0;
  const lines = players
    .filter((player) => player.wpmSeries.length > 0)
    .map((player, index): ChartLine => {
      const colors = player.me ? MINE : SERIES[next++ % SERIES.length]!;
      return { key: `${index}:${player.name}`, label: player.name, values: player.wpmSeries.map(clean), bot: player.bot, me: player.me, ...colors };
    });
  return { lines, missing: players.filter((player) => !player.wpmSeries.length).map((player) => player.name) };
}

/** Les frappes et fautes par touche du joueur local pour cette course, ou null s'il n'y a pas couru. */
export const raceKeys = (players: PlayerResult[]): KeyCounts | null => players.find((player) => player.me)?.keys ?? null;
