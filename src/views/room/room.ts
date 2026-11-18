// Room model. À BRANCHER : sans serveur de jeu, le salon est gardé dans ce navigateur et les autres joueurs sont simulés.
import type { TFunction } from "i18next";
import { myName } from "../../players/nickname";
import { cleanRoomCode, newInviteToken, newRoomCode, VISIBILITIES, type Visibility } from "../../rooms/access";

const BOT_NAMES = ["Thon_Rouge", "Wasabi99", "Saba_Sensei", "Nori_Ninja", "Ebi_Fry", "Uni_Kun", "Tako_San"];
const PLAYER_NAMES = ["Maki_77", "Ikura_21", "Tamago_8", "Sake_Bomb", "Kani_404", "Hotate_3", "Toro_19"];
// Une couleur par joueur : celle de son poisson et de sa puce sur le billet
const PLAYER_COLORS = ["hsl(6, 71%, 58%)", "hsl(266, 85%, 59%)", "hsl(54, 100%, 74%)", "hsl(25, 100%, 63%)", "hsl(326, 47%, 47%)", "hsl(161, 65%, 60%)", "hsl(220, 85%, 65%)", "hsl(0, 0%, 72%)"];

export const MIN_GUESTS = 2;
export const MAX_GUESTS = 8;
export const MAX_TEXT_LENGTH = 5000;
const ROOM_KEY = "orion-room";
const TEXTS_KEY = "orion-texts";

const LANGUAGES = ["fr", "en"] as const;
const BOT_SPEEDS = ["slow", "medium", "fast", "mixed"] as const;
const BOT_ACCURACIES = ["shaky", "decent", "high"] as const;
const TEXT_TYPES = ["coherent", "quote", "words", "custom"] as const;
const TEXT_LENGTHS = ["very-short", "short", "medium", "long", "other"] as const;
const LEVELS = ["common", "rich", "expert"] as const;
const MISTAKE_MODES = ["fix", "carry-on", "fatal"] as const;

export type { Visibility };
export type TextLanguage = (typeof LANGUAGES)[number];
export type BotSpeed = (typeof BOT_SPEEDS)[number];
export type BotAccuracy = (typeof BOT_ACCURACIES)[number];
export type TextType = (typeof TEXT_TYPES)[number];
export type TextLength = (typeof TEXT_LENGTHS)[number];
export type Level = (typeof LEVELS)[number];
export type MistakeMode = (typeof MISTAKE_MODES)[number];

export type Room = {
  name: string;
  autoName: boolean;
  visibility: Visibility;
  language: TextLanguage;
  guests: number;
  bots: boolean;
  code: string;
  /** Jeton du lien d'invitation. */
  invite: string;
  botSpeed: BotSpeed;
  botAccuracy: BotAccuracy;
  textType: TextType;
  length: TextLength;
  wordCount: number;
  duration: number;
  level: Level;
  punctuation: boolean;
  numbers: boolean;
  specials: boolean;
  accents: boolean;
  mistakes: MistakeMode;
  excluded: string;
  text: string;
};

export type Player = { name: string; color: string; host?: boolean; me?: boolean; bot?: boolean };
export type Seat = Player | { free: true };
export type Session = { room: Room; host: boolean; present: number };
export type SavedText = { name: string; text: string };

const RACE_DEFAULTS = {
  botSpeed: "medium",
  botAccuracy: "decent",
  textType: "coherent",
  length: "medium",
  wordCount: 50,
  duration: 120,
  level: "common",
  punctuation: false,
  numbers: false,
  specials: false,
  accents: true,
  mistakes: "fix",
  excluded: "",
  text: "",
} satisfies Partial<Room>;

