// Room model. Le salon vit sur le serveur (src/server/rooms.ts) : cette page n'en garde qu'une copie, sans stockage local.
import { cleanRoomCode, isRoomCode, joinByCodeHref, type Visibility } from "../../rooms/access";
import { MAX_GUESTS, MIN_GUESTS, MAX_TEXT_LENGTH, type Role, type RoomSettings } from "../../rooms/settings";
import type { MemberView, RoomView } from "../../server/rooms";
import { BOT_NAMES } from "../../players/bots";
import { seatColor } from "../../rooms/seats";
import { launchBlocker } from "../../rooms/launch";

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

/** CONF-01 : les temps maximaux proposés d'un clic ; null = aucun. « Autre » ouvre un champ de 30 à 600 s. */
export const DURATION_PRESETS: readonly (number | null)[] = [null, 60, 120, 180];
export type DurationChoice = number | "none" | "other";

/** Le bouton coché : « autre » pendant la saisie d'une valeur, ou pour une valeur hors des préréglages. */
export function durationChoice(duration: number | null, typing: boolean): DurationChoice {
  if (typing) return "other";
  if (duration === null) return "none";
  return DURATION_PRESETS.includes(duration) ? duration : "other";
}

/** image (COURSE-05) : la photo du compte, telle que l'envoie le serveur ; absente pour un invité ou un bot. */
export type Player = { name: string; color: string; host?: boolean; me?: boolean; bot?: boolean; image?: string };
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
export type CompositionOption = { name: "punctuation" | "numbers" | "specials" | "capitals" | "accents"; locked: boolean; inactive: boolean };
/**
 * CONF-06 : les options de composition proposées dans le salon. `locked` : l'hôte ne peut pas la changer pour ce type de
 * texte ; `inactive` : affichée grisée, sans effet. Les accents ne concernent que le français : absents d'un salon anglais.
 * La ponctuation et les chiffres ne s'ajoutent qu'aux mots aléatoires : un passage cohérent ou une citation garde les
 * siens tels qu'ils sont écrits (« l'année 1866 »), donc ces deux options y sont grisées et verrouillées.
 */
export function compositionOptions(room: Pick<Room, "textType" | "language" | "punctuation">): CompositionOption[] {
  const custom = room.textType === "custom";
  const random = room.textType === "words";
  const options: CompositionOption[] = [
    { name: "punctuation", locked: !random, inactive: !random && !custom },
    { name: "numbers", locked: !random, inactive: !random && !custom },
    { name: "specials", locked: custom, inactive: false },
    { name: "capitals", locked: custom, inactive: random && !room.punctuation },
  ];
  if (room.language === "fr") options.push({ name: "accents", locked: custom, inactive: false });
  return options;
}
/** CONF-06 : ce qu'un membre qui n'est pas l'hôte voit, en lecture seule : les options cochées qui ont un effet. */
export function guestComposition(room: Pick<Room, "textType" | "language" | CompositionOption["name"]>): CompositionOption["name"][] {
  return compositionOptions(room).filter(({ name, inactive }) => room[name] && !inactive).map(({ name }) => name);
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
    .map((m) => ({ name: m.name, color: m.color ?? seatColor(m.seat!), host: m.host || undefined, me: m.key === you || undefined, ...(m.image ? { image: m.image } : {}) }));
  let bot = 0;
  while (seats.length < room.guests) {
    // SALLE-05 : un bot par nom de la liste fermée (le serveur ne reconnaît qu'elle) ; au-delà, des places libres
    const name = room.bots ? BOT_NAMES[bot++] : undefined;
    seats.push(name ? { name, color: seatColor(seats.length), bot: true } : { free: true });
  }
  return seats;
}

/**
 * COURSE-02 : pourquoi le bouton Lancer est grisé (clé de traduction), d'après la règle que le serveur applique au
 * lancement ; null : la course peut partir.
 */
export function launchHint(room: Pick<Room, "guests" | "bots">, members: Pick<MemberView, "role">[]): "room.notEnough" | "room.noHuman" | null {
  const blocker = launchBlocker(room, members);
  return blocker === "no_human" ? "room.noHuman" : blocker === "too_few" ? "room.notEnough" : null;
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
