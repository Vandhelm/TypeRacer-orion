-- RES-02 : l'invité qui a envoyé une course (cookie signé) ; seule sa propre ligne mesure cet invité au podium.
ALTER TABLE "races" ADD COLUMN "guest" text;
