import {
  bigint,
  boolean,
  customType,
  date,
  doublePrecision,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/*
 * Relay data model.
 *
 * Reference tables mirror the shared datasets. Operational tables hold one
 * record per handoff: the order, the plan that served or deferred it, the
 * load at the dock, the stop on the road, the receipt at the outlet, and an
 * append-only event log that every role writes to.
 *
 * Operational times (`ops` columns) are Asia/Colombo wall-clock times stored
 * without a zone, e.g. '2026-10-05 06:52:00', so they read the same whatever
 * the server's time zone. Times recorded on a driver's phone keep the
 * phone's time. `received_at` columns are when the server got the record.
 */

const opsTime = (name: string) => timestamp(name, { mode: "string" });
const realTime = (name: string) =>
  timestamp(name, { mode: "date", withTimezone: true }).defaultNow().notNull();

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const roleEnum = pgEnum("role", [
  "dispatcher",
  "loader",
  "driver",
  "store",
]);
export const brandEnum = pgEnum("brand", ["Fresh", "Style", "Tech"]);
export const tempEnum = pgEnum("temp", ["chilled", "ambient"]);
export const orderStatusEnum = pgEnum("order_status", [
  "draft",
  "confirmed",
  "planned",
  "loaded",
  "delivered",
  "received",
  "failed",
]);
export const planStatusEnum = pgEnum("plan_status", [
  "draft",
  "published",
  "superseded",
]);
export const tripStatusEnum = pgEnum("trip_status", [
  "planned",
  "loading",
  "loaded",
  "released",
  "accepted",
  "on_road",
  "completed",
]);
export const unitStatusEnum = pgEnum("unit_status", [
  "pending",
  "loaded",
  "flagged",
]);
export const stopStatusEnum = pgEnum("stop_status", [
  "pending",
  "arrived",
  "completed",
  "failed",
]);

/* ------------------------------------------------------------------ */
/* Reference data (shared datasets)                                    */
/* ------------------------------------------------------------------ */

export const depots = pgTable("depots", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
});

export const districts = pgTable("districts", {
  name: text("name").primaryKey(),
  depot: text("depot")
    .notNull()
    .references(() => depots.id),
  roadClass: text("road_class").notNull(),
  freeFlowKmh: doublePrecision("free_flow_kmh").notNull(),
  depotKm: doublePrecision("depot_km").notNull(),
  depotMin: integer("depot_min").notNull(),
  interKm: doublePrecision("inter_km").notNull(),
  interMin: integer("inter_min").notNull(),
});

export const outlets = pgTable("outlets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  brand: brandEnum("brand").notNull(),
  district: text("district")
    .notNull()
    .references(() => districts.name),
  depot: text("depot")
    .notNull()
    .references(() => depots.id),
  dockType: text("dock_type").notNull(),
  parking: text("parking").notNull(),
  mallWindow: text("mall_window"),
  windowOpen: text("window_open").notNull(),
  windowClose: text("window_close").notNull(),
});

export const vehicles = pgTable("vehicles", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  temp: text("temp").notNull(),
  weightCapKg: doublePrecision("weight_cap_kg").notNull(),
  volumeCapM3: doublePrecision("volume_cap_m3").notNull(),
  fuelType: text("fuel_type").notNull(),
  kmPerL: doublePrecision("km_per_l").notNull(),
  weeklyQuotaL: doublePrecision("weekly_quota_l").notNull(),
  depot: text("depot")
    .notNull()
    .references(() => depots.id),
});

/** Availability per operating day: in the workshop or not. */
export const vehicleDays = pgTable(
  "vehicle_days",
  {
    vehicleId: text("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    day: date("day", { mode: "string" }).notNull(),
    status: text("status").notNull().default("available"),
    note: text("note"),
  },
  (t) => [primaryKey({ columns: [t.vehicleId, t.day] })],
);

/** Litres used per vehicle and day, for the weekly fuel quota. */
export const fuelLog = pgTable(
  "fuel_log",
  {
    vehicleId: text("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    day: date("day", { mode: "string" }).notNull(),
    liters: doublePrecision("liters").notNull(),
  },
  (t) => [primaryKey({ columns: [t.vehicleId, t.day] })],
);

export const serviceAllowances = pgTable(
  "service_allowances",
  {
    brand: brandEnum("brand").notNull(),
    dockType: text("dock_type").notNull(),
    minutes: integer("minutes").notNull(),
  },
  (t) => [primaryKey({ columns: [t.brand, t.dockType] })],
);

export const calendar = pgTable("calendar", {
  day: date("day", { mode: "string" }).primaryKey(),
  dow: integer("dow").notNull(),
  isoYear: integer("iso_year").notNull(),
  isoWeek: integer("iso_week").notNull(),
  isPayday: boolean("is_payday").notNull(),
  festival: text("festival"),
  festivalRamp: doublePrecision("festival_ramp").notNull(),
  isHoliday: boolean("is_holiday").notNull(),
  monsoon: boolean("monsoon").notNull(),
  isOperating: boolean("is_operating").notNull(),
});

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: roleEnum("role").notNull(),
  passwordHash: text("password_hash").notNull(),
  title: text("title").notNull(),
  phone: text("phone"),
  depot: text("depot").references(() => depots.id),
  outletId: text("outlet_id").references(() => outlets.id),
  vehicleId: text("vehicle_id").references(() => vehicles.id),
  active: boolean("active").notNull().default(true),
  createdAt: realTime("created_at"),
});

/* ------------------------------------------------------------------ */
/* Change counter                                                      */
/* ------------------------------------------------------------------ */

/** One row. `revision` increases on every write, so open screens know when to refresh. */
export const opsState = pgTable("ops_state", {
  id: integer("id").primaryKey().default(1),
  revision: bigint("revision", { mode: "number" }).notNull().default(0),
});
