// Room model. Le salon vit sur le serveur (src/server/rooms.ts) : cette page n'en garde qu'une copie, sans stockage local.
import { cleanRoomCode, isRoomCode, joinByCodeHref, type Visibility } from "../../rooms/access";
import { MAX_GUESTS, MIN_GUESTS, MAX_TEXT_LENGTH, type Role, type RoomSettings } from "../../rooms/settings";
import type { MemberView, RoomView } from "../../server/rooms";
import { BOT_NAMES } from "../../players/bots";
import { seatColor } from "../../rooms/seats";

const TEXTS_KEY = "orion-texts";

export { MAX_GUESTS, MIN_GUESTS, MAX_TEXT_LENGTH };
export type { MemberView, Role, RoomView, Visibility };
export type TextLanguage = RoomSettings["language"];
export type BotSpeed = RoomSettings["botSpeed"];
export type BotAccuracy = RoomSettings["botAccuracy"];
export type TextType = RoomSettings["textType"];
export type TextLength = RoomSettings["length"];
export type Level = RoomSettings["level"];
export type MistakeMode = RoomSettings["mistakes"];

/** Les réglages du salon et son code. Les liens d'invitation se lisent à part (SALLE-04, hooks/useInvites). */
export type Room = RoomSettings & { code: string };

export type Player = { name: string; color: string; host?: boolean; me?: boolean; bot?: boolean };
export type Seat = Player | { free: true };
export type SavedText = { name: string; text: string };

/** Ce que l'adresse demande : créer un salon (hôte) ou en rejoindre un. Null : un invité sans salon à rejoindre. */
export type Session = { host: true } | { host: false; code?: string; invite?: string };

function read(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* stockage indisponible */ }
}

export function clampGuests(n: unknown, fallback: number) {
  const value = Number(n);
  return Number.isFinite(value) ? Math.min(MAX_GUESTS, Math.max(MIN_GUESTS, Math.round(value))) : fallback;
}
export function cleanExcluded(value: unknown) {
  return [...new Set(String(value || "").toLowerCase().replace(/\s+/g, ""))].join("").slice(0, 20);
}
export function countWords(text: string) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
/** Qui arrive ? ?code ou ?invite : on rejoint ; sinon : on crée son salon.
 * AUTH-03 : un invité n'est jamais hôte — null s'il n'a pas de salon à rejoindre (le serveur l'a déjà refusé). */
export function readSession(search: string, _t: unknown, guest: boolean): Session | null {
  const query = new URLSearchParams(search);
  const code = cleanRoomCode(query.get("code") || "");
  const invite = query.get("invite")?.trim();
  if (invite) return { host: false, invite };
  if (code) return { host: false, code };
  if (guest) return null;
  return { host: true };
}

/** Ce que la page demande au serveur en arrivant : créer son salon, y entrer, ou relire celui dont on est membre. */
export type Arrival =
  | { action: "create" }
  | { action: "join"; via: { code: string } | { invite: string } }
  | { action: "read"; code: string }
  | { action: "refused"; error: "bad_code" };

/**
 * /room crée (compte) ou rejoint (code, lien) ; /game relit seulement le salon lancé, donné par ?code, et ne crée
 * jamais de salon (SALLE-09). Null : rien à ouvrir, la page renvoie à l'accueil.
 */
export function arrivalOf(search: string, page: "room" | "game", guest: boolean): Arrival | null {
  if (page === "game") {
    const code = cleanRoomCode(new URLSearchParams(search).get("code") || "");
    return isRoomCode(code) ? { action: "read", code } : null;
  }
  // JOIN-01 : un code saisi à la main qui n'en est pas un (trop court, trop long, caractères ambigus) est refusé ici,
  // avec un message, au lieu de partir au serveur ou, pour un compte, de créer un salon
  const query = new URLSearchParams(search);
  const typed = query.get("code")?.trim();
  if (typed && !query.get("invite")?.trim() && !joinByCodeHref(typed)) return { action: "refused", error: "bad_code" };
  const session = readSession(search, undefined, guest);
  if (!session) return null;
  if (session.host) return { action: "create" };
  return { action: "join", via: session.invite ? { invite: session.invite } : { code: session.code ?? "" } };
}

/**
 * SALLE-09 : la page de course d'un salon lancé ; chaque membre y suit l'hôte. Null hors course, et pour un membre qui
 * a déjà fini (revenu du podium pendant que les autres courent) : /game lui relancerait une course.
 */
export function raceHref(status: RoomView["status"], code: string, finished = false): string | null {
  return status === "racing" && code && !finished ? `/game?code=${code}` : null;
}

/** SALLE-09 : /game ne fait courir que pendant la course ; sinon, retour à la salle. Null : la course est en cours. */
export function roomHrefOutsideRace(status: RoomView["status"], code: string): string | null {
  return status === "racing" ? null : `/room?code=${code}`;
}

/** La copie locale d'un salon reçu du serveur. */
export function roomOf(view: RoomView): Room {
  return { ...view.settings, code: view.code };
}

/** La liste des places : les participants à leur place, puis des bots ou des places libres. Les spectateurs n'en ont pas. */
export function seatsOf(room: Pick<Room, "guests" | "bots">, members: MemberView[], you: string): Seat[] {
  const seats: Seat[] = members
    .filter((m) => m.role === "player" && m.seat !== null)
    .sort((a, b) => a.seat! - b.seat!)
    .map((m) => ({ name: m.name, color: m.color ?? seatColor(m.seat!), host: m.host || undefined, me: m.key === you || undefined }));
  let bot = 0;
  while (seats.length < room.guests) {
    // SALLE-05 : un bot par nom de la liste fermée (le serveur ne reconnaît qu'elle) ; au-delà, des places libres
    const name = room.bots ? BOT_NAMES[bot++] : undefined;
    seats.push(name ? { name, color: seatColor(seats.length), bot: true } : { free: true });
  }
  return seats;
}

export function isPlayer(seat: Seat): seat is Player {
  return !("free" in seat);
}

export function readSavedTexts(): SavedText[] {
  try {
    const list = JSON.parse(read(TEXTS_KEY) ?? "null");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
export function writeSavedTexts(list: SavedText[]) {
  write(TEXTS_KEY, JSON.stringify(list));
}
