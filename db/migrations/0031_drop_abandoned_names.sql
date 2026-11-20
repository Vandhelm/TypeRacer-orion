-- COURSE-10 : abandoned_names est remplacé par abandons (0030) ; les noms seuls ne servaient qu'au podium de la dernière course.
ALTER TABLE "rooms" DROP COLUMN "abandoned_names";
