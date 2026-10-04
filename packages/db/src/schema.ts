import {
  bigint,
  bigserial,
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
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
export const tempEnum = pgEnum("temp", ["chilled", "ambient", "frozen"]);
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

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    deliveryDay: date("delivery_day", { mode: "string" }).notNull(),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    brand: brandEnum("brand").notNull(),
    temp: tempEnum("temp").notNull(),
    units: integer("units").notNull(),
    weightKg: doublePrecision("weight_kg").notNull(),
    volumeM3: doublePrecision("volume_m3").notNull(),
    status: orderStatusEnum("status").notNull(),
    placedAt: opsTime("placed_at"),
    placedBy: integer("placed_by").references(() => users.id),
    /** "app" (placed by the store) or "phone" (entered by dispatch). */
    channel: text("channel").notNull().default("app"),
    /** When a published plan moved this order: the day it was for, the run it moved to, and why. */
    deferredFrom: date("deferred_from", { mode: "string" }),
    deferredTo: date("deferred_to", { mode: "string" }),
    deferReason: text("defer_reason"),
    createdAt: realTime("created_at"),
  },
  (t) => [
    index("orders_day_idx").on(t.deliveryDay),
    index("orders_outlet_idx").on(t.outletId),
  ],
);

/**
 * What stores can order, kept by dispatch. Nothing is loaded by default:
 * the General Data files have no products. Weight and volume are per unit
 * and an order's totals are worked out from them.
 */
export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    brand: brandEnum("brand").notNull(),
    temp: tempEnum("temp").notNull(),
    /** What one unit is: a case, a carton, an item. */
    unit: text("unit").notNull(),
    weightKg: doublePrecision("weight_kg").notNull(),
    volumeM3: doublePrecision("volume_m3").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: realTime("created_at"),
  },
  (t) => [
    uniqueIndex("products_sku_idx").on(t.sku),
    index("products_brand_idx").on(t.brand, t.temp),
  ],
);

export const orderLines = pgTable(
  "order_lines",
  {
    id: serial("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    /** The product ordered, when the line is one; its figures are copied onto the line. */
    productId: integer("product_id").references(() => products.id),
    category: text("category").notNull(),
    name: text("name").notNull(),
    unitLabel: text("unit_label").notNull(),
    cases: integer("cases").notNull(),
    volumeM3: doublePrecision("volume_m3").notNull(),
    weightKg: doublePrecision("weight_kg").notNull(),
  },
  (t) => [index("order_lines_order_idx").on(t.orderId)],
);

/** Outcome of each past run per outlet and temperature, for the fairness guard. */
export const serviceLog = pgTable(
  "service_log",
  {
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    temp: tempEnum("temp").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    outcome: text("outcome").notNull(), // served | deferred
    note: text("note"),
  },
  (t) => [primaryKey({ columns: [t.outletId, t.temp, t.day] })],
);

/* ------------------------------------------------------------------ */
/* Plans                                                               */
/* ------------------------------------------------------------------ */

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    day: date("day", { mode: "string" }).notNull(),
    depot: text("depot")
      .notNull()
      .references(() => depots.id),
    version: integer("version").notNull(),
    status: planStatusEnum("status").notNull().default("draft"),
    policy: text("policy").notNull(),
    createdAt: opsTime("created_at").notNull(),
    createdBy: integer("created_by").references(() => users.id),
    publishedAt: opsTime("published_at"),
    publishedBy: integer("published_by").references(() => users.id),
    kpis: jsonb("kpis").notNull(),
    bestCaseChilledM3: doublePrecision("best_case_chilled_m3"),
    stats: jsonb("stats").notNull(),
    /** Hash of orders and operating constraints used to create this draft. */
    inputHash: text("input_hash"),
    /** Manual edits since the engine ran, newest last. */
    edits: jsonb("edits")
      .$type<{ at: string; text: string }[]>()
      .notNull()
      .default([]),
  },
  (t) => [uniqueIndex("plans_version_idx").on(t.day, t.depot, t.version)],
);

export const planTrips = pgTable(
  "plan_trips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    vehicleId: text("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    tripNo: integer("trip_no").notNull(),
    brand: brandEnum("brand").notNull(),
    district: text("district").notNull(),
    depart: integer("depart").notNull(),
    lastServiceEnd: integer("last_service_end").notNull(),
    returnAt: integer("return_at").notNull(),
    km: doublePrecision("km").notNull(),
    liters: doublePrecision("liters").notNull(),
    volumeM3: doublePrecision("volume_m3").notNull(),
    weightKg: doublePrecision("weight_kg").notNull(),
    chilledM3: doublePrecision("chilled_m3").notNull(),
  },
  (t) => [index("plan_trips_plan_idx").on(t.planId)],
);

