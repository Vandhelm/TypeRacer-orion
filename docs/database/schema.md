# Schéma de la base de données

PostgreSQL, géré avec Drizzle. Source de vérité : [db/schema/](../../db/schema/). Ce diagramme est à mettre à jour avec chaque nouvelle migration.

```mermaid
erDiagram
  players ||--o| accounts : "se connecte avec"
  players ||--o{ saved_texts : "enregistre"
  players ||--o{ rooms : "héberge"
  players ||--o{ room_members : "occupe"
  players ||--o{ race_results : "obtient"

  race_configs ||--o{ rooms : "réglages actuels"
  rooms ||--o{ room_members : "places"
  rooms |o--o{ races : "accueille"
  race_configs ||--o{ races : "réglages joués"
  corpus_texts |o--o{ races : "texte tiré"

  races ||--o{ race_results : "classement"
  race_results ||--o{ race_samples : "mesures par seconde"

  players {
    int id PK
    text name UK "unique sans casse"
    bool is_bot
    timestamptz created_at
  }
  accounts {
    int player_id PK, FK
    text password_hash
  }
  saved_texts {
    int id PK
    int player_id FK "UK avec name"
    text name
    text body "5000 car. max"
    timestamptz created_at
  }
  corpus_texts {
    int id PK
    language language
    text_type type
    level level
    text body
    text source "auteur d'une citation"
  }
  race_configs {
    int id PK
    language language
    bot_speed bot_speed
    bot_accuracy bot_accuracy
    text_type text_type
    text_length length
    int word_count
    int duration
    level level
    bool punctuation
    bool numbers
    bool specials
    bool accents
    mistake_mode mistakes
    text excluded
    text custom_text
  }
  rooms {
    int id PK
    text code UK
    text name
    bool auto_name
    visibility visibility
    int guests "2 à 8"
    bool bots
    room_status status
    int host_id FK
    int config_id FK
    timestamptz created_at
  }
  room_members {
    int room_id PK, FK
    int player_id PK, FK
    int seat "0 à 7, UK avec room_id"
    text color
    timestamptz joined_at
  }
  races {
    int id PK
    int room_id FK "nullable"
    int config_id FK
    int text_id FK "nullable"
    text content "texte réellement joué"
    timestamptz started_at
    timestamptz finished_at
  }
  race_results {
    int race_id PK, FK
    int player_id PK, FK
    int rank "UK avec race_id"
    int wpm
    int raw
    real accuracy
    real seconds
    int correct_chars
    int wrong_chars
    int extra_chars
    int missed_chars
    int consistency
    real idle
    bool finished
    bool eliminated
    int session_seconds
  }
  race_samples {
    int race_id PK, FK
    int player_id PK, FK
    int second PK
    int wpm
    int raw
    int errors
  }
```

## Choix à connaître

- **`race_configs` est immuable.** Modifier les réglages d'un salon crée une nouvelle ligne et déplace `rooms.config_id`, pour que chaque course garde les réglages avec lesquels elle a été jouée.
- **`players` couvre humains, invités et bots.** Seuls les joueurs inscrits ont une ligne dans `accounts`.
- **La couleur appartient à la place** (`room_members.color`), pas au joueur.
- **`races.content` copie le texte joué**, pour que l'historique reste juste si le corpus change.

## Suppressions

| Quand on supprime… | Effet |
| --- | --- |
| un joueur | supprime son compte, ses textes et ses places ; refusé s'il héberge un salon ou a des résultats |
| un salon | supprime ses places ; ses courses restent, avec `room_id` à `NULL` |
| un texte du corpus | les courses gardent leur `content`, `text_id` passe à `NULL` |
| une course | supprime ses résultats et leurs mesures |
| un résultat | supprime ses mesures |
