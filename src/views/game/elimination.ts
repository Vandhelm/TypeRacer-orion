// COURSE-06 : en mode fatal, la page annonce l'élimination de son coureur au temps réel, qui la date (eliminated_at) ;
// l'enregistrement de la course prend ce temps, jamais celui du navigateur. Un spectateur n'a rien à annoncer.

/** Vrai quand la page doit annoncer son élimination (sendEliminated, une fois : le client ne la renvoie pas). */
export function reportsElimination({ watching, eliminated }: { watching: boolean; eliminated: boolean }): boolean {
  return !watching && eliminated;
}