export const planStops = pgTable(
  "plan_stops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => planTrips.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    orderIds: jsonb("order_ids").$type<string[]>().notNull(),
    arrive: integer("arrive").notNull(),
    serviceStart: integer("service_start").notNull(),
    serviceEnd: integer("service_end").notNull(),
    windowOpen: integer("window_open").notNull(),
    windowClose: integer("window_close").notNull(),
  },
  (t) => [index("plan_stops_trip_idx").on(t.tripId)],
);

/** One row per order per plan: served on a trip, or deferred with a reason. */
export const planAssignments = pgTable(
  "plan_assignments",
  {
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    tripId: uuid("trip_id").references(() => planTrips.id, {
      onDelete: "cascade",
    }),
    status: text("status").notNull(), // served | deferred
    group: text("group"),
    reason: text("reason"),
    needsDecision: boolean("needs_decision").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.planId, t.orderId] })],
);

/** Person decisions: fairness guard outcomes and manual moves. Re-runs keep them. */
export const pins = pgTable(
  "pins",
  {
    day: date("day", { mode: "string" }).notNull(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    kind: text("kind").notNull(), // vehicle | defer
    vehicleId: text("vehicle_id").references(() => vehicles.id),
    reason: text("reason"),
    decidedBy: integer("decided_by").references(() => users.id),
    decidedAt: opsTime("decided_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.day, t.orderId] })],
);

/** Fairness guard decisions, kept for the record after they are resolved. */
export const decisions = pgTable("decisions", {
  id: text("id").primaryKey(), // DEF-0406-07
  day: date("day", { mode: "string" }).notNull(),
  planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("pending"),
  detail: jsonb("detail").notNull(),
  chosen: text("chosen"),
  reason: text("reason"),
  decidedBy: integer("decided_by").references(() => users.id),
  decidedAt: opsTime("decided_at"),
});

/* ------------------------------------------------------------------ */
/* Execution: dock, road, outlet                                       */
/* ------------------------------------------------------------------ */

export const tripRuns = pgTable(
  "trip_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    day: date("day", { mode: "string" }).notNull(),
    planTripId: uuid("plan_trip_id").references(() => planTrips.id, {
      onDelete: "set null",
    }),
    planVersion: integer("plan_version").notNull(),
    vehicleId: text("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    tripNo: integer("trip_no").notNull(),
    brand: brandEnum("brand").notNull(),
    district: text("district").notNull(),
    depot: text("depot").notNull(),
    depart: integer("depart").notNull(),
    returnAt: integer("return_at").notNull(),
    status: tripStatusEnum("status").notNull().default("planned"),
    driverId: integer("driver_id").references(() => users.id),
    dock: integer("dock").notNull().default(1),
    handoverCode: text("handover_code"),
    handoverToken: text("handover_token"),
    seal: text("seal"),
    reeferTempC: doublePrecision("reefer_temp_c"),
    loadingStartedAt: opsTime("loading_started_at"),
    releasedAt: opsTime("released_at"),
    releasedBy: integer("released_by").references(() => users.id),
    acceptedAt: opsTime("accepted_at"),
    departedAt: opsTime("departed_at"),
    completedAt: opsTime("completed_at"),
    lastHeardAt: opsTime("last_heard_at"),
    /** Last position the driver's phone reported, if location is allowed. */
    lastLat: doublePrecision("last_lat"),
    lastLng: doublePrecision("last_lng"),
    /** What changed on this vehicle since the version the dock acknowledged. */
    changeNote: text("change_note"),
    changeAcked: boolean("change_acked").notNull().default(true),
  },
  (t) => [
    uniqueIndex("trip_runs_slot_idx").on(t.day, t.vehicleId, t.tripNo),
    index("trip_runs_day_idx").on(t.day),
  ],
);

export const stopRuns = pgTable(
  "stop_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripRunId: uuid("trip_run_id")
      .notNull()
      .references(() => tripRuns.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    orderIds: jsonb("order_ids").$type<string[]>().notNull(),
    eta: integer("eta").notNull(),
    serviceMin: integer("service_min").notNull().default(15),
    windowOpen: integer("window_open").notNull(),
    windowClose: integer("window_close").notNull(),
    status: stopStatusEnum("status").notNull().default("pending"),
    arrivedAt: opsTime("arrived_at"),
    completedAt: opsTime("completed_at"),
    problem: text("problem"),
    receiverName: text("receiver_name"),
    tempC: doublePrecision("temp_c"),
    photoId: uuid("photo_id"),
    signatureId: uuid("signature_id"),
    /** Counts handed over, per order. */
    counts: jsonb("counts").$type<Record<string, number>>(),
    recordedOffline: boolean("recorded_offline").notNull().default(false),
    syncedAt: opsTime("synced_at"),
  },
  (t) => [index("stop_runs_trip_idx").on(t.tripRunId)],
);

export const loadUnits = pgTable(
  "load_units",
  {
    id: text("id").notNull(), // CAGE-074-1
    tripRunId: uuid("trip_run_id")
      .notNull()
      .references(() => tripRuns.id, { onDelete: "cascade" }),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    orderLineId: integer("order_line_id").references(() => orderLines.id),
    stopSeq: integer("stop_seq").notNull(),
    kind: text("kind").notNull(), // cage | pallet | carton | item
    name: text("name").notNull(),
    cases: integer("cases").notNull(),
    volumeM3: doublePrecision("volume_m3").notNull(),
    temp: tempEnum("temp").notNull(),
    status: unitStatusEnum("status").notNull().default("pending"),
    loadedAt: opsTime("loaded_at"),
    loadedBy: integer("loaded_by").references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.tripRunId, t.id] })],
);

