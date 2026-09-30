CREATE TYPE "public"."brand" AS ENUM('Fresh', 'Style', 'Tech');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('draft', 'confirmed', 'planned', 'loaded', 'delivered', 'received', 'failed');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('draft', 'published', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('dispatcher', 'loader', 'driver', 'store');--> statement-breakpoint
CREATE TYPE "public"."stop_status" AS ENUM('pending', 'arrived', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."temp" AS ENUM('chilled', 'ambient');--> statement-breakpoint
CREATE TYPE "public"."trip_status" AS ENUM('planned', 'loading', 'loaded', 'released', 'accepted', 'on_road', 'completed');--> statement-breakpoint
CREATE TYPE "public"."unit_status" AS ENUM('pending', 'loaded', 'flagged');--> statement-breakpoint
CREATE TABLE "calendar" (
	"day" date PRIMARY KEY NOT NULL,
	"dow" integer NOT NULL,
	"iso_year" integer NOT NULL,
	"iso_week" integer NOT NULL,
	"is_payday" boolean NOT NULL,
	"festival" text,
	"festival_ramp" double precision NOT NULL,
	"is_holiday" boolean NOT NULL,
	"monsoon" boolean NOT NULL,
	"is_operating" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_records" (
	"client_id" text PRIMARY KEY NOT NULL,
	"user_id" integer,
	"kind" text NOT NULL,
	"recorded_at" timestamp NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"result" jsonb
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"plan_id" uuid,
	"order_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"detail" jsonb NOT NULL,
	"chosen" text,
	"reason" text,
	"decided_by" integer,
	"decided_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "depots" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text
);
--> statement-breakpoint
CREATE TABLE "districts" (
	"name" text PRIMARY KEY NOT NULL,
	"depot" text NOT NULL,
	"road_class" text NOT NULL,
	"free_flow_kmh" double precision NOT NULL,
	"depot_km" double precision NOT NULL,
	"depot_min" integer NOT NULL,
	"inter_km" double precision NOT NULL,
	"inter_min" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp NOT NULL,
	"kind" text NOT NULL,
	"role" "role",
	"actor_id" integer,
	"actor_name" text NOT NULL,
	"text" text NOT NULL,
	"order_id" text,
	"outlet_id" text,
	"vehicle_id" text,
	"trip_run_id" uuid,
	"source" text DEFAULT 'online' NOT NULL,
	"data" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fuel_log" (
	"vehicle_id" text NOT NULL,
	"day" date NOT NULL,
	"liters" double precision NOT NULL,
	CONSTRAINT "fuel_log_vehicle_id_day_pk" PRIMARY KEY("vehicle_id","day")
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" text NOT NULL,
	"order_id" text,
	"kind" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"raised_at" timestamp NOT NULL,
	"raised_by" integer
);
--> statement-breakpoint
CREATE TABLE "load_units" (
	"id" text NOT NULL,
	"trip_run_id" uuid NOT NULL,
	"order_id" text NOT NULL,
	"order_line_id" integer,
	"stop_seq" integer NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"cases" integer NOT NULL,
	"volume_m3" double precision NOT NULL,
	"temp" "temp" NOT NULL,
	"status" "unit_status" DEFAULT 'pending' NOT NULL,
	"loaded_at" timestamp,
	"loaded_by" integer,
	CONSTRAINT "load_units_trip_run_id_id_pk" PRIMARY KEY("trip_run_id","id")
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_run_id" uuid NOT NULL,
	"from_user" integer,
	"text" text NOT NULL,
	"sent_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audience" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"order_id" text,
	"at" timestamp NOT NULL,
	"read_at" timestamp,
	"ack_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ops_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"line_no" integer NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"unit_label" text NOT NULL,
	"cases" integer NOT NULL,
	"volume_m3" double precision NOT NULL,
	"weight_kg" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"delivery_day" date NOT NULL,
	"outlet_id" text NOT NULL,
	"brand" "brand" NOT NULL,
	"temp" "temp" NOT NULL,
	"units" integer NOT NULL,
	"weight_kg" double precision NOT NULL,
	"volume_m3" double precision NOT NULL,
	"status" "order_status" NOT NULL,
	"placed_at" timestamp,
	"placed_by" integer,
	"channel" text DEFAULT 'app' NOT NULL,
	"deferred_from" date,
	"deferred_to" date,
	"defer_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outlets" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"brand" "brand" NOT NULL,
	"district" text NOT NULL,
	"depot" text NOT NULL,
	"dock_type" text NOT NULL,
	"parking" text NOT NULL,
	"mall_window" text,
	"window_open" text NOT NULL,
	"window_close" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pins" (
	"day" date NOT NULL,
	"order_id" text NOT NULL,
	"kind" text NOT NULL,
	"vehicle_id" text,
	"reason" text,
	"decided_by" integer,
	"decided_at" timestamp NOT NULL,
	CONSTRAINT "pins_day_order_id_pk" PRIMARY KEY("day","order_id")
);
--> statement-breakpoint
CREATE TABLE "plan_assignments" (
	"plan_id" uuid NOT NULL,
	"order_id" text NOT NULL,
	"trip_id" uuid,
	"status" text NOT NULL,
	"group" text,
	"reason" text,
	"needs_decision" boolean DEFAULT false NOT NULL,
	CONSTRAINT "plan_assignments_plan_id_order_id_pk" PRIMARY KEY("plan_id","order_id")
);
--> statement-breakpoint
CREATE TABLE "plan_stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"outlet_id" text NOT NULL,
	"order_ids" jsonb NOT NULL,
	"arrive" integer NOT NULL,
	"service_start" integer NOT NULL,
	"service_end" integer NOT NULL,
	"window_open" integer NOT NULL,
	"window_close" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"vehicle_id" text NOT NULL,
	"trip_no" integer NOT NULL,
	"brand" "brand" NOT NULL,
	"district" text NOT NULL,
	"depart" integer NOT NULL,
	"last_service_end" integer NOT NULL,
	"return_at" integer NOT NULL,
	"km" double precision NOT NULL,
	"liters" double precision NOT NULL,
	"volume_m3" double precision NOT NULL,
	"weight_kg" double precision NOT NULL,
	"chilled_m3" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" date NOT NULL,
	"depot" text NOT NULL,
	"version" integer NOT NULL,
	"status" "plan_status" DEFAULT 'draft' NOT NULL,
	"policy" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" integer,
	"published_at" timestamp,
	"published_by" integer,
	"kpis" jsonb NOT NULL,
	"best_case_chilled_m3" double precision,
	"stats" jsonb NOT NULL,
	"edits" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"confirmed_at" timestamp NOT NULL,
	"confirmed_by" integer,
	"counts" jsonb NOT NULL,
	"expected" integer NOT NULL,
	"received" integer NOT NULL,
	"note" text,
	"photo_id" uuid,
	CONSTRAINT "receipts_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" text NOT NULL,
	"stop_run_id" uuid,
	"driver_count" integer NOT NULL,
	"store_count" integer NOT NULL,
	"store_note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"resolved_at" timestamp,
	"resolved_by" integer,
	"opened_at" timestamp NOT NULL,
	CONSTRAINT "reconciliations_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "service_allowances" (
	"brand" "brand" NOT NULL,
	"dock_type" text NOT NULL,
	"minutes" integer NOT NULL,
	CONSTRAINT "service_allowances_brand_dock_type_pk" PRIMARY KEY("brand","dock_type")
);
--> statement-breakpoint
CREATE TABLE "service_log" (
	"outlet_id" text NOT NULL,
	"temp" "temp" NOT NULL,
	"day" date NOT NULL,
	"outcome" text NOT NULL,
	"note" text,
	CONSTRAINT "service_log_outlet_id_temp_day_pk" PRIMARY KEY("outlet_id","temp","day")
);
--> statement-breakpoint
CREATE TABLE "shortfalls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_run_id" uuid NOT NULL,
	"unit_id" text NOT NULL,
	"order_id" text NOT NULL,
	"order_line_id" integer,
	"reason" text NOT NULL,
	"cases" integer NOT NULL,
	"note" text,
	"photo_id" uuid,
	"credit_ref" text NOT NULL,
	"recorded_at" timestamp NOT NULL,
	"recorded_by" integer
);
--> statement-breakpoint
CREATE TABLE "stop_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_run_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"outlet_id" text NOT NULL,
	"order_ids" jsonb NOT NULL,
	"eta" integer NOT NULL,
	"service_min" integer DEFAULT 15 NOT NULL,
	"window_open" integer NOT NULL,
	"window_close" integer NOT NULL,
	"status" "stop_status" DEFAULT 'pending' NOT NULL,
	"arrived_at" timestamp,
	"completed_at" timestamp,
	"problem" text,
	"receiver_name" text,
	"temp_c" double precision,
	"photo_id" uuid,
	"signature_id" uuid,
	"counts" jsonb,
	"recorded_offline" boolean DEFAULT false NOT NULL,
	"synced_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "trip_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" date NOT NULL,
	"plan_trip_id" uuid,
	"plan_version" integer NOT NULL,
	"vehicle_id" text NOT NULL,
	"trip_no" integer NOT NULL,
	"brand" "brand" NOT NULL,
	"district" text NOT NULL,
	"depot" text NOT NULL,
	"depart" integer NOT NULL,
	"return_at" integer NOT NULL,
	"status" "trip_status" DEFAULT 'planned' NOT NULL,
	"driver_id" integer,
	"dock" integer DEFAULT 1 NOT NULL,
	"handover_code" text,
	"handover_token" text,
	"seal" text,
	"reefer_temp_c" double precision,
	"loading_started_at" timestamp,
	"released_at" timestamp,
	"released_by" integer,
	"accepted_at" timestamp,
	"departed_at" timestamp,
	"completed_at" timestamp,
	"last_heard_at" timestamp,
	"last_lat" double precision,
	"last_lng" double precision,
	"change_note" text,
	"change_acked" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "role" NOT NULL,
	"password_hash" text NOT NULL,
	"title" text NOT NULL,
	"phone" text,
	"depot" text,
	"outlet_id" text,
	"vehicle_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vehicle_days" (
	"vehicle_id" text NOT NULL,
	"day" date NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"note" text,
	CONSTRAINT "vehicle_days_vehicle_id_day_pk" PRIMARY KEY("vehicle_id","day")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"temp" text NOT NULL,
	"weight_cap_kg" double precision NOT NULL,
	"volume_cap_m3" double precision NOT NULL,
	"fuel_type" text NOT NULL,
	"km_per_l" double precision NOT NULL,
	"weekly_quota_l" double precision NOT NULL,
	"depot" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_records" ADD CONSTRAINT "client_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "districts" ADD CONSTRAINT "districts_depot_depots_id_fk" FOREIGN KEY ("depot") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_log" ADD CONSTRAINT "fuel_log_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_raised_by_users_id_fk" FOREIGN KEY ("raised_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_units" ADD CONSTRAINT "load_units_trip_run_id_trip_runs_id_fk" FOREIGN KEY ("trip_run_id") REFERENCES "public"."trip_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_units" ADD CONSTRAINT "load_units_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_units" ADD CONSTRAINT "load_units_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_units" ADD CONSTRAINT "load_units_loaded_by_users_id_fk" FOREIGN KEY ("loaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_trip_run_id_trip_runs_id_fk" FOREIGN KEY ("trip_run_id") REFERENCES "public"."trip_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_from_user_users_id_fk" FOREIGN KEY ("from_user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_placed_by_users_id_fk" FOREIGN KEY ("placed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_district_districts_name_fk" FOREIGN KEY ("district") REFERENCES "public"."districts"("name") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_depot_depots_id_fk" FOREIGN KEY ("depot") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pins" ADD CONSTRAINT "pins_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pins" ADD CONSTRAINT "pins_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pins" ADD CONSTRAINT "pins_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_assignments" ADD CONSTRAINT "plan_assignments_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_assignments" ADD CONSTRAINT "plan_assignments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_assignments" ADD CONSTRAINT "plan_assignments_trip_id_plan_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."plan_trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_stops" ADD CONSTRAINT "plan_stops_trip_id_plan_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."plan_trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_stops" ADD CONSTRAINT "plan_stops_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_trips" ADD CONSTRAINT "plan_trips_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_trips" ADD CONSTRAINT "plan_trips_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_depot_depots_id_fk" FOREIGN KEY ("depot") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_stop_run_id_stop_runs_id_fk" FOREIGN KEY ("stop_run_id") REFERENCES "public"."stop_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_log" ADD CONSTRAINT "service_log_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortfalls" ADD CONSTRAINT "shortfalls_trip_run_id_trip_runs_id_fk" FOREIGN KEY ("trip_run_id") REFERENCES "public"."trip_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortfalls" ADD CONSTRAINT "shortfalls_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortfalls" ADD CONSTRAINT "shortfalls_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortfalls" ADD CONSTRAINT "shortfalls_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_runs" ADD CONSTRAINT "stop_runs_trip_run_id_trip_runs_id_fk" FOREIGN KEY ("trip_run_id") REFERENCES "public"."trip_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_runs" ADD CONSTRAINT "stop_runs_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_runs" ADD CONSTRAINT "trip_runs_plan_trip_id_plan_trips_id_fk" FOREIGN KEY ("plan_trip_id") REFERENCES "public"."plan_trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_runs" ADD CONSTRAINT "trip_runs_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_runs" ADD CONSTRAINT "trip_runs_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_runs" ADD CONSTRAINT "trip_runs_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_depot_depots_id_fk" FOREIGN KEY ("depot") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_days" ADD CONSTRAINT "vehicle_days_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_depot_depots_id_fk" FOREIGN KEY ("depot") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_order_idx" ON "events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "events_outlet_idx" ON "events" USING btree ("outlet_id");--> statement-breakpoint
CREATE INDEX "events_trip_idx" ON "events" USING btree ("trip_run_id");--> statement-breakpoint
CREATE INDEX "notifications_audience_idx" ON "notifications" USING btree ("audience");--> statement-breakpoint
CREATE INDEX "order_lines_order_idx" ON "order_lines" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_day_idx" ON "orders" USING btree ("delivery_day");--> statement-breakpoint
CREATE INDEX "orders_outlet_idx" ON "orders" USING btree ("outlet_id");--> statement-breakpoint
CREATE INDEX "plan_stops_trip_idx" ON "plan_stops" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "plan_trips_plan_idx" ON "plan_trips" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_version_idx" ON "plans" USING btree ("day","depot","version");--> statement-breakpoint
CREATE INDEX "stop_runs_trip_idx" ON "stop_runs" USING btree ("trip_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_runs_slot_idx" ON "trip_runs" USING btree ("day","vehicle_id","trip_no");--> statement-breakpoint
CREATE INDEX "trip_runs_day_idx" ON "trip_runs" USING btree ("day");