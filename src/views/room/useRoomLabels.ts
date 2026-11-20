import { useTranslation } from "react-i18next";
import { formatNumber } from "../../i18n/format";
import { countWords, type Room, type TextLength } from "./room";

export const TEXT_TYPE_KEY = { coherent: "coherent", quote: "quote", words: "scrambled", custom: "custom" } as const;
export const LENGTH_KEY: Record<Exclude<TextLength, "other">, string> = { "very-short": "veryShort", short: "short", medium: "mediumLength", long: "long" };

/** Text built from the room's settings, shared by the ticket and the settings. */
export function useRoomLabels(room: Pick<Room, "length" | "wordCount" | "text">) {
  const { t, i18n } = useTranslation();
  return {
    // CONF-01 : null = aucun temps maximal
    durationLabel: (seconds: number | null) => (seconds === null ? t("room.noTimeLimit") : seconds % 60 === 0 ? `${formatNumber(i18n.language, seconds / 60)} ${t("room.minutes")}` : `${formatNumber(i18n.language, seconds)} s`),
    lengthLabel: room.length === "other" ? `${formatNumber(i18n.language, room.wordCount)} ${t("room.wordsUnit")}` : t(`room.${LENGTH_KEY[room.length]}`),
    words: `${formatNumber(i18n.language, countWords(room.text))} ${t("room.wordsUnit")}`,
  };
}
