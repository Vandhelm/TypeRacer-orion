import { useTranslation } from "react-i18next";
import { countWords, type Room, type TextLength } from "./room";

export const TEXT_TYPE_KEY = { coherent: "coherent", quote: "quote", words: "scrambled", custom: "custom" } as const;
export const LENGTH_KEY: Record<Exclude<TextLength, "other">, string> = { "very-short": "veryShort", short: "short", medium: "mediumLength", long: "long" };

/** Text built from the room's settings, shared by the ticket and the settings. */
export function useRoomLabels(room: Pick<Room, "length" | "wordCount" | "text">) {
  const { t } = useTranslation();
  return {
    durationLabel: (seconds: number) => (seconds % 60 === 0 ? `${seconds / 60} ${t("room.minutes")}` : `${seconds} s`),
    lengthLabel: room.length === "other" ? `${room.wordCount} ${t("room.wordsUnit")}` : t(`room.${LENGTH_KEY[room.length]}`),
    words: `${countWords(room.text)} ${t("room.wordsUnit")}`,
  };
}
