CREATE TYPE "public"."bot_accuracy" AS ENUM('shaky', 'decent', 'high');--> statement-breakpoint
CREATE TYPE "public"."bot_speed" AS ENUM('slow', 'medium', 'fast', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('fr', 'en');--> statement-breakpoint
CREATE TYPE "public"."level" AS ENUM('common', 'rich', 'expert');--> statement-breakpoint
CREATE TYPE "public"."mistake_mode" AS ENUM('fix', 'carry-on', 'fatal');--> statement-breakpoint
CREATE TYPE "public"."room_status" AS ENUM('waiting', 'racing', 'closed');--> statement-breakpoint
CREATE TYPE "public"."text_length" AS ENUM('very-short', 'short', 'medium', 'long', 'other');--> statement-breakpoint
CREATE TYPE "public"."text_type" AS ENUM('coherent', 'quote', 'words', 'custom');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('private', 'semi', 'public');--> statement-breakpoint
CREATE TABLE "accounts" (
	"player_id" integer PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "players_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"is_bot" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_texts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "saved_texts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"player_id" integer NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_texts_player_name_unique" UNIQUE("player_id","name"),
	CONSTRAINT "saved_texts_body_length" CHECK (length("saved_texts"."body") <= 5000)
);
--> statement-breakpoint
CREATE TABLE "race_results" (
	"race_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"rank" integer NOT NULL,
	"wpm" integer NOT NULL,
	"raw" integer NOT NULL,
	"accuracy" real NOT NULL,
	"seconds" real NOT NULL,
	"correct_chars" integer DEFAULT 0 NOT NULL,
	"wrong_chars" integer DEFAULT 0 NOT NULL,
	"extra_chars" integer DEFAULT 0 NOT NULL,
	"missed_chars" integer DEFAULT 0 NOT NULL,
	"consistency" integer NOT NULL,
	"idle" real NOT NULL,
	"finished" boolean NOT NULL,
	"eliminated" boolean DEFAULT false NOT NULL,
	"session_seconds" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "race_results_race_id_player_id_pk" PRIMARY KEY("race_id","player_id"),
	CONSTRAINT "race_results_race_rank_unique" UNIQUE("race_id","rank"),
	CONSTRAINT "race_results_rank_positive" CHECK ("race_results"."rank" >= 1),
	CONSTRAINT "race_results_accuracy_range" CHECK ("race_results"."accuracy" between 0 and 100),
	CONSTRAINT "race_results_consistency_range" CHECK ("race_results"."consistency" between 0 and 100),
	CONSTRAINT "race_results_idle_range" CHECK ("race_results"."idle" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "race_samples" (
	"race_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"second" integer NOT NULL,
	"wpm" integer NOT NULL,
	"raw" integer NOT NULL,
	"errors" integer NOT NULL,
	CONSTRAINT "race_samples_race_id_player_id_second_pk" PRIMARY KEY("race_id","player_id","second"),
	CONSTRAINT "race_samples_second_positive" CHECK ("race_samples"."second" >= 0)
);
--> statement-breakpoint
CREATE TABLE "races" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "races_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"room_id" integer,
	"config_id" integer NOT NULL,
	"text_id" integer,
	"content" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "race_configs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "race_configs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"language" "language" NOT NULL,
	"bot_speed" "bot_speed" NOT NULL,
	"bot_accuracy" "bot_accuracy" NOT NULL,
	"text_type" text_type NOT NULL,
	"length" text_length NOT NULL,
	"word_count" integer NOT NULL,
	"duration" integer NOT NULL,
	"level" "level" NOT NULL,
	"punctuation" boolean NOT NULL,
	"numbers" boolean NOT NULL,
	"specials" boolean NOT NULL,
	"accents" boolean NOT NULL,
	"mistakes" "mistake_mode" NOT NULL,
	"excluded" text DEFAULT '' NOT NULL,
	"custom_text" text DEFAULT '' NOT NULL,
	CONSTRAINT "race_configs_word_count_positive" CHECK ("race_configs"."word_count" > 0),
	CONSTRAINT "race_configs_duration_positive" CHECK ("race_configs"."duration" > 0),
	CONSTRAINT "race_configs_custom_text_length" CHECK (length("race_configs"."custom_text") <= 5000)
);
--> statement-breakpoint
CREATE TABLE "room_members" (
	"room_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"seat" integer NOT NULL,
	"color" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_members_room_id_player_id_pk" PRIMARY KEY("room_id","player_id"),
	CONSTRAINT "room_members_room_seat_unique" UNIQUE("room_id","seat"),
	CONSTRAINT "room_members_seat_range" CHECK ("room_members"."seat" between 0 and 7)
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rooms_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"name" text NOT NULL,
	"auto_name" boolean DEFAULT true NOT NULL,
	"visibility" "visibility" NOT NULL,
	"guests" integer NOT NULL,
	"bots" boolean NOT NULL,
	"status" "room_status" DEFAULT 'waiting' NOT NULL,
	"host_id" integer NOT NULL,
	"config_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_code_unique" UNIQUE("code"),
	CONSTRAINT "rooms_guests_range" CHECK ("rooms"."guests" between 2 and 8)
);
--> statement-breakpoint
CREATE TABLE "corpus_texts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "corpus_texts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"language" "language" NOT NULL,
	"type" text_type NOT NULL,
	"level" "level" NOT NULL,
	"body" text NOT NULL,
	"source" text,
	CONSTRAINT "corpus_texts_body_length" CHECK (length("corpus_texts"."body") <= 5000)
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_texts" ADD CONSTRAINT "saved_texts_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_results" ADD CONSTRAINT "race_results_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_results" ADD CONSTRAINT "race_results_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_samples" ADD CONSTRAINT "race_samples_result_fk" FOREIGN KEY ("race_id","player_id") REFERENCES "public"."race_results"("race_id","player_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "races" ADD CONSTRAINT "races_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "races" ADD CONSTRAINT "races_config_id_race_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."race_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "races" ADD CONSTRAINT "races_text_id_corpus_texts_id_fk" FOREIGN KEY ("text_id") REFERENCES "public"."corpus_texts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_host_id_players_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_config_id_race_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."race_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "players_name_lower_unique" ON "players" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "race_results_player" ON "race_results" USING btree ("player_id","race_id");--> statement-breakpoint
CREATE INDEX "races_room" ON "races" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "room_members_player" ON "room_members" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "rooms_lobby" ON "rooms" USING btree ("status","visibility");--> statement-breakpoint
CREATE INDEX "corpus_texts_pick" ON "corpus_texts" USING btree ("language","type","level");