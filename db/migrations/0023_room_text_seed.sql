-- CONF-03 : la graine du texte, tirée par le serveur au lancement, pour que chaque membre tape les mêmes mots.
ALTER TABLE "rooms" ADD COLUMN "text_seed" integer;
