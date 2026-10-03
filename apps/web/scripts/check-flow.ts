/*
 * End-to-end check through the real services and database, on real time:
 * order → plan → decisions → publish → load → shortfall → release →
 * accept → depart → offline handover → store receipt → sync → reconcile.
 *
 * It empties the database, loads the datasets and accounts, and places
 * test orders (more chilled volume than the reefers carry), so it refuses
 * to run without --reset and never with NODE_ENV=production.
 *   bun scripts/check-flow.ts --reset
 */
import { db, schema as s } from "@relay/db";
import { seedReference, wipeAll } from "@relay/db/seed";
import { and, eq } from "drizzle-orm";
import { createPhoneOrder, createUser } from "../src/server/admin";
import { now } from "../src/server/clock";
import {
  flagShortfall,
  loadAll,
  releaseVehicle,
  startLoading,
} from "../src/server/dock";
import { acceptLoad, applyRecords, driverSnapshot } from "../src/server/driver";
import { decide, publishPlan, runPlan } from "../src/server/planning";
import { createProduct } from "../src/server/products";
import {
  deferralsRecord,
  liveBoard,
  planBoard,
} from "../src/server/queries/dispatch";
import { dockQueue } from "../src/server/queries/dock";
import {
  noticeView,
  orderForm,
  recordView,
  todayView,
} from "../src/server/queries/store";
import { confirmReceipt, placeOrder } from "../src/server/store";

if (
  !process.argv.includes("--reset") ||
  process.env.NODE_ENV === "production"
) {
  console.error(
    "This empties the database. Run with --reset on a development database.",
  );
  process.exit(1);
}

const user = async (email: string) => {
  const [u] = await db.select().from(s.users).where(eq(s.users.email, email));
  if (!u) throw new Error(`no account ${email}`);
  return u;
};
const log = (step: string) => console.log(`${now().slice(11, 16)}  ${step}`);
const check = (ok: unknown, what: string) => {
  if (!ok) {
    console.error(`FAILED: ${what}`);
    process.exit(1);
  }
};

await wipeAll(db);
await seedReference(db);

const gayan = await user("gayan@waypoint.lk");
const gayashan = await user("gayashan@waypoint.lk");
const nimal = await user("nimal@waypoint.lk");
const yoshitha = await user("yoshitha@waypoint.lk");

// Test orders: OUT074's through the store's form, and a chilled order
// phoned in for every other Fresh outlet at the depot.
// OUT074 orders chilled goods by product, from a test product dispatch adds.
await createProduct(gayan, {
  sku: "CHECK-C1",
  name: "Check chilled case",
  brand: "Fresh",
  temp: "chilled",
  unit: "Case",
  weightKg: 8,
  volumeM3: 0.05,
});
const form = await orderForm(yoshitha);
const chilledSection = form.sections.find((x) => x.temp === "chilled");
const product = chilledSection?.products.find((x) => x.sku === "CHECK-C1");
check(product && chilledSection, "the store's form lists the product");
if (!product || !chilledSection) process.exit(1);
await placeOrder(yoshitha, [
  {
    temp: "chilled",
    units: 0,
    weightKg: 0,
    volumeM3: 0,
    lines: [{ productId: product.id, qty: 40 }],
  },
  { temp: "ambient", units: 20, weightKg: 150, volumeM3: 1 },
]);
const [byProduct] = await db
  .select()
  .from(s.orders)
  .where(eq(s.orders.id, chilledSection.orderId));
check(
  byProduct?.weightKg === 320 && byProduct.volumeM3 === 2,
  "an order's totals come from its products",
);
const fresh = await db
  .select()
  .from(s.outlets)
  .where(and(eq(s.outlets.depot, "Peliyagoda"), eq(s.outlets.brand, "Fresh")));
for (const o of fresh)
  if (o.id !== "OUT074")
    await createPhoneOrder(gayan, o.id, [
      { temp: "chilled", units: 120, weightKg: 900, volumeM3: 6 },
    ]);
log(`Placed test orders for ${fresh.length} outlets, ${form.dayLabel}`);

let plan = await runPlan(gayan, "Peliyagoda", "fairness");
let board = await planBoard("Peliyagoda");
const pendingOf = (b: typeof board) => ("pending" in b ? b.pending : []);
log(
  `Plan v${plan.version}: ${board.plan?.kpis.served}/${board.plan?.kpis.orders} served, ${pendingOf(board).length} decisions`,
);
while (pendingOf(board).length) {
  const d = pendingOf(board)[0];
  plan = await decide(gayan, d.id, {
    kind: "defer",
    reason: "No reefer reaches the outlet in its window",
  });
  board = await planBoard("Peliyagoda");
  log(`Deferred ${d.outletId} with a reason → v${plan.version}`);
}
const pub = await publishPlan(gayan, plan.id);
log(
  `Published v${pub.version} to ${pub.vehicles} vehicles, ${pub.told} stores told`,
);

const deferrals = await deferralsRecord("Peliyagoda");
check(deferrals.today.length > 0, "published deferrals move to the next run");
const moved = deferrals.today[0];
log(`${moved.id} moved to ${moved.nextRun}`);

