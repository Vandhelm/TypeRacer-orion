// COURSE-03 : le texte n'est révélé qu'au début du décompte. Le texte personnalisé (mode custom) est écrit par l'hôte
// dans les réglages : avant le lancement, seul l'hôte le reçoit. Partagé par la vue HTTP (src/server/rooms.ts) et la
// diffusion du temps réel (src/realtime/server.ts), qui envoie à chaque suiveur sa propre vue.

/** Lancé (décompte, course ou résultats) : le texte est révélé à tous. */
export const textRevealed = (status: unknown) => status === "racing" || status === "results";

/** La vue du salon pour `viewer` (clé de membre) : sans le texte personnalisé s'il n'est pas l'hôte d'un salon non lancé. */
export function concealText<T extends object>(view: T, viewer: string): T {
  const { status, host, settings } = view as { status?: unknown; host?: unknown; settings?: { text?: unknown } };
  if (textRevealed(status) || host === viewer || !settings || typeof settings.text !== "string" || settings.text === "") return view;
  return { ...view, settings: { ...settings, text: "" } };
}
