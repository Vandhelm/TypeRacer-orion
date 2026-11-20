// JOIN-03 : « Faire une course ». Le serveur choisit le salon et y fait entrer (POST /api/rooms/quick) ; l'accueil
// ouvre la salle d'attente, ou montre l'état vide. Proposer de créer un salon dépend de la réponse du serveur
// (canCreate, lu de la session), jamais d'une supposition de la page.
import { isRoomCode } from "../../rooms/access";
import { WAITING_PAGE } from "./rooms";

export type QuickRaceOutcome = { kind: "go"; href: string } | { kind: "empty"; canCreate: boolean } | { kind: "error" };

const goTo = (code: unknown): QuickRaceOutcome => (typeof code === "string" && isRoomCode(code) ? { kind: "go", href: `${WAITING_PAGE}?code=${code}` } : { kind: "error" });

/** Ce que fait l'accueil d'une réponse de POST /api/rooms/quick (ou POST /api/rooms). */
export function quickRaceOutcome(status: number, body: unknown): QuickRaceOutcome {
  const data = (body && typeof body === "object" ? body : {}) as { room?: unknown; error?: unknown; canCreate?: unknown };
  if (status === 200 || status === 201) return goTo((data.room as { code?: unknown } | undefined)?.code);
  // SALLE-06 : déjà dans un salon, on y retourne
  if (status === 409 && data.error === "already_in_room") return goTo(data.room);
  if (status === 404 && data.error === "no_room") return { kind: "empty", canCreate: data.canCreate === true };
  return { kind: "error" };
}

async function post(fetcher: typeof fetch, url: string, body: unknown): Promise<QuickRaceOutcome> {
  try {
    const res = await fetcher(url, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return quickRaceOutcome(res.status, await res.json().catch(() => null));
  } catch {
    return { kind: "error" };
  }
}

/** JOIN-03 : demande une place au serveur. */
export const quickRace = (fetcher: typeof fetch = fetch) => post(fetcher, "/api/rooms/quick", {});

/** JOIN-03 : aucun salon, un compte en crée un public avec les réglages par défaut, et en devient l'hôte. */
export const createPublicRoom = (fetcher: typeof fetch = fetch) => post(fetcher, "/api/rooms", { role: "player", settings: { visibility: "public" } });
