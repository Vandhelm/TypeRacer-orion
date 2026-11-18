-- AUTH-04 : avant la réduction côté serveur, user.image pouvait contenir l'avatar externe de GitHub ou Discord,
-- ou une image envoyée telle quelle. Seul le carré WebP écrit par /api/account/avatar est gardé.
UPDATE "user" SET "image" = NULL WHERE "image" IS NOT NULL AND "image" NOT LIKE 'data:image/webp;base64,%';
