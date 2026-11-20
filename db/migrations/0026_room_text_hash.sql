-- COURSE-06 : l'empreinte des mots tirés au lancement, pour que le serveur temps réel vérifie qu'il retire le même texte.
ALTER TABLE "rooms" ADD COLUMN "text_hash" text;
