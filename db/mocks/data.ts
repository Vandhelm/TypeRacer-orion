// Données de démonstration, pour le développement et les tests. Toujours identiques d'un lancement à l'autre.
import type { raceConfigs } from "../schema";
import { CORPUS } from "./corpus";

export const DEMO_PASSWORD = "orion";

const SEAT_COLORS = ["hsl(6, 71%, 58%)", "hsl(266, 85%, 59%)", "hsl(54, 100%, 74%)", "hsl(25, 100%, 63%)", "hsl(326, 47%, 47%)", "hsl(161, 65%, 60%)", "hsl(220, 85%, 65%)", "hsl(0, 0%, 72%)"];
export const seatColor = (seat: number) => SEAT_COLORS[seat]!;

/** account: false pour un invité. wpm et accuracy : le niveau du joueur dans l'historique. */
export const PLAYERS = [
  { name: "Corail_418", account: true, bot: false, wpm: 78, accuracy: 96 },
  { name: "Maki_77", account: true, bot: false, wpm: 92, accuracy: 98 },
  { name: "Ikura_21", account: true, bot: false, wpm: 58, accuracy: 94 },
  { name: "Tamago_8", account: false, bot: false, wpm: 44, accuracy: 90 },
  { name: "Thon_Rouge", account: false, bot: true, wpm: 65, accuracy: 93 },
  { name: "Wasabi99", account: false, bot: true, wpm: 50, accuracy: 91 },
  { name: "Saba_Sensei", account: false, bot: true, wpm: 84, accuracy: 97 },
] as const;

export type PlayerName = (typeof PLAYERS)[number]["name"];

export const SAVED_TEXTS: { owner: PlayerName; name: string; body: string }[] = [
  { owner: "Corail_418", name: "Échauffement", body: "Le poisson rouge tourne dans son bocal en rêvant de la mer." },
  { owner: "Corail_418", name: "Warm-up", body: "The quick brown fish jumps over the lazy crab." },
  { owner: "Maki_77", name: "Recette", body: "Rincez le riz, laissez-le gonfler, puis roulez le tout dans une feuille de nori." },
];

export const DEFAULT_CONFIG = {
  language: "fr",
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
} satisfies typeof raceConfigs.$inferInsert;

type MockRoom = {
  code: string;
  name: string;
  visibility: "private" | "semi" | "public";
  guests: number;
  bots: boolean;
  status: "waiting" | "racing" | "closed";
  config?: Partial<typeof raceConfigs.$inferInsert>;
  /** Le premier est l'hôte ; l'indice est la place. */
  members: PlayerName[];
};

export const ROOMS: MockRoom[] = [
  { code: "CRABE7", name: "Le bassin du matin", visibility: "public", guests: 4, bots: true, status: "waiting", members: ["Corail_418", "Thon_Rouge"] },
  { code: "NAGE42", name: "Fast fingers", visibility: "public", guests: 6, bots: false, status: "waiting", config: { language: "en", length: "short" }, members: ["Maki_77", "Ikura_21", "Tamago_8"] },
  { code: "SECRET", name: "Entre amis", visibility: "private", guests: 2, bots: false, status: "waiting", config: { punctuation: true, mistakes: "fatal" }, members: ["Ikura_21"] },
  { code: "RACE88", name: "Course en cours", visibility: "semi", guests: 3, bots: true, status: "racing", members: ["Maki_77", "Wasabi99", "Saba_Sensei"] },
  { code: "SVR234", name: "Salon du soir", visibility: "public", guests: 4, bots: true, status: "closed", members: ["Corail_418", "Maki_77", "Thon_Rouge", "Wasabi99"] },
  { code: "SVR235", name: "Le grand large", visibility: "public", guests: 4, bots: true, status: "closed", members: ["Corail_418", "Ikura_21", "Tamago_8", "Saba_Sensei"] },
];

export type MockEntry = { player: PlayerName; wpm: number; accuracy: number; seconds: number; finished: boolean; eliminated: boolean };
export type MockRace = { room: string; corpusIndex: number; startedAt: Date; entries: MockEntry[] };

const HISTORY_SIZE = 16;
const CLOSED_ROOMS = ROOMS.filter((room) => room.status === "closed");
const skillOf = (name: PlayerName) => PLAYERS.find((player) => player.name === name)!;

/** Une course passée : les joueurs progressent un peu au fil des jours, et le dernier abandonne parfois. */
function pastRace(index: number): MockRace {
  const room = CLOSED_ROOMS[index % CLOSED_ROOMS.length]!;
  const corpusIndex = index % CORPUS.length;
  const words = CORPUS[corpusIndex]!.body.length / 5;
  const entries = room.members
    .map((player, seat) => {
      const skill = skillOf(player);
      const wpm = skill.wpm + Math.floor(index / 2) + (((index * 7 + seat * 5) % 13) - 6);
      return { player, wpm, accuracy: Math.min(99.5, skill.accuracy + (((index + seat) % 5) - 2) * 0.4), seconds: Math.max(3, Math.ceil((words * 60) / wpm)), finished: true, eliminated: false };
    })
    .sort((a, b) => b.wpm - a.wpm);

  if (index % 4 === 3) entries.at(-1)!.finished = false;
  if (index % 8 === 7) entries.at(-1)!.eliminated = true;
  return { room: room.code, corpusIndex, startedAt: new Date(Date.UTC(2026, 9, 15 + index, 18, index * 3)), entries };
}

export const RACES = Array.from({ length: HISTORY_SIZE }, (_, index) => pastRace(index));

/** Jeton d'invitation fixe pour la démo et les tests de bout en bout : /room?invite=demo-secret. */
export function demoInviteToken(code: string) {
  return `demo-${code.toLowerCase()}`;
}
