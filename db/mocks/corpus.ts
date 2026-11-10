// Corpus de démonstration : textes écrits pour le projet et citations du domaine public.
type CorpusEntry = { language: "fr" | "en"; type: "coherent" | "quote"; level: "common" | "rich" | "expert"; body: string; source?: string };

export const CORPUS: CorpusEntry[] = [
  { language: "fr", type: "coherent", level: "common", body: "Le vent pousse les vagues vers la jetée pendant que les mouettes tournent au-dessus du port. Un vieux pêcheur répare son filet et regarde le ciel se couvrir doucement." },
  { language: "fr", type: "coherent", level: "common", body: "Chaque matin, la boulangerie du village ouvre avant le lever du soleil. Les enfants passent acheter un pain chaud avant de prendre le bus pour aller à l'école." },
  { language: "fr", type: "coherent", level: "rich", body: "Sous la lumière ambrée du crépuscule, les barques oscillaient paresseusement le long du quai, tandis qu'une brume ténue s'élevait des eaux encore tièdes de la lagune." },
  { language: "fr", type: "coherent", level: "expert", body: "L'hydrodynamique d'un banc de poissons résulte d'une synchronisation quasi instantanée : chaque individu ajuste sa trajectoire en percevant, grâce à sa ligne latérale, d'infimes variations de pression." },
  { language: "fr", type: "quote", level: "common", body: "Je pense, donc je suis.", source: "René Descartes" },
  { language: "fr", type: "quote", level: "rich", body: "Le cœur a ses raisons que la raison ne connaît point.", source: "Blaise Pascal" },
  { language: "fr", type: "quote", level: "rich", body: "La terre est bleue comme une orange.", source: "Paul Éluard" },
  { language: "en", type: "coherent", level: "common", body: "A small boat drifts past the harbour while the gulls circle over the old wooden pier. The fishermen are coming home, and the market will open as soon as they land." },
  { language: "en", type: "coherent", level: "common", body: "Every morning the bakery on the corner fills the street with the smell of fresh bread. People stop on their way to work and talk about the weather while they wait." },
  { language: "en", type: "coherent", level: "rich", body: "Beneath a pale and restless sky, the lighthouse kept its solitary vigil, sweeping the dark water with a beam that faltered only when the sea mist thickened around the rocks." },
  { language: "en", type: "coherent", level: "expert", body: "Schooling fish coordinate through a decentralised mechanism: each individual responds to the velocity of its nearest neighbours, and coherent collective manoeuvres emerge without any leader." },
  { language: "en", type: "quote", level: "common", body: "To be, or not to be, that is the question.", source: "William Shakespeare" },
  { language: "en", type: "quote", level: "rich", body: "It was the best of times, it was the worst of times.", source: "Charles Dickens" },
  { language: "en", type: "quote", level: "rich", body: "Not all those who wander are lost.", source: "J. R. R. Tolkien" },
];
