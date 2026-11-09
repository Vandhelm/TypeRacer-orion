-- Identité en jeu (humains, invités, bots). Les identifiants de connexion restent à part.
CREATE TABLE players (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  is_bot     INTEGER NOT NULL DEFAULT 0 CHECK (is_bot IN (0, 1)),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Un invité ou un bot n'a pas de compte.
CREATE TABLE accounts (
  player_id     INTEGER PRIMARY KEY REFERENCES players (id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL
);

-- La bibliothèque de textes personnalisés d'un joueur.
CREATE TABLE saved_texts (
  id         INTEGER PRIMARY KEY,
  player_id  INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  body       TEXT    NOT NULL CHECK (length(body) <= 5000),
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (player_id, name)
);
