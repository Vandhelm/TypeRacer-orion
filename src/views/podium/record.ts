// RES-04 : le record personnel battu par la course jouée dans cet onglet, confié au podium.
// Compte : la réponse de POST /api/races (`record`, décidé par le serveur sur son historique).
// Invité : sans historique serveur (AUTH-03), son record se compare aux courses de sa session (rememberGuestRace),
// et ne compte que si le serveur a bien répondu, en invité (réponse sans `record`).
import { z } from "zod";
import type { PersonalRecord } from "../../players/records";
import type { PlayerResult } from "./results";

const RECORD_KEY = "orion-record";
const GUEST_RECORD_KEY = "orion-guest-record";

const Gain = z.object({ previous: z.number().finite(), current: z.number().finite() });
const RecordSchema = z.object({ wpm: Gain.optional(), accuracy: Gain.optional() }).refine((record) => record.wpm || record.accuracy);
const Answer = z.discriminatedUnion("kind", [z.object({ kind: z.literal("account"), record: RecordSchema.nullable() }), z.object({ kind: z.literal("guest") })]);

const parseRecord = (value: unknown): PersonalRecord | null => {
  const parsed = RecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};
const store = (key: string, value: unknown) => {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ }
};
const load = (key: string): unknown => {
  try { return JSON.parse(sessionStorage.getItem(key) ?? "null"); } catch { return null; }
};

/** Un nouvel envoi efface le record de la course d'avant. */
export function forgetRecord() {
  try { sessionStorage.removeItem(RECORD_KEY); } catch { /* stockage indisponible */ }
}

/** La réponse acceptée de POST /api/races : un compte reçoit `record` (null si rien de battu), un invité rien. */
export function rememberRaceAnswer(body: unknown) {
  if (body && typeof body === "object" && "record" in body) store(RECORD_KEY, { kind: "account", record: parseRecord(body.record) });
  else store(RECORD_KEY, { kind: "guest" });
}

/** Le record d'un invité face aux courses d'avant de sa session (calculé par rememberGuestRace). */
export function rememberGuestRecord(record: PersonalRecord | null) {
  store(GUEST_RECORD_KEY, record);
}

/** Le record de la dernière course envoyée, ou null (rien de battu, envoi refusé ou sans réponse). */
export function readRecord(): PersonalRecord | null {
  const answer = Answer.safeParse(load(RECORD_KEY));
  if (!answer.success) return null;
  return answer.data.kind === "account" ? answer.data.record : parseRecord(load(GUEST_RECORD_KEY));
}

const same = (a: number, b: number) => Math.abs(a - b) < 0.05;

/**
 * Le record à montrer sur le podium : seulement pour la course jouée dans l'onglet (pas une course de l'historique),
 * à mon résultat, hors abandon, et s'il correspond à mon résultat (un reste d'une autre course n'est pas montré).
 */
export function podiumRecord(record: PersonalRecord | null, players: PlayerResult[], raceId: number | null): PersonalRecord | null {
  const me = players.find((player) => player.me);
  if (!record || raceId !== null || !me || me.abandoned) return null;
  if (record.wpm && !same(record.wpm.current, me.wpm)) return null;
  if (record.accuracy && !same(record.accuracy.current, me.accuracy)) return null;
  return record;
}
