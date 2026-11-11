// Géométrie du graphique : une seule échelle (MPM), les erreurs à part sur leur propre bande.
const LEFT = 34;
const RIGHT = 8;
const TOP = 18;
const BOTTOM = 26;
const ERROR_BAND = 22;
const SPEED_STEPS = [5, 10, 15, 20, 25, 50, 100, 150, 200, 250, 500];
const TIME_STEPS = [1, 2, 5, 10, 15, 20, 30, 60];

export const plotHeight = (windowWidth: number, windowHeight: number) =>
  windowWidth <= 700 ? 180 : Math.min(300, Math.max(180, windowHeight * 0.34));

export function buildChart(wpm: number[], raw: number[], width: number, plot: number) {
  const count = wpm.length;
  const highest = Math.max(5, ...wpm, ...raw);
  const step = SPEED_STEPS.find((candidate) => highest / candidate <= 4) ?? 1000;
  const ceiling = Math.ceil(highest / step) * step;
  const span = width - LEFT - RIGHT;
  const x = (i: number) => (count > 1 ? LEFT + (span * i) / (count - 1) : LEFT + span / 2);
  const y = (value: number) => TOP + plot - (plot * value) / ceiling;
  const timeStep = TIME_STEPS.find((candidate) => count / candidate <= (width < 500 ? 6 : 12)) ?? 60;

  return {
    count,
    x,
    y,
    left: LEFT,
    right: width - RIGHT,
    top: TOP,
    bandTop: TOP + plot,
    bandCenter: TOP + plot + ERROR_BAND / 2,
    cursorBottom: TOP + plot + ERROR_BAND,
    height: TOP + plot + ERROR_BAND + BOTTOM,
    speedTicks: Array.from({ length: ceiling / step + 1 }, (_, i) => i * step),
    timeTicks: Array.from({ length: count }, (_, i) => i).filter((i) => i === 0 || (i + 1) % timeStep === 0),
    path: (values: number[]) => values.map((value, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(value).toFixed(1)}`).join(""),
    /** L'indice de la seconde la plus proche d'une position x du graphique. */
    indexAt: (position: number) => (count > 1 ? Math.max(0, Math.min(count - 1, Math.round(((position - LEFT) / span) * (count - 1)))) : 0),
  };
}

export type Chart = ReturnType<typeof buildChart>;