const queue = await dockQueue("Peliyagoda");
check(queue.cards.length > 0, "the dock sees the published trips");
const [run] = await db
  .select()
  .from(s.tripRuns)
  .where(eq(s.tripRuns.vehicleId, "VEH007"));
check(run, "VEH007 has a trip");
await startLoading(gayashan, run.id);
const units = await db
  .select()
  .from(s.loadUnits)
  .where(eq(s.loadUnits.tripRunId, run.id));
const chilledUnit = units.find((u) => u.temp === "chilled");
if (chilledUnit)
  await flagShortfall(gayashan, run.id, {
    unitId: chilledUnit.id,
    reason: "damaged",
    cases: 1,
    note: "Crushed in the cold room",
  });
await loadAll(gayashan, run.id);
await releaseVehicle(gayashan, run.id, "4471", 3.2);
const [released] = await db
  .select()
  .from(s.tripRuns)
  .where(eq(s.tripRuns.id, run.id));
log(
  `Gayashan loaded and released VEH007 (${run.district}), code ${released.handoverCode}`,
);

await acceptLoad(nimal, released.handoverCode ?? "");
let snap = await driverSnapshot(nimal);
check(snap.run, "the driver has the run");
if (!snap.run) process.exit(1);
const stop1 = snap.run.stops[0];
const id = () => crypto.randomUUID();
await applyRecords(nimal, [
  {
    clientId: id(),
    kind: "depart",
    at: now(),
    offline: false,
    runId: snap.run.id,
    payload: {},
  },
]);
log("Nimal accepted the load and left the depot");

// The first stop's store manager, added the way dispatch adds people.
let manager = yoshitha;
if (stop1.outletId !== yoshitha.outletId) {
  await createUser(gayan, {
    name: `${stop1.outletId} manager`,
    email: `${stop1.outletId.toLowerCase()}@check.local`,
    role: "store",
    outletId: stop1.outletId,
    password: "check-flow-1",
  });
  manager = await user(`${stop1.outletId.toLowerCase()}@check.local`);
}

const pixel =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const queued = [
  {
    clientId: id(),
    kind: "arrive" as const,
    at: now(),
    offline: true,
    runId: snap.run.id,
    seq: stop1.seq,
    payload: {},
  },
  {
    clientId: id(),
    kind: "complete" as const,
    at: now(),
    offline: true,
    runId: snap.run.id,
    seq: stop1.seq,
    payload: {
      counts: Object.fromEntries(stop1.orders.map((o) => [o.id, o.loaded])),
      receiver: manager.name,
      tempC: 3.4,
      photo: pixel,
      signature: pixel,
    },
  },
];

// The store counts before the phone has synced, one short.
const today = await todayView(manager);
log(
  `Store sees: ${today.items.map((i) => `${i.orderId} ${i.status}`).join(", ")}`,
);
const chilled = today.items.find(
  (i) => i.temp === "chilled" && i.status !== "deferred",
);
if (chilled) {
  const lines = await db
    .select()
    .from(s.orderLines)
    .where(eq(s.orderLines.orderId, chilled.orderId));
  const counts = Object.fromEntries(
    lines.map((l, i) => [String(l.id), l.cases - (i === 0 ? 1 : 0)]),
  );
  try {
    await confirmReceipt(
      manager,
      chilled.orderId,
      counts,
      "One case split when shelving",
    );
    log(`${stop1.outletId} confirmed receipt with a difference`);
  } catch (e) {
    log(`Receipt before sync refused: ${(e as Error).message}`);
  }
}

const results = await applyRecords(nimal, [...queued, ...queued]);
const applied = results.filter((r) => r.ok && !r.duplicate).length;
const dupes = results.filter((r) => r.duplicate).length;
check(applied === 2 && dupes === 2, "offline records apply once");
log(`Phone synced: ${applied} applied, ${dupes} duplicates ignored`);
if (chilled) {
  const [counted] = await db
    .select()
    .from(s.orders)
    .where(eq(s.orders.id, chilled.orderId));
  check(
    counted.status === "received",
    "an order counted before the sync stays received",
  );
}

snap = await driverSnapshot(nimal);
const rec = snap.reconciliations[0];
if (rec) {
  await applyRecords(nimal, [
    {
      clientId: id(),
      kind: "reconcile",
      at: now(),
      offline: false,
      payload: { orderId: rec.orderId, resolution: "after_handover" },
    },
  ]);
  log("Nimal settled the difference");
}

const live = await liveBoard("Peliyagoda");
log(`Live VEH007: ${live.rows.find((r) => r.vehicleId === "VEH007")?.sub}`);
if (chilled) {
  const record = await recordView(manager, chilled.orderId);
  log(`Record: ${record?.stages.map((x) => `${x.label}:${x.tone}`).join(" ")}`);
}
const movedOrder = (
  await db.select().from(s.orders).where(eq(s.orders.id, moved.id))
)[0];
const outletUser = (
  await db
    .select()
    .from(s.users)
    .where(eq(s.users.outletId, movedOrder.outletId))
)[0];
if (outletUser) {
  const notice = await noticeView(outletUser, moved.id);
  log(`Notice for ${moved.id}: ${notice?.reason} → ${notice?.nextRun}`);
}
console.log("flow ok");
process.exit(0);
