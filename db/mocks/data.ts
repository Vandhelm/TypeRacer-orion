// Jeu de données fictif, uniquement pour le développement et les tests. Toujours identique d'un lancement à l'autre.
export const MOCK_PASSWORD = "orion";

const SEAT_COLORS = ["hsl(6, 71%, 58%)", "hsl(266, 85%, 59%)", "hsl(54, 100%, 74%)", "hsl(25, 100%, 63%)", "hsl(326, 47%, 47%)", "hsl(161, 65%, 60%)", "hsl(220, 85%, 65%)", "hsl(0, 0%, 72%)"];
export const seatColor = (seat: number) => SEAT_COLORS[seat]!;

/** account: false pour un invité. */
export const PLAYERS = [
  { name: "Corail_418", account: true, bot: false },
  { name: "Maki_77", account: true, bot: false },
  { name: "Ikura_21", account: true, bot: false },
  { name: "Tamago_8", account: false, bot: false },
  { name: "Thon_Rouge", account: false, bot: true },
  { name: "Wasabi99", account: false, bot: true },
  { name: "Saba_Sensei", account: false, bot: true },
] as const;

export type PlayerName = (typeof PLAYERS)[number]["name"];

export const SAVED_TEXTS: { owner: PlayerName; name: string; body: string }[] = [
  { owner: "Corail_418", name: "Échauffement", body: "Le poisson rouge tourne dans son bocal en rêvant de la mer." },
  { owner: "Corail_418", name: "Warm-up", body: "The quick brown fish jumps over the lazy crab." },
  { owner: "Maki_77", name: "Recette", body: "Rincez le riz, laissez-le gonfler, puis roulez le tout dans une feuille de nori." },
];

export const DEFAULT_CONFIG = {
  language: "fr",
  bot_speed: "medium",
  bot_accuracy: "decent",
  text_type: "coherent",
  length: "medium",
  word_count: 50,
  duration: 120,
  level: "common",
  punctuation: 0,
  numbers: 0,
  specials: 0,
  accents: 1,
  mistakes: "fix",
  excluded: "",
  custom_text: "",
};
export type Config = typeof DEFAULT_CONFIG;

type MockRoom = {
  code: string;
  name: string;
  visibility: "private" | "semi" | "public";
  guests: number;
  bots: boolean;
  status: "waiting" | "racing" | "closed";
  config?: Partial<Config>;
  /** Le premier est l'hôte ; l'indice est la place. */
  members: PlayerName[];
};

export const ROOMS: MockRoom[] = [
  { code: "CORAIL", name: "Le bassin du matin", visibility: "public", guests: 4, bots: true, status: "waiting", members: ["Corail_418", "Thon_Rouge"] },
  { code: "NORI42", name: "Fast fingers", visibility: "public", guests: 6, bots: false, status: "waiting", config: { language: "en", length: "short" }, members: ["Maki_77", "Ikura_21", "Tamago_8"] },
  { code: "SECRET", name: "Entre amis", visibility: "private", guests: 2, bots: false, status: "waiting", config: { punctuation: 1, mistakes: "fatal" }, members: ["Ikura_21"] },
  { code: "RACE88", name: "Course en cours", visibility: "semi", guests: 3, bots: true, status: "racing", members: ["Maki_77", "Wasabi99", "Saba_Sensei"] },
  { code: "OLD001", name: "Salon fermé", visibility: "public", guests: 4, bots: true, status: "closed", members: ["Corail_418", "Maki_77", "Thon_Rouge", "Wasabi99"] },
];

type MockEntry = { player: PlayerName; wpm: number; accuracy: number; seconds: number; finished?: boolean; eliminated?: boolean };
type MockRace = { room: string; content: string; startedAt: string; entries: MockEntry[] };

const FR_TEXT = "Le vent pousse les vagues vers la jetée pendant que les mouettes tournent au-dessus du port.";
const EN_TEXT = "A small boat drifts past the harbour while the gulls circle over the old wooden pier.";

/** Dans l'ordre d'arrivée. */
export const RACES: MockRace[] = [
  {
    room: "OLD001",
    content: FR_TEXT,
    startedAt: "2026-11-01 18:00:00",
    entries: [
      { player: "Maki_77", wpm: 92, accuracy: 98.4, seconds: 42 },
      { player: "Corail_418", wpm: 78, accuracy: 96.1, seconds: 50 },
      { player: "Thon_Rouge", wpm: 64, accuracy: 93.5, seconds: 60 },
      { player: "Wasabi99", wpm: 41, accuracy: 88, seconds: 60, finished: false },
    ],
  },
  {
    room: "OLD001",
    content: EN_TEXT,
    startedAt: "2026-11-01 18:05:00",
    entries: [
      { player: "Corail_418", wpm: 85, accuracy: 97.2, seconds: 45 },
      { player: "Thon_Rouge", wpm: 67, accuracy: 94, seconds: 57 },
      { player: "Maki_77", wpm: 30, accuracy: 71, seconds: 18, finished: false, eliminated: true },
    ],
  },
];
