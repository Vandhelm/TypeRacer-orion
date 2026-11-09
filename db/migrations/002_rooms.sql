-- Réglages d'une course, immuables : modifier un salon crée une nouvelle ligne,
-- pour que chaque course garde ceux avec lesquels elle a été jouée.
CREATE TABLE race_configs (
  id           INTEGER PRIMARY KEY,
  language     TEXT    NOT NULL CHECK (language IN ('fr', 'en')),
  bot_speed    TEXT    NOT NULL CHECK (bot_speed IN ('slow', 'medium', 'fast', 'mixed')),
  bot_accuracy TEXT    NOT NULL CHECK (bot_accuracy IN ('shaky', 'decent', 'high')),
  text_type    TEXT    NOT NULL CHECK (text_type IN ('coherent', 'quote', 'words', 'custom')),
  length       TEXT    NOT NULL CHECK (length IN ('very-short', 'short', 'medium', 'long', 'other')),
  word_count   INTEGER NOT NULL CHECK (word_count > 0),
  duration     INTEGER NOT NULL CHECK (duration > 0),
  level        TEXT    NOT NULL CHECK (level IN ('common', 'rich', 'expert')),
  punctuation  INTEGER NOT NULL CHECK (punctuation IN (0, 1)),
  numbers      INTEGER NOT NULL CHECK (numbers IN (0, 1)),
  specials     INTEGER NOT NULL CHECK (specials IN (0, 1)),
  accents      INTEGER NOT NULL CHECK (accents IN (0, 1)),
  mistakes     TEXT    NOT NULL CHECK (mistakes IN ('fix', 'carry-on', 'fatal')),
  excluded     TEXT    NOT NULL DEFAULT '',
  custom_text  TEXT    NOT NULL DEFAULT '' CHECK (length(custom_text) <= 5000)
);

CREATE TABLE rooms (
  id         INTEGER PRIMARY KEY,
  code       TEXT    NOT NULL UNIQUE,
  name       TEXT    NOT NULL,
  auto_name  INTEGER NOT NULL DEFAULT 1 CHECK (auto_name IN (0, 1)),
  visibility TEXT    NOT NULL CHECK (visibility IN ('private', 'semi', 'public')),
  guests     INTEGER NOT NULL CHECK (guests BETWEEN 2 AND 8),
  bots       INTEGER NOT NULL CHECK (bots IN (0, 1)),
  status     TEXT    NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'racing', 'closed')),
  host_id    INTEGER NOT NULL REFERENCES players (id),
  config_id  INTEGER NOT NULL REFERENCES race_configs (id),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX rooms_lobby ON rooms (status, visibility);

-- Qui occupe quelle place. La couleur dépend de la place, pas du joueur.
CREATE TABLE room_members (
  room_id   INTEGER NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  seat      INTEGER NOT NULL CHECK (seat BETWEEN 0 AND 7),
  color     TEXT    NOT NULL,
  joined_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (room_id, player_id),
  UNIQUE (room_id, seat)
) WITHOUT ROWID;
CREATE INDEX room_members_player ON room_members (player_id);
