import { type DBOrTx, db, nextOperatingDay, schema as s } from "@relay/db";
import { addDays, CUTOFF, cmpOps, colomboTime } from "@relay/domain";
import { and, desc, eq, inArray, min, sql } from "drizzle-orm";

/*
 * Time and the day being worked.
 *
 * Everything runs on real Asia/Colombo time. The working day for a depot,
 * a vehicle or an outlet is the earliest delivery day that still has open
 * orders; when nothing is open it is the day new orders go to (the next
 * operating day, closing at 16:00 the day before).
 */

export const now = () => colomboTime();

/** Bump the revision so open screens refresh, and return the time of the change. */
export async function touch(tx: DBOrTx): Promise<string> {
  await tx
    .insert(s.opsState)
    .values({ id: 1, revision: 1 })
    .onConflictDoUpdate({
      target: s.opsState.id,
      set: { revision: sql`${s.opsState.revision} + 1` },
    });
  return now();
}

export async function revision(tx: DBOrTx = db): Promise<number> {
  const [row] = await tx.select().from(s.opsState).where(eq(s.opsState.id, 1));
  return row?.revision ?? 0;
}

export const cutoffFor = (day: string) => `${addDays(day, -1)} ${CUTOFF}:00`;

/** The day an order placed now is for. */
export async function orderingDay(tx: DBOrTx = db) {
  const t = now();
  let day = await nextOperatingDay(tx, t.slice(0, 10));
  if (cmpOps(t, cutoffFor(day)) >= 0) day = await nextOperatingDay(tx, day);
  return day;
}

const OPEN = ["confirmed", "planned", "loaded"] as const;

/** Earliest delivery day with open orders at a depot (or anywhere). */
export async function workingDay(
  depot?: string,
  tx: DBOrTx = db,
): Promise<string> {
  const q = tx
    .select({ day: min(s.orders.deliveryDay) })
    .from(s.orders)
    .innerJoin(s.outlets, eq(s.outlets.id, s.orders.outletId));
  const [row] = await q.where(
    depot
      ? and(inArray(s.orders.status, [...OPEN]), eq(s.outlets.depot, depot))
      : inArray(s.orders.status, [...OPEN]),
  );
  return row?.day ?? (await orderingDay(tx));
}

/** The day the dock and the live board follow: the earliest day with unfinished trips, else the latest. */
export async function runDay(depot: string, tx: DBOrTx = db) {
  const runs = await tx
    .select({ day: s.tripRuns.day, status: s.tripRuns.status })
    .from(s.tripRuns)
    .where(eq(s.tripRuns.depot, depot));
  const open = runs
    .filter((r) => r.status !== "completed")
    .map((r) => r.day)
    .sort();
  const all = runs.map((r) => r.day).sort();
  return open[0] ?? all.at(-1) ?? (await workingDay(depot, tx));
}

/** The day a vehicle is working: its earliest unfinished trip, else its latest. */
export async function vehicleDay(
  vehicleId: string,
  depot: string,
  tx: DBOrTx = db,
) {
  const runs = await tx
    .select({ day: s.tripRuns.day, status: s.tripRuns.status })
    .from(s.tripRuns)
    .where(eq(s.tripRuns.vehicleId, vehicleId))
    .orderBy(desc(s.tripRuns.day));
  const open = runs
    .filter((r) => r.status !== "completed")
    .map((r) => r.day)
    .sort();
  if (open.length) return open[0];
  return runs[0]?.day ?? (await workingDay(depot, tx));
}

/** The delivery an outlet is waiting for: earliest open order, else the latest one. */
export async function outletDay(outletId: string, tx: DBOrTx = db) {
  const [open] = await tx
    .select({ day: min(s.orders.deliveryDay) })
    .from(s.orders)
    .where(
      and(
        eq(s.orders.outletId, outletId),
        inArray(s.orders.status, [...OPEN, "delivered"]),
      ),
    );
  if (open?.day) return open.day;
  const [last] = await tx
    .select({ day: s.orders.deliveryDay })
    .from(s.orders)
    .where(
      and(
        eq(s.orders.outletId, outletId),
        inArray(s.orders.status, ["received", "failed"]),
      ),
    )
    .orderBy(desc(s.orders.deliveryDay))
    .limit(1);
  return last?.day ?? (await orderingDay(tx));
}
