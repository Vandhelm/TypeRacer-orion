// Salons affichés en attendant le serveur.
export type Room = { n: number; serial: string; lang: "fr" | "en"; guests: string; bots: boolean };

export const ROOMS: Room[] = [
  { n: 1, serial: "1305", lang: "fr", guests: "2 / 4", bots: true },
  { n: 2, serial: "1305", lang: "en", guests: "5 / 6", bots: false },
  { n: 3, serial: "1305", lang: "fr", guests: "1 / 2", bots: true },
  { n: 4, serial: "1305", lang: "en", guests: "3 / 8", bots: false },
];

export const WAITING_PAGE = "/room";
