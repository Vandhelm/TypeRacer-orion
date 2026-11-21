// PERF-03 : lire la taille d'un couloir (clientWidth, offsetWidth…) force le navigateur à recalculer styles et mise en
// page s'il y a eu une écriture depuis. À chaque image et pour chacun des 30 couloirs, c'était l'essentiel du temps
// d'une image. La mesure est gardée jusqu'à ce qu'un ResizeObserver dise que le couloir a changé de taille.

export type Measure<T> = { get(): T | null; invalidate(): void };

/** Mesure une fois et garde le résultat ; null (pas encore en page) est remesuré au prochain appel. */
export function measureOnce<T>(measure: () => T | null): Measure<T> {
  let value: T | null = null;
  return {
    get() {
      value ??= measure();
      return value;
    },
    invalidate() {
      value = null;
    },
  };
}
