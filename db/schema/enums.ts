import { pgEnum } from "drizzle-orm/pg-core";

// Les mêmes valeurs que les réglages du salon côté front.
export const language = pgEnum("language", ["fr", "en"]);
export const visibility = pgEnum("visibility", ["private", "semi", "public"]);
export const roomStatus = pgEnum("room_status", ["waiting", "racing", "closed"]);
export const botSpeed = pgEnum("bot_speed", ["slow", "medium", "fast", "mixed"]);
export const botAccuracy = pgEnum("bot_accuracy", ["shaky", "decent", "high"]);
export const textType = pgEnum("text_type", ["coherent", "quote", "words", "custom"]);
export const textLength = pgEnum("text_length", ["very-short", "short", "medium", "long", "other"]);
export const level = pgEnum("level", ["common", "rich", "expert"]);
export const mistakeMode = pgEnum("mistake_mode", ["fix", "carry-on", "fatal"]);
