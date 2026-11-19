ALTER TABLE "room_members" DROP CONSTRAINT "room_members_seat_range";--> statement-breakpoint
ALTER TABLE "rooms" DROP CONSTRAINT "rooms_guests_range";--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_seat_range" CHECK ("room_members"."seat" between 0 and 29);--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_guests_range" CHECK ("rooms"."guests" between 2 and 30);