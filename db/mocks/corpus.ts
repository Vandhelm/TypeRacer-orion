// Corpus de démonstration : des citations. Les passages du mode cohérent (CONF-03) sont chargés par la migration
// 0021_public_domain_corpus, en production comme ici.
type CorpusEntry = { language: "fr" | "en"; type: "coherent" | "quote"; level: "common" | "rich" | "expert"; body: string; source?: string };

export const CORPUS: CorpusEntry[] = [
  { language: "fr", type: "quote", level: "common", body: "Je pense, donc je suis.", source: "René Descartes" },
  { language: "fr", type: "quote", level: "rich", body: "Le cœur a ses raisons que la raison ne connaît point.", source: "Blaise Pascal" },
  { language: "fr", type: "quote", level: "rich", body: "La terre est bleue comme une orange.", source: "Paul Éluard" },
  { language: "en", type: "quote", level: "common", body: "To be, or not to be, that is the question.", source: "William Shakespeare" },
  { language: "en", type: "quote", level: "rich", body: "It was the best of times, it was the worst of times.", source: "Charles Dickens" },
  { language: "en", type: "quote", level: "rich", body: "Not all those who wander are lost.", source: "J. R. R. Tolkien" },
];
