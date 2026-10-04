/* Run only against an empty, disposable database after applying migrations. */
import assert from "node:assert/strict";

if (
  !process.env.CONSTRAINT_CHECK_DATABASE_URL ||
  process.env.DATABASE_URL !== process.env.CONSTRAINT_CHECK_DATABASE_URL
)
  throw new Error(
    "Set DATABASE_URL and CONSTRAINT_CHECK_DATABASE_URL to the same disposable database.",
  );

const { db, sql, schema: s, nextOperatingDay } = await import("@relay/db");
const { seedReference } = await import("@relay/db/seed");
const { and, eq } = await import("drizzle-orm");
const { orderingDay } = await import("../src/server/clock");
const { createPhoneOrder } = await import("../src/server/admin");
const { createProduct } = await import("../src/server/products");
const { runPlan, publishPlan } = await import("../src/server/planning");
const { placeOrder } = await import("../src/server/store");
const { loadSheet } = await import("../src/server/queries/dock");
const { orderForm } = await import("../src/server/queries/store");

async function blocked(work: () => Promise<unknown>, message: RegExp) {
  await assert.rejects(work, message);
}

try {
  assert.equal(
    await db.$count(s.depots),
    0,
    "Refusing to use a database that already has data.",
  );
  await seedReference(db);
  const users = await db.select().from(s.users);
  const dispatcher = users.find((u) => u.role === "dispatcher");
  const manager = users.find((u) => u.role === "store");
  assert(dispatcher && manager);

  const day = await orderingDay(db, "Peliyagoda");
  const kandyDay = await orderingDay(db, "Kandy");
  await createProduct(dispatcher, {
    sku: "CHECK-FROZEN",
    name: "Frozen check carton",
    brand: "Fresh",
    temp: "frozen",
    unit: "Carton",
    weightKg: 8,
    volumeM3: 0.05,
  });
  const form = await orderForm(manager);
  const product = form.sections.find((sec) => sec.temp === "frozen")
    ?.products[0];
  assert(product, "The store form must offer frozen products.");
  const placed = await placeOrder(manager, [
    {
      temp: "frozen",
      units: 0,
      weightKg: 0,
      volumeM3: 0,
      lines: [{ productId: product.id, qty: 10 }],
    },
  ]);
  assert.equal(placed.day, day);
  const frozenId = placed.placed[0];
  assert(frozenId.endsWith("F"));

  let draft = await runPlan(dispatcher, "Peliyagoda", "fairness");
  const next = await nextOperatingDay(db, day);
  assert.equal(await orderingDay(db, "Peliyagoda"), next);
  assert.equal(await orderingDay(db, "Kandy"), kandyDay);
  const later = await placeOrder(manager, [
    { temp: "ambient", units: 10, weightKg: 100, volumeM3: 1 },
  ]);
  assert.equal(
    later.day,
    next,
    "Store orders after closure must move to the next run.",
  );
  const phoned = await createPhoneOrder(dispatcher, "OUT001", [
    { temp: "chilled", units: 10, weightKg: 100, volumeM3: 1 },
  ]);
  assert.equal(phoned.day, next, "Phone orders must follow the same closure.");
  console.log("PASS: frozen ordering and depot-specific closure");

  await db
    .update(s.orders)
    .set({ weightKg: 81 })
    .where(eq(s.orders.id, frozenId));
  await blocked(
    () => publishPlan(dispatcher, draft.id),
    /changed since this draft/,
  );
  draft = await runPlan(dispatcher, "Peliyagoda", "fairness");
  await db
    .update(s.plans)
    .set({ inputHash: null })
    .where(eq(s.plans.id, draft.id));
  await blocked(
    () => publishPlan(dispatcher, draft.id),
    /changed since this draft/,
  );
  console.log("PASS: changed orders and legacy drafts cannot be published");

  draft = await runPlan(dispatcher, "Peliyagoda", "fairness");
  await db
    .delete(s.planAssignments)
    .where(
      and(
        eq(s.planAssignments.planId, draft.id),
        eq(s.planAssignments.orderId, frozenId),
      ),
    );
  await blocked(
    () => publishPlan(dispatcher, draft.id),
    /Every order must be served/,
  );
  console.log("PASS: incomplete allocations cannot be published");

  draft = await runPlan(dispatcher, "Peliyagoda", "fairness");
  const [trip] = await db
    .select()
    .from(s.planTrips)
    .where(eq(s.planTrips.planId, draft.id));
  assert(trip, "The frozen order must have a trip.");
  const [vehicle] = await db
    .select()
    .from(s.vehicles)
    .where(eq(s.vehicles.id, trip.vehicleId));
  assert.equal(vehicle.temp, "reefer");
  await db
    .update(s.vehicles)
    .set({ weeklyQuotaL: vehicle.weeklyQuotaL + 1 })
    .where(eq(s.vehicles.id, vehicle.id));
  await blocked(
    () => publishPlan(dispatcher, draft.id),
    /changed since this draft/,
  );
  console.log("PASS: changed fuel quotas invalidate drafts");

  draft = await runPlan(dispatcher, "Peliyagoda", "fairness");
  await publishPlan(dispatcher, draft.id);
  const [run] = await db
    .select()
    .from(s.tripRuns)
    .where(eq(s.tripRuns.day, day));
  const sheet = await loadSheet(run.id);
  assert(sheet?.sections.some((section) => section.temp === "frozen"));
  assert.equal(await orderingDay(db, "Peliyagoda"), next);
  console.log(
    "PASS: a valid rerun publishes and frozen goods appear on the load sheet",
  );
} finally {
  await sql.end();
}
