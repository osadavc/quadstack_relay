import { db, schema as s } from "@relay/db";
import {
  clockOf,
  clockOn,
  dayLabel,
  hhmm,
  minutesOf,
  stamp,
} from "@relay/domain";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { now } from "../clock";
import { arrivalBand } from "../planning";
import { progressOf, type RunProgress } from "../progress";

/*
 * Everything known about a set of orders, from the order to the receipt,
 * gathered once and shared by the dispatcher's drawer, the store's screens
 * and the delivery record.
 */

export type TrailTone = "done" | "warning" | "offline" | "live" | "pending";
export interface TrailStage {
  label: string;
  tone: TrailTone;
  at?: string;
  detail: string;
}

export async function orderStories(orderIds: string[]) {
  const t = now();
  const today = t.slice(0, 10);
  if (!orderIds.length) return new Map<string, OrderStory>();
  const orders = await db
    .select()
    .from(s.orders)
    .where(inArray(s.orders.id, orderIds));
  const outletIds = [...new Set(orders.map((x) => x.outletId))];
  const outlets = await db
    .select()
    .from(s.outlets)
    .where(inArray(s.outlets.id, outletIds));
  const lines = await db
    .select()
    .from(s.orderLines)
    .where(inArray(s.orderLines.orderId, orderIds));
  const users = await db
    .select({
      id: s.users.id,
      name: s.users.name,
      role: s.users.role,
    })
    .from(s.users);
  const shortfalls = await db
    .select()
    .from(s.shortfalls)
    .where(inArray(s.shortfalls.orderId, orderIds));
  const receipts = await db
    .select()
    .from(s.receipts)
    .where(inArray(s.receipts.orderId, orderIds));
  const recs = await db
    .select()
    .from(s.reconciliations)
    .where(inArray(s.reconciliations.orderId, orderIds));

  const days = [...new Set(orders.map((x) => x.deliveryDay))];
  const plans = await db
    .select()
    .from(s.plans)
    .where(and(inArray(s.plans.day, days), eq(s.plans.status, "published")));
  const assignments = plans.length
    ? await db
        .select({ a: s.planAssignments, trip: s.planTrips })
        .from(s.planAssignments)
        .leftJoin(s.planTrips, eq(s.planTrips.id, s.planAssignments.tripId))
        .where(
          and(
            inArray(
              s.planAssignments.planId,
              plans.map((p) => p.id),
            ),
            inArray(s.planAssignments.orderId, orderIds),
          ),
        )
    : [];
  const runs = await db
    .select()
    .from(s.tripRuns)
    .where(inArray(s.tripRuns.day, days));
  const stops = runs.length
    ? await db
        .select()
        .from(s.stopRuns)
        .where(
          inArray(
            s.stopRuns.tripRunId,
            runs.map((r) => r.id),
          ),
        )
    : [];
  const units = runs.length
    ? await db
        .select()
        .from(s.loadUnits)
        .where(inArray(s.loadUnits.orderId, orderIds))
    : [];

  const out = new Map<string, OrderStory>();
  for (const order of orders) {
    const outlet = outlets.find((x) => x.id === order.outletId);
    if (!outlet) continue;
    const plan =
      plans.find(
        (p) => p.day === order.deliveryDay && p.depot === outlet.depot,
      ) ?? null;
    const asg = plan
      ? assignments.find(
          (x) => x.a.planId === plan.id && x.a.orderId === order.id,
        )
      : undefined;
    const stop = stops.find((st) => st.orderIds.includes(order.id)) ?? null;
    const run = stop
      ? (runs.find((r) => r.id === stop.tripRunId) ?? null)
      : null;
    const runStops = run ? stops.filter((st) => st.tripRunId === run.id) : [];
    const runUnits = run ? units.filter((u) => u.tripRunId === run.id) : [];
    const progress = run
      ? progressOf(
          run,
          runStops,
          minutesOf(t, run.day),
          runUnits.length
            ? runUnits.filter((u) => u.status !== "pending").length /
                runUnits.length
            : 0,
        )
      : null;
    const stopProgress =
      progress?.stops.find((x) => x.seq === stop?.seq) ?? null;
    const driver = run?.driverId
      ? users.find((u) => u.id === run.driverId)
      : undefined;
    const loader = run?.releasedBy
      ? users.find((u) => u.id === run.releasedBy)
      : undefined;
    const placedBy = order.placedBy
      ? users.find((u) => u.id === order.placedBy)
      : undefined;
    out.set(order.id, {
      order,
      outlet,
      lines: lines
        .filter((l) => l.orderId === order.id)
        .sort((a, b) => a.lineNo - b.lineNo),
      plan,
      assignment: asg?.a ?? null,
      trip: asg?.trip ?? null,
      run,
      stop,
      progress,
      stopProgress,
      shortfalls: shortfalls.filter((x) => x.orderId === order.id),
      receipt: receipts.find((x) => x.orderId === order.id) ?? null,
      reconciliation: recs.find((x) => x.orderId === order.id) ?? null,
      driverName: driver?.name ?? null,
      loaderName: loader?.name ?? null,
      placedByName: placedBy?.name ?? null,
      placedByRole: placedBy?.role ?? null,
      band: stop ? arrivalBand(stop.eta) : null,
      today,
      clock: t,
    });
  }
  return out;
}

