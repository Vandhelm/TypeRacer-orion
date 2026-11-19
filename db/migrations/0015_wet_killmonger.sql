CREATE TABLE "room_bans" (
	"room_id" integer NOT NULL,
	"member_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_bans_room_id_member_key_pk" PRIMARY KEY("room_id","member_key")
);
--> statement-breakpoint
ALTER TABLE "room_bans" ADD CONSTRAINT "room_bans_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;