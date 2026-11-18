// Les changements de salon, dans ce processus. Les routes HTTP les émettent ; le temps réel (realtime.ts) les écoute
// pour pousser le nouvel état. Sans abonné (Next.js, Vercel), émettre ne fait rien : les pages relisent l'état.
type Listener = (code: string) => void;

const listeners = new Set<Listener>();

export const roomEvents = {
  emit(code: string) {
    for (const listener of listeners) listener(code);
  },
  /** S'abonne ; renvoie la fonction qui désabonne. */
  on(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
