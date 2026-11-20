-- CONF-03 : le passage du corpus tiré au lancement de la course, partagé par tous les membres du salon.
ALTER TABLE "rooms" ADD COLUMN "text_id" integer;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_text_id_corpus_texts_id_fk" FOREIGN KEY ("text_id") REFERENCES "public"."corpus_texts"("id") ON DELETE set null ON UPDATE no action;