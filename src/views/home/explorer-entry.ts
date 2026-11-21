// JOIN-02 / JOIN-03 : le bouton SALONS de l'accueil. Un invité ouvre d'abord sa session (pseudonyme validé, cookie
// signé : AUTH-02), sans être assis nulle part, puis l'explorateur s'ouvre ; le ticket qu'il prend l'y fait entrer.
// « Faire une course », lui, choisit et assied (quick-race.ts).

/** ensurePlayer : session prête (compte, ou invité dont la session vient d'être ouverte) ; open : ouvre l'explorateur. */
export async function openExplorer(ensurePlayer: () => Promise<boolean>, open: () => void): Promise<boolean> {
  if (!(await ensurePlayer())) return false;
  open();
  return true;
}
