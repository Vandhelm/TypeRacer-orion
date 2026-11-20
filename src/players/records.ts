// RES-04 : un record personnel battu, partagé par le serveur (comptes) et le navigateur (invités).
// Battu = strictement au-dessus du meilleur précédent. La première course n'a rien à battre : ce n'est pas un record.
// Une course sans rien de tapé (0 MPM) ne bat rien, pas même la précision.

/** Le meilleur précédent et la valeur de cette course. */
export type RecordGain = { previous: number; current: number };
/** Les records battus par une course : son MPM, sa précision, ou les deux. */
export type PersonalRecord = { wpm?: RecordGain; accuracy?: RecordGain };
export type Measures = { wpm: number; accuracy: number };
export type Best = { wpm: number | null; accuracy: number | null };

const beats = (current: number, previous: number | null): previous is number =>
  previous !== null && Number.isFinite(current) && Number.isFinite(previous) && current > previous;

/** Les records battus par `current` face au meilleur des courses d'avant (`best`), ou null s'il n'en bat aucun. */
export function beatenRecord(current: Measures, best: Best | null): PersonalRecord | null {
  if (!best || !(current.wpm > 0)) return null;
  const record: PersonalRecord = {};
  if (beats(current.wpm, best.wpm)) record.wpm = { previous: best.wpm, current: current.wpm };
  if (beats(current.accuracy, best.accuracy)) record.accuracy = { previous: best.accuracy, current: current.accuracy };
  return record.wpm || record.accuracy ? record : null;
}
