// Une couleur par place : celle du poisson et de la puce sur le billet. La place, pas le joueur, porte la couleur.
export const SEAT_COLORS = ["hsl(6, 71%, 58%)", "hsl(266, 85%, 59%)", "hsl(54, 100%, 74%)", "hsl(25, 100%, 63%)", "hsl(326, 47%, 47%)", "hsl(161, 65%, 60%)", "hsl(220, 85%, 65%)", "hsl(0, 0%, 72%)"] as const;

/** SALLE-05 : jusqu'à 30 places. Les 8 premières gardent leur couleur ; les suivantes tournent sur le cercle (angle d'or). */
export function seatColor(seat: number): string {
  return SEAT_COLORS[seat] ?? `hsl(${Math.round((seat * 137.508) % 360)}, 70%, ${seat % 2 ? 58 : 66}%)`;
}