export const shortfalls = pgTable("shortfalls", {
  id: uuid("id").primaryKey().defaultRandom(),
  tripRunId: uuid("trip_run_id")
    .notNull()
    .references(() => tripRuns.id, { onDelete: "cascade" }),
  unitId: text("unit_id").notNull(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id),
  orderLineId: integer("order_line_id").references(() => orderLines.id),
  reason: text("reason").notNull(), // damaged | missing | wrong | warm
  cases: integer("cases").notNull(),
  note: text("note"),
  photoId: uuid("photo_id"),
  creditRef: text("credit_ref").notNull(),
  recordedAt: opsTime("recorded_at").notNull(),
  recordedBy: integer("recorded_by").references(() => users.id),
});

export const receipts = pgTable("receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id)
    .unique(),
  outletId: text("outlet_id")
    .notNull()
    .references(() => outlets.id),
  confirmedAt: opsTime("confirmed_at").notNull(),
  confirmedBy: integer("confirmed_by").references(() => users.id),
  /** line id → cases counted at the outlet */
  counts: jsonb("counts").$type<Record<string, number>>().notNull(),
  expected: integer("expected").notNull(),
  received: integer("received").notNull(),
  note: text("note"),
  photoId: uuid("photo_id"),
});

/** A difference between the driver's handover count and the store's count. */
export const reconciliations = pgTable("reconciliations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id)
    .unique(),
  stopRunId: uuid("stop_run_id").references(() => stopRuns.id, {
    onDelete: "cascade",
  }),
  driverCount: integer("driver_count").notNull(),
  storeCount: integer("store_count").notNull(),
  storeNote: text("store_note"),
  status: text("status").notNull().default("open"),
  resolution: text("resolution"), // after_handover | intact
  resolvedAt: opsTime("resolved_at"),
  resolvedBy: integer("resolved_by").references(() => users.id),
  openedAt: opsTime("opened_at").notNull(),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  tripRunId: uuid("trip_run_id")
    .notNull()
    .references(() => tripRuns.id, { onDelete: "cascade" }),
  fromUser: integer("from_user").references(() => users.id),
  text: text("text").notNull(),
  sentAt: opsTime("sent_at").notNull(),
});

export const issues = pgTable("issues", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: text("outlet_id")
    .notNull()
    .references(() => outlets.id),
  orderId: text("order_id").references(() => orders.id),
  kind: text("kind").notNull(),
  note: text("note"),
  status: text("status").notNull().default("open"),
  raisedAt: opsTime("raised_at").notNull(),
  raisedBy: integer("raised_by").references(() => users.id),
});

/** What each person is told. Audience is an outlet, a user or a whole role. */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    audience: text("audience").notNull(), // outlet:OUT074 | user:12 | role:dispatcher
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    orderId: text("order_id"),
    at: opsTime("at").notNull(),
    readAt: opsTime("read_at"),
    ackAt: opsTime("ack_at"),
  },
  (t) => [index("notifications_audience_idx").on(t.audience)],
);

/**
 * The shared record. Append only: every handoff and decision from every
 * role, with the story time it happened (from the device when offline) and
 * the real time the server received it.
 */
export const events = pgTable(
  "events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: opsTime("at").notNull(),
    kind: text("kind").notNull(),
    role: roleEnum("role"),
    actorId: integer("actor_id").references(() => users.id),
    actorName: text("actor_name").notNull(),
    text: text("text").notNull(),
    orderId: text("order_id"),
    outletId: text("outlet_id"),
    vehicleId: text("vehicle_id"),
    tripRunId: uuid("trip_run_id"),
    source: text("source").notNull().default("online"), // online | offline | system
    data: jsonb("data"),
    receivedAt: realTime("received_at"),
  },
  (t) => [
    index("events_order_idx").on(t.orderId),
    index("events_outlet_idx").on(t.outletId),
    index("events_trip_idx").on(t.tripRunId),
  ],
);

/** Offline records already applied, so a retry is never applied twice. */
export const clientRecords = pgTable("client_records", {
  clientId: text("client_id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  kind: text("kind").notNull(),
  recordedAt: opsTime("recorded_at").notNull(),
  receivedAt: realTime("received_at"),
  result: jsonb("result"),
});

export const media = pgTable("media", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(), // photo | signature
  mime: text("mime").notNull(),
  data: bytea("data").notNull(),
  createdAt: realTime("created_at"),
});
