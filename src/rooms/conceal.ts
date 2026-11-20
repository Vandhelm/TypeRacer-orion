// COURSE-03 : le texte n'est révélé qu'au début du décompte. Le texte personnalisé (mode custom) est écrit par l'hôte
// dans les réglages : hors course, seul l'hôte le reçoit. Partagé par la vue HTTP (src/server/rooms.ts) et la
// diffusion du temps réel (src/realtime/server.ts), qui envoie à chaque suiveur sa propre vue.

/** Lancé (décompte, course ou résultats) : le passage, la graine et l'empreinte de la course jouée sont révélés à tous. */
export const textRevealed = (status: unknown) => status === "racing" || status === "results";

/**
 * Le texte personnalisé n'est lisible de tous que pendant la course (racing). En attente comme aux résultats, les
 * réglages portent le texte de la prochaine course, que l'hôte peut déjà changer : il reste à lui seul. Les résultats
 * de la course jouée n'en dépendent pas (ils viennent de la page de course et de la base, pas de ces réglages).
 */
const customTextRevealed = (status: unknown) => status === "racing";

/** La vue du salon pour `viewer` (clé de membre) : sans le texte personnalisé s'il n'est pas l'hôte, hors course. */
export function concealText<T extends object>(view: T, viewer: string): T {
  const { status, host, settings } = view as { status?: unknown; host?: unknown; settings?: { text?: unknown } };
  if (customTextRevealed(status) || host === viewer || !settings || typeof settings.text !== "string" || settings.text === "") return view;
  return { ...view, settings: { ...settings, text: "" } };
}