function read(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* stockage indisponible */ }
}
export function forgetRoom() {
  try { localStorage.removeItem(ROOM_KEY); } catch { /* stockage indisponible */ }
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
function oneOf<T extends string>(list: readonly T[], value: unknown, fallback: T): T {
  return list.includes(value as T) ? (value as T) : fallback;
}

function newRoom(t: TFunction): Room {
  return { ...RACE_DEFAULTS, name: t("room.defaultName"), autoName: true, visibility: "private", language: "fr", guests: 4, bots: true, code: newRoomCode(), invite: newInviteToken() };
}

function storedRoom(t: TFunction): Room | null {
  try {
    const s = JSON.parse(read(ROOM_KEY) ?? "null");
    if (!s || !s.code) return null;
    return {
      name: String(s.name || t("room.defaultName")),
      autoName: !!s.autoName,
      visibility: oneOf(VISIBILITIES, s.visibility, "private"),
      language: s.language === "en" ? "en" : "fr",
      guests: clampGuests(s.guests, 4),
      bots: s.bots !== false,
      code: String(s.code),
      invite: String(s.invite || newInviteToken()),
      textType: oneOf(TEXT_TYPES, s.textType, RACE_DEFAULTS.textType),
      length: oneOf(TEXT_LENGTHS, s.length, RACE_DEFAULTS.length),
      wordCount: Number(s.wordCount) >= 1 ? Math.min(1000, Math.round(Number(s.wordCount))) : RACE_DEFAULTS.wordCount,
      duration: Number(s.duration) >= 10 ? Math.min(600, Number(s.duration)) : RACE_DEFAULTS.duration,
      level: oneOf(LEVELS, s.level, RACE_DEFAULTS.level),
      mistakes: oneOf(MISTAKE_MODES, s.mistakes, RACE_DEFAULTS.mistakes),
      punctuation: !!s.punctuation,
      numbers: !!s.numbers,
      specials: !!s.specials,
      accents: s.accents !== false,
      excluded: cleanExcluded(s.excluded),
      text: String(s.text || ""),
      botSpeed: oneOf(BOT_SPEEDS, s.botSpeed, RACE_DEFAULTS.botSpeed),
      botAccuracy: oneOf(BOT_ACCURACIES, s.botAccuracy, RACE_DEFAULTS.botAccuracy),
    };
  } catch {
    return null;
  }
}

export function saveRoom(room: Room) {
  write(ROOM_KEY, JSON.stringify(room));
}

/** Qui arrive ? ?new : l'hôte crée ; ?code ou ?table : un joueur entre ; sinon : l'hôte revient dans son salon. */
export function readSession(search: string, t: TFunction): Session {
  const query = new URLSearchParams(search);
  const stored = storedRoom(t);
  const code = cleanRoomCode(query.get("code") || "");
  // À BRANCHER : le serveur retrouvera le salon par son jeton et refusera le code pour un salon privé.
  const invite = query.get("invite");

  if (invite && !(stored && stored.invite === invite)) {
    const room: Room = { ...RACE_DEFAULTS, name: t("room.inviteRoomName"), autoName: false, visibility: "private", language: "fr", guests: 4, bots: true, code: newRoomCode(), invite };
    return { room, host: false, present: 2 };
  }

  if (code && !(stored && stored.code === code)) {
    const room: Room = { ...RACE_DEFAULTS, name: t("room.codeRoomName", { code }), autoName: false, visibility: "semi", language: "fr", guests: 4, bots: true, code, invite: newInviteToken() };
    return { room, host: false, present: 2 };
  }
  const table = query.get("table");
  if (table) {
    const guests = clampGuests(query.get("guests"), 4);
    const room: Room = {
      ...RACE_DEFAULTS,
      name: t("room.tableName", { n: parseInt(table, 10) || 1 }),
      autoName: false,
      visibility: "public",
      language: query.get("lang") === "en" ? "en" : "fr",
      guests,
      bots: query.get("bots") !== "0",
      code: newRoomCode(),
      invite: newInviteToken(),
    };
    return { room, host: false, present: Math.min(guests, Math.max(2, (parseInt(query.get("present") ?? "", 10) || 1) + 1)) };
  }
  if (query.has("new") || !stored) return { room: newRoom(t), host: true, present: 1 };
  return { room: stored, host: true, present: 1 };
}

/** La liste des places : joueurs présents, puis bots ou places libres. */
export function seatsOf(room: Pick<Room, "guests" | "bots">, host: boolean, present: number): Seat[] {
  const people: Omit<Player, "color">[] = [];
  const me = myName();
  if (host) people.push({ name: me, host: true, me: true });
  else {
    people.push({ name: PLAYER_NAMES[0]!, host: true });
    people.push({ name: me, me: true });
    for (let i = 2; i < present; i++) people.push({ name: PLAYER_NAMES[i - 1]! });
  }
  let bot = 0;
  const seats: Seat[] = people.map((p, i) => ({ ...p, color: PLAYER_COLORS[i]! }));
  while (seats.length < room.guests) {
    seats.push(room.bots ? { name: BOT_NAMES[bot++]!, color: PLAYER_COLORS[seats.length]!, bot: true } : { free: true });
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
