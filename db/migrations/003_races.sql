-- L'historique survit à la fermeture du salon.
CREATE TABLE races (
  id          INTEGER PRIMARY KEY,
  room_id     INTEGER REFERENCES rooms (id) ON DELETE SET NULL,
  config_id   INTEGER NOT NULL REFERENCES race_configs (id),
  content     TEXT    NOT NULL,
  started_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE INDEX races_room ON races (room_id);

-- Le bilan d'un joueur sur une course (podium et profil).
CREATE TABLE race_results (
  race_id         INTEGER NOT NULL REFERENCES races (id) ON DELETE CASCADE,
  player_id       INTEGER NOT NULL REFERENCES players (id),
  rank            INTEGER NOT NULL CHECK (rank >= 1),
  wpm             INTEGER NOT NULL CHECK (wpm >= 0),
  raw             INTEGER NOT NULL CHECK (raw >= 0),
  accuracy        REAL    NOT NULL CHECK (accuracy BETWEEN 0 AND 100),
  seconds         REAL    NOT NULL CHECK (seconds >= 0),
  correct_chars   INTEGER NOT NULL DEFAULT 0,
  wrong_chars     INTEGER NOT NULL DEFAULT 0,
  extra_chars     INTEGER NOT NULL DEFAULT 0,
  missed_chars    INTEGER NOT NULL DEFAULT 0,
  consistency     INTEGER NOT NULL CHECK (consistency BETWEEN 0 AND 100),
  idle            REAL    NOT NULL CHECK (idle BETWEEN 0 AND 100),
  finished        INTEGER NOT NULL CHECK (finished IN (0, 1)),
  eliminated      INTEGER NOT NULL DEFAULT 0 CHECK (eliminated IN (0, 1)),
  session_seconds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (race_id, player_id),
  UNIQUE (race_id, rank)
) WITHOUT ROWID;
CREATE INDEX race_results_player ON race_results (player_id, race_id);

-- Une ligne par joueur et par seconde : le gros volume, pour le graphique seulement.
CREATE TABLE race_samples (
  race_id   INTEGER NOT NULL,
  player_id INTEGER NOT NULL,
  second    INTEGER NOT NULL CHECK (second >= 0),
  wpm       INTEGER NOT NULL,
  raw       INTEGER NOT NULL,
  errors    INTEGER NOT NULL,
  PRIMARY KEY (race_id, player_id, second),
  FOREIGN KEY (race_id, player_id) REFERENCES race_results (race_id, player_id) ON DELETE CASCADE
) WITHOUT ROWID;