export interface OrderStory {
  order: typeof s.orders.$inferSelect;
  outlet: typeof s.outlets.$inferSelect;
  lines: (typeof s.orderLines.$inferSelect)[];
  plan: typeof s.plans.$inferSelect | null;
  assignment: typeof s.planAssignments.$inferSelect | null;
  trip: typeof s.planTrips.$inferSelect | null;
  run: typeof s.tripRuns.$inferSelect | null;
  stop: typeof s.stopRuns.$inferSelect | null;
  progress: RunProgress | null;
  stopProgress: RunProgress["stops"][number] | null;
  shortfalls: (typeof s.shortfalls.$inferSelect)[];
  receipt: typeof s.receipts.$inferSelect | null;
  reconciliation: typeof s.reconciliations.$inferSelect | null;
  driverName: string | null;
  loaderName: string | null;
  placedByName: string | null;
  placedByRole: string | null;
  band: { from: number; to: number; label: string } | null;
  today: string;
  clock: string;
}

export const shortCases = (st: OrderStory) =>
  st.shortfalls.reduce((a, x) => a + x.cases, 0);
export const loadedCases = (st: OrderStory) => st.order.units - shortCases(st);

const first = (name: string | null | undefined, fallback: string) =>
  name ? name.split(" ")[0] : fallback;

