-- AUTH-04 : avant la réduction côté serveur, user.image pouvait contenir l'avatar externe de GitHub ou Discord.
-- Une URL n'est jamais réduite : elle est effacée. Les images enregistrées dans la base sont réduites après
-- la migration par normalizeStoredAvatars (src/server/account.ts, lancé par db/cli.ts).
UPDATE "user" SET "image" = NULL WHERE "image" IS NOT NULL AND "image" NOT LIKE 'data:%';
