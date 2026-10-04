ALTER TYPE "public"."temp" ADD VALUE 'frozen';--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "input_hash" text;