/** The five handoffs for one order, as anyone sees them. */
export function trailOf(
  st: OrderStory,
  viewer: "dispatcher" | "store",
): TrailStage[] {
  const { order, today } = st;
  const you = viewer === "store";
  const stages: TrailStage[] = [];
  const driver = first(
    st.driverName,
    st.run ? `${st.run.vehicleId} driver` : "the driver",
  );

  stages.push(
    order.placedAt
      ? {
          label: "Ordered",
          tone: "done",
          at: stamp(order.placedAt, today),
          detail:
            order.channel === "phone"
              ? `Phoned in · entered by ${first(st.placedByName, "dispatch")}`
              : you
                ? "You · in the app"
                : `${st.placedByName ?? "Store manager"} · in the app`,
        }
      : { label: "Ordered", tone: "pending", detail: "Not placed yet" },
  );

  if (order.deferredFrom) {
    stages.push({
      label: "Moved",
      tone: "warning",
      detail: `From ${dayLabel(order.deferredFrom)}${order.deferReason ? ` · ${order.deferReason}` : ""}`,
    });
  }

  stages.push(
    st.plan?.publishedAt && st.trip
      ? {
          label: "Planned",
          tone: "done",
          at: stamp(st.plan.publishedAt, today),
          detail: `${st.trip.vehicleId} T${st.trip.tripNo} · plan v${st.plan.version}`,
        }
      : {
          label: "Planned",
          tone: "pending",
          detail: you ? "" : "Waiting for the plan",
        },
  );

  const short = shortCases(st);
  const released = st.run?.releasedAt ?? null;
  if (released || st.progress?.releasedAt != null) {
    const at = released ?? clockOf(st.progress?.releasedAt ?? 0);
    stages.push({
      label: "Loaded",
      tone: short ? "warning" : "done",
      at: released ? stamp(released, today) : at,
      detail: short
        ? `${loadedCases(st)} of ${order.units} · ${short} damaged at dock, credited`
        : `${order.units} of ${order.units}${st.run?.seal ? ` · seal ${st.run.seal}` : ""}`,
    });
  } else if (short) {
    stages.push({
      label: "Loaded",
      tone: "warning",
      detail: `${short} flagged at the dock, credited`,
    });
  } else {
    stages.push({
      label: "Loaded",
      tone: "pending",
      detail: st.run ? `Loads before ${clockOf(st.run.depart)}` : "",
    });
  }

  const sp = st.stopProgress;
  const p = st.progress;
  if (st.stop?.status === "completed" || sp?.state === "done") {
    const at = st.stop?.completedAt
      ? hhmm(st.stop.completedAt)
      : clockOn(st.run?.day ?? today, sp?.completedAt ?? 0);
    stages.push({
      label: "Delivered",
      tone: "done",
      at,
      detail: `${driver} · signed, photo`,
    });
  } else if (st.stop?.status === "failed") {
    stages.push({
      label: "Delivered",
      tone: "warning",
      detail: `Not delivered: ${st.stop.problem}`,
    });
  } else if (p?.offline) {
    stages.push({
      label: "On the way",
      tone: "offline",
      at: p.lastHeard != null ? clockOn(p.day, p.lastHeard) : undefined,
      detail: `${driver} · no signal since ${p.lastHeard !== null ? clockOn(p.day, p.lastHeard) : "departure"}`,
    });
  } else if (p && ["on_road"].includes(p.status)) {
    stages.push({
      label: "On the way",
      tone: "live",
      at:
        sp?.arrivedAt != null
          ? clockOn(st.run?.day ?? today, sp.arrivedAt)
          : "now",
      detail:
        sp?.arrivedAt != null
          ? `${driver} · arrived ${clockOn(st.run?.day ?? today, sp.arrivedAt)}`
          : `${driver} · expected ${clockOf(sp?.expected ?? st.stop?.eta ?? 0)}`,
    });
  } else {
    stages.push({
      label: "Delivered",
      tone: "pending",
      detail: st.run
        ? `Leaves ${clockOf(st.run.depart)}${st.driverName ? ` with ${driver}` : ""}`
        : "",
    });
  }

  stages.push(
    st.receipt
      ? {
          label: "Received",
          tone:
            st.receipt.received === st.receipt.expected ? "done" : "warning",
          at: stamp(st.receipt.confirmedAt, today),
          detail: `${you ? "You" : "Store"} · ${st.receipt.received} of ${st.receipt.expected}`,
        }
      : {
          label: "Received",
          tone: "pending",
          detail: you ? "" : "Not counted yet",
        },
  );
  return stages;
}

export async function eventsFor(filter: {
  orderIds?: string[];
  outletId?: string;
  tripRunIds?: string[];
}) {
  const conds = [];
  if (filter.orderIds?.length)
    conds.push(inArray(s.events.orderId, filter.orderIds));
  if (filter.tripRunIds?.length)
    conds.push(inArray(s.events.tripRunId, filter.tripRunIds));
  if (filter.outletId) conds.push(eq(s.events.outletId, filter.outletId));
  if (!conds.length) return [];
  return db
    .select()
    .from(s.events)
    .where(conds.length === 1 ? conds[0] : or(...conds))
    .orderBy(desc(s.events.at), desc(s.events.id))
    .limit(200);
}
