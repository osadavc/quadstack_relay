import { createHash } from "node:crypto";
import {
  type DBOrTx,
  db,
  nextOperatingDay as nextDay,
  schema as s,
  type Tx,
} from "@relay/db";
import {
  addDays,
  clockOf,
  dayLabel,
  dowOf,
  plural,
  requiresRefrigeration,
  toMinutes,
} from "@relay/domain";
import {
  type Assignment,
  type Decision,
  type EngineInput,
  type EngineOrder,
  moveOptions,
  type Pin,
  type PlanResult,
  type PolicyId,
  plan,
  planningInputKey,
  validatePlan,
} from "@relay/engine";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { User } from "./auth";
import { touch, workingDay } from "./clock";
import { daysSince, outletHistory } from "./history";
import { logEvent, notify } from "./record";

/*
 * Planning: from the order queue to a published plan.
 *
 * The engine runs on what is in the database right now: confirmed orders,
 * vehicles not in the workshop, fuel used this week, each outlet's skip
 * history and every decision a person has made (pins). Each run is stored
 * as a new draft version. Publishing freezes it, tells every store what
 * happens to its order, and hands the dock and the drivers their work.
 */

export class PlanError extends Error {}

const inputHash = (input: EngineInput) =>
  createHash("sha256").update(planningInputKey(input)).digest("hex");

export const POLICY_LABEL: Record<PolicyId, string> = {
  fairness: "Fairness first",
  fill: "Fill reefers first",
  routes: "Shortest routes",
};

export async function nextOperatingDay(tx: DBOrTx, day: string) {
  return nextDay(tx, day);
}

/** Everything the engine needs for one depot on one day. */
export async function engineInput(
  tx: DBOrTx,
  day: string,
  depot: string,
  policy: PolicyId,
): Promise<EngineInput> {
  const outletRows = await tx
    .select()
    .from(s.outlets)
    .where(eq(s.outlets.depot, depot));
  const outlets = new Map(outletRows.map((o) => [o.id, o]));
  const orderRows = await tx
    .select()
    .from(s.orders)
    .where(
      and(
        eq(s.orders.deliveryDay, day),
        inArray(s.orders.status, ["confirmed", "planned"]),
      ),
    );
  const depotOrders = orderRows.filter((o) => outlets.has(o.outletId));
  const history = await outletHistory(
    tx,
    [...new Set(depotOrders.map((o) => o.outletId))],
    day,
  );

  const orders: EngineOrder[] = depotOrders.map((o) => {
    const out = outlets.get(o.outletId);
    if (!out) throw new Error(`Unknown outlet ${o.outletId}`);
    const h = history.get(o.outletId);
    return {
      id: o.id,
      outletId: o.outletId,
      brand: o.brand,
      district: out.district,
      depot: out.depot,
      temp: o.temp,
      units: o.units,
      weightKg: o.weightKg,
      volumeM3: o.volumeM3,
      windowOpen: toMinutes(out.windowOpen),
      windowClose: toMinutes(out.windowClose),
      dockType: out.dockType as EngineOrder["dockType"],
      vanOnly: out.parking === "van_only",
      consecutiveSkips: h?.consecutiveSkips ?? 0,
      daysSinceServed: daysSince(h, o.temp, day),
    };
  });

  const vehicleRows = await tx
    .select({ v: s.vehicles, status: s.vehicleDays.status })
    .from(s.vehicles)
    .leftJoin(
      s.vehicleDays,
      and(
        eq(s.vehicleDays.vehicleId, s.vehicles.id),
        eq(s.vehicleDays.day, day),
      ),
    )
    .where(eq(s.vehicles.depot, depot));
  // Litres already used this week (Monday to Sunday), before the delivery day.
  const monday = addDays(day, -((dowOf(day) + 6) % 7));
  const fuel =
    monday < day
      ? await tx
          .select({
            vehicleId: s.fuelLog.vehicleId,
            liters: sql<number>`sum(${s.fuelLog.liters})`,
          })
          .from(s.fuelLog)
          .where(and(gte(s.fuelLog.day, monday), lt(s.fuelLog.day, day)))
          .groupBy(s.fuelLog.vehicleId)
      : [];
  const used = new Map(fuel.map((f) => [f.vehicleId, Number(f.liters)]));

  const vehicles = vehicleRows
    .filter((r) => (r.status ?? "available") === "available")
    .map(({ v }) => ({
      id: v.id,
      type: v.type as "truck" | "van",
      temp: v.temp as "reefer" | "ambient",
      weightCapKg: v.weightCapKg,
      volumeCapM3: v.volumeCapM3,
      kmPerL: v.kmPerL,
      weeklyQuotaL: v.weeklyQuotaL,
      fuelUsedL: used.get(v.id) ?? 0,
      depot: v.depot,
    }));

  const travel = (
    await tx.select().from(s.districts).where(eq(s.districts.depot, depot))
  ).map((d) => ({
    district: d.name,
    depot: d.depot,
    depotKm: d.depotKm,
    depotMin: d.depotMin,
    interKm: d.interKm,
    interMin: d.interMin,
  }));
  const allowance = Object.fromEntries(
    (await tx.select().from(s.serviceAllowances)).map((a) => [
      `${a.brand}|${a.dockType}`,
      a.minutes,
    ]),
  );
  const orderIds = new Set(orders.map((o) => o.id));
  const pins: Pin[] = (
    await tx.select().from(s.pins).where(eq(s.pins.day, day))
  )
    .filter((p) => orderIds.has(p.orderId))
    .map((p) =>
      p.kind === "defer"
        ? {
            orderId: p.orderId,
            kind: "defer",
            reason: p.reason ?? "Deferred by dispatch",
          }
        : {
            orderId: p.orderId,
            kind: "vehicle",
            vehicleId: p.vehicleId as string,
          },
    );

  const previous = await previousAssignment(tx, day, depot);
  return {
    date: day,
    depot,
    orders,
    vehicles,
    travel,
    allowance,
    policy,
    pins,
    previous,
  };
}

/** Where each order sits in the latest plan, so a re-run keeps it there if it can. */
async function previousAssignment(tx: DBOrTx, day: string, depot: string) {
  const [p] = await tx
    .select({ id: s.plans.id })
    .from(s.plans)
    .where(and(eq(s.plans.day, day), eq(s.plans.depot, depot)))
    .orderBy(desc(s.plans.version))
    .limit(1);
  if (!p) return undefined;
  const rows = await tx
    .select({
      orderId: s.planAssignments.orderId,
      vehicleId: s.planTrips.vehicleId,
    })
    .from(s.planAssignments)
    .innerJoin(s.planTrips, eq(s.planTrips.id, s.planAssignments.tripId))
    .where(eq(s.planAssignments.planId, p.id));
  return Object.fromEntries(rows.map((r) => [r.orderId, r.vehicleId]));
}

async function nextVersion(tx: DBOrTx, day: string, depot: string) {
  const [row] = await tx
    .select({ v: sql<number>`coalesce(max(${s.plans.version}), 0)` })
    .from(s.plans)
    .where(and(eq(s.plans.day, day), eq(s.plans.depot, depot)));
  return Number(row?.v ?? 0) + 1;
}

async function nextDecisionId(tx: DBOrTx, day: string) {
  const [row] = await tx
    .select({ n: sql<number>`count(*)` })
    .from(s.decisions)
    .where(eq(s.decisions.day, day));
  return `DEF-${day.slice(5, 7)}${day.slice(8, 10)}-${String(Number(row?.n ?? 0) + 1).padStart(2, "0")}`;
}

/** Store an engine result as a new draft, replacing any older draft. */
async function storePlan(
  tx: Tx,
  user: User,
  input: EngineInput,
  result: PlanResult,
  bestCase: number,
  at: string,
  edit?: string,
) {
  const { date: day, depot } = input;
  // Number first: versions keep counting up even as older drafts are replaced.
  const version = await nextVersion(tx, day, depot);
  const old = await tx
    .select({ id: s.plans.id, edits: s.plans.edits })
    .from(s.plans)
    .where(
      and(
        eq(s.plans.day, day),
        eq(s.plans.depot, depot),
        eq(s.plans.status, "draft"),
      ),
    );
  if (old.length) {
    await tx.delete(s.decisions).where(
      and(
        inArray(
          s.decisions.planId,
          old.map((p) => p.id),
        ),
        eq(s.decisions.status, "pending"),
      ),
    );
    await tx.delete(s.plans).where(
      inArray(
        s.plans.id,
        old.map((p) => p.id),
      ),
    );
  }
  const edits = [
    ...(old[0]?.edits ?? []),
    ...(edit ? [{ at, text: edit }] : []),
  ];
  const [p] = await tx
    .insert(s.plans)
    .values({
      day,
      depot,
      version,
      status: "draft",
      policy: input.policy,
      createdAt: at,
      createdBy: user.id,
      kpis: result.kpis,
      bestCaseChilledM3: bestCase,
      stats: result.stats,
      inputHash: inputHash(input),
      edits,
    })
    .returning({ id: s.plans.id });

  const tripIdByOrder = new Map<string, string>();
  for (const t of result.trips) {
    const [row] = await tx
      .insert(s.planTrips)
      .values({
        planId: p.id,
        vehicleId: t.vehicleId,
        tripNo: t.tripNo,
        brand: t.brand,
        district: t.district,
        depart: Math.round(t.depart),
        lastServiceEnd: Math.round(t.lastServiceEnd),
        returnAt: Math.round(t.returnAt),
        km: t.km,
        liters: t.liters,
        volumeM3: t.volumeM3,
        weightKg: t.weightKg,
        chilledM3: t.chilledM3,
      })
      .returning({ id: s.planTrips.id });
    if (t.stops.length)
      await tx.insert(s.planStops).values(
        t.stops.map((st, i) => ({
          tripId: row.id,
          seq: i + 1,
          outletId: st.outletId,
          orderIds: st.orderIds,
          arrive: Math.round(st.arrive),
          serviceStart: Math.round(st.serviceStart),
          serviceEnd: Math.round(st.serviceEnd),
          windowOpen: st.windowOpen,
          windowClose: st.windowClose,
        })),
      );
    for (const id of t.orderIds) tripIdByOrder.set(id, row.id);
  }

  const rows = [
    ...[...tripIdByOrder].map(([orderId, tripId]) => ({
      planId: p.id,
      orderId,
      tripId,
      status: "served",
    })),
    ...result.deferrals.map((d) => ({
      planId: p.id,
      orderId: d.orderId,
      tripId: null,
      status: "deferred",
      group: d.group,
      reason: d.reason,
      needsDecision: d.needsDecision,
    })),
  ];
  if (rows.length) await tx.insert(s.planAssignments).values(rows);

  for (const d of result.decisions) {
    await tx.insert(s.decisions).values({
      id: await nextDecisionId(tx, day),
      day,
      planId: p.id,
      orderId: d.orderId,
      kind: d.kind,
      status: "pending",
      detail: d satisfies Decision,
    });
  }
  return { id: p.id, version };
}

function runEngine(input: EngineInput) {
  const result = plan(input);
  // Best case: the most chilled volume any policy reaches, ignoring decisions.
  const fill = plan({
    ...input,
    policy: "fill",
    pins: [],
    previous: undefined,
    settings: { iterations: 80 },
  });
  const bestCase = Math.max(
    result.kpis.chilledPlannedM3,
    fill.kpis.chilledPlannedM3,
  );
  return { result, bestCase };
}

export async function runPlan(
  user: User,
  depot: string,
  policy: PolicyId,
  edit?: string,
) {
  return db.transaction(async (tx) => {
    const day = await workingDay(depot, tx);
    const at = await touch(tx);
    const input = await engineInput(tx, day, depot, policy);
    const { result, bestCase } = runEngine(input);
    const saved = await storePlan(tx, user, input, result, bestCase, at, edit);
    const pending = result.decisions.length;
    await logEvent(tx, {
      at,
      kind: "plan.run",
      actor: user,
      text: `Ran the planner (${POLICY_LABEL[policy]}): ${result.kpis.served} of ${result.kpis.orders} orders served, ${plural(result.kpis.deferred, "deferral")}${pending ? `, ${plural(pending, "decision")} for a person` : ""}. Draft v${saved.version}`,
      data: { planId: saved.id, depot },
    });
    return saved;
  });
}

async function draftPlan(tx: DBOrTx, planId: string) {
  const [p] = await tx.select().from(s.plans).where(eq(s.plans.id, planId));
  if (!p)
    throw new PlanError("That plan no longer exists. Open the latest draft.");
  if (p.status !== "draft")
    throw new PlanError("This plan is already published.");
  return p;
}

async function setPin(
  tx: DBOrTx,
  user: User,
  day: string,
  at: string,
  pin: {
    orderId: string;
    kind: "vehicle" | "defer";
    vehicleId?: string;
    reason?: string;
  },
) {
  await tx
    .insert(s.pins)
    .values({
      day,
      orderId: pin.orderId,
      kind: pin.kind,
      vehicleId: pin.vehicleId ?? null,
      reason: pin.reason ?? null,
      decidedBy: user.id,
      decidedAt: at,
    })
    .onConflictDoUpdate({
      target: [s.pins.day, s.pins.orderId],
      set: {
        kind: pin.kind,
        vehicleId: pin.vehicleId ?? null,
        reason: pin.reason ?? null,
        decidedBy: user.id,
        decidedAt: at,
      },
    });
}

async function outletLabel(tx: DBOrTx, orderId: string) {
  const [row] = await tx
    .select({ id: s.outlets.id, name: s.outlets.name })
    .from(s.orders)
    .innerJoin(s.outlets, eq(s.outlets.id, s.orders.outletId))
    .where(eq(s.orders.id, orderId));
  return row ? `${row.id} ${row.name}` : orderId;
}

export type DecisionChoice =
  | { kind: "swap"; index: number }
  | { kind: "redirect"; index: number }
  | { kind: "defer"; reason: string };

/** Resolve a fairness guard decision, then re-plan around it. */
export async function decide(
  user: User,
  decisionId: string,
  choice: DecisionChoice,
) {
  return db.transaction(async (tx) => {
    const at = await touch(tx);
    const [d] = await tx
      .select()
      .from(s.decisions)
      .where(eq(s.decisions.id, decisionId));
    if (!d) throw new PlanError("This decision was replaced by a newer plan.");
    if (d.status !== "pending") throw new PlanError("Already decided.");
    if (!d.planId) throw new PlanError("This decision has no plan.");
    const p = await draftPlan(tx, d.planId);
    const detail = d.detail as Decision;
    const who = await outletLabel(tx, d.orderId);
    let summary = "";

    if (choice.kind === "defer") {
      const reason = choice.reason.trim();
      if (reason.length < 4)
        throw new PlanError("Give the area manager a reason.");
      await setPin(tx, user, p.day, at, {
        orderId: d.orderId,
        kind: "defer",
        reason,
      });
      summary = `Deferred ${who} again: “${reason}”. Area manager copied`;
    } else {
      const options = detail.options.filter((o) => o.kind === choice.kind);
      const opt = options[choice.index];
      if (!opt || opt.kind === "defer" || opt.kind === "add" || !opt.feasible)
        throw new PlanError("That option can’t be applied.");
      if (opt.kind === "swap") {
        const other = await outletLabel(tx, opt.withOrderId);
        await setPin(tx, user, p.day, at, {
          orderId: d.orderId,
          kind: "vehicle",
          vehicleId: opt.vehicleId,
        });
        await setPin(tx, user, p.day, at, {
          orderId: opt.withOrderId,
          kind: "defer",
          reason: `Swapped out for ${who}, skipped last run`,
        });
        summary = `Swapped ${who} in for ${other} on ${opt.vehicleId}`;
      } else {
        for (const id of opt.serves)
          await setPin(tx, user, p.day, at, {
            orderId: id,
            kind: "vehicle",
            vehicleId: opt.vehicleId,
          });
        summary = `Sent ${opt.vehicleId} to ${detail.closest?.district ?? "the outlet’s district"} for ${who}`;
      }
    }

    await tx
      .update(s.decisions)
      .set({
        status: "resolved",
        chosen: choice.kind,
        reason: choice.kind === "defer" ? choice.reason.trim() : null,
        decidedBy: user.id,
        decidedAt: at,
        planId: null,
      })
      .where(eq(s.decisions.id, decisionId));
    await logEvent(tx, {
      at,
      kind: "plan.decision",
      actor: user,
      text: summary,
      orderId: d.orderId,
      data: { decisionId, choice },
    });

    const input = await engineInput(tx, p.day, p.depot, p.policy as PolicyId);
    const { result, bestCase } = runEngine(input);
    return storePlan(tx, user, input, result, bestCase, at, summary);
  });
}

async function assignmentOf(tx: DBOrTx, planId: string): Promise<Assignment> {
  const rows = await tx
    .select({
      orderId: s.planAssignments.orderId,
      vehicleId: s.planTrips.vehicleId,
    })
    .from(s.planAssignments)
    .leftJoin(s.planTrips, eq(s.planTrips.id, s.planAssignments.tripId))
    .where(eq(s.planAssignments.planId, planId));
  return Object.fromEntries(rows.map((r) => [r.orderId, r.vehicleId]));
}

/** Every vehicle an order could move to on a draft, with the blocking rule. */
export async function moveTargets(planId: string, orderId: string) {
  const [p] = await db.select().from(s.plans).where(eq(s.plans.id, planId));
  if (!p) return [];
  const input = await engineInput(db, p.day, p.depot, p.policy as PolicyId);
  return moveOptions(input, await assignmentOf(db, planId), orderId);
}

/** Move one order to a vehicle, or defer it, then re-plan around the move. */
export async function moveOrder(
  user: User,
  planId: string,
  orderId: string,
  target: { vehicleId: string } | { defer: string },
) {
  return db.transaction(async (tx) => {
    const at = await touch(tx);
    const p = await draftPlan(tx, planId);
    const input = await engineInput(tx, p.day, p.depot, p.policy as PolicyId);
    const who = await outletLabel(tx, orderId);
    let text: string;
    if ("vehicleId" in target) {
      const options = moveOptions(
        input,
        await assignmentOf(tx, planId),
        orderId,
      );
      const opt = options.find((o) => o.vehicleId === target.vehicleId);
      if (!opt?.ok)
        throw new PlanError(opt?.reason ?? "That vehicle can’t take it.");
      await setPin(tx, user, p.day, at, {
        orderId,
        kind: "vehicle",
        vehicleId: target.vehicleId,
      });
      text = `Moved ${who} to ${target.vehicleId}`;
    } else {
      const reason = target.defer.trim();
      if (reason.length < 4)
        throw new PlanError("Add a reason the store will see.");
      await setPin(tx, user, p.day, at, { orderId, kind: "defer", reason });
      text = `Deferred ${who}: “${reason}”`;
    }
    await logEvent(tx, { at, kind: "plan.edit", actor: user, text, orderId });
    const fresh = await engineInput(tx, p.day, p.depot, p.policy as PolicyId);
    const { result, bestCase } = runEngine(fresh);
    return storePlan(tx, user, fresh, result, bestCase, at, text);
  });
}

/** Put a moved or deferred order back in the planner's hands. */
export async function releasePin(user: User, planId: string, orderId: string) {
  return db.transaction(async (tx) => {
    const at = await touch(tx);
    const p = await draftPlan(tx, planId);
    await tx
      .delete(s.pins)
      .where(and(eq(s.pins.day, p.day), eq(s.pins.orderId, orderId)));
    const text = `Handed ${await outletLabel(tx, orderId)} back to the planner`;
    await logEvent(tx, { at, kind: "plan.edit", actor: user, text, orderId });
    const input = await engineInput(tx, p.day, p.depot, p.policy as PolicyId);
    const { result, bestCase } = runEngine(input);
    return storePlan(tx, user, input, result, bestCase, at, text);
  });
}

/* ------------------------------------------------------------------ */
/* Publishing                                                          */
/* ------------------------------------------------------------------ */

/** Arrival band a store can plan staff around: about 30 minutes. */
export function arrivalBand(eta: number) {
  const start = Math.floor((eta - 10) / 10) * 10;
  return {
    from: start,
    to: start + 30,
    label: `${clockOf(start)} – ${clockOf(start + 30)}`,
  };
}

const randomCode = () => String(1000 + Math.floor(Math.random() * 9000));
const randomToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) =>
    b.toString(36).padStart(2, "0"),
  ).join("");

/** One handling unit per order line, loaded in stop order. */
async function unitsFor(
  tx: DBOrTx,
  tripRunId: string,
  stops: { seq: number; outletId: string; orderIds: string[] }[],
) {
  const ids = stops.flatMap((st) => st.orderIds);
  if (!ids.length) return [];
  const lines = await tx
    .select({ line: s.orderLines, order: s.orders })
    .from(s.orderLines)
    .innerJoin(s.orders, eq(s.orders.id, s.orderLines.orderId))
    .where(inArray(s.orderLines.orderId, ids))
    .orderBy(asc(s.orderLines.orderId), asc(s.orderLines.lineNo));
  const out: (typeof s.loadUnits.$inferInsert)[] = [];
  for (const st of stops)
    for (const { line, order } of lines.filter((l) =>
      st.orderIds.includes(l.order.id),
    ))
      out.push({
        id: line.lineNo === 1 ? order.id : `${order.id}-${line.lineNo}`,
        tripRunId,
        orderId: order.id,
        orderLineId: line.id,
        stopSeq: st.seq,
        kind: order.temp,
        name: line.name,
        cases: line.cases,
        volumeM3: line.volumeM3,
        temp: order.temp,
      });
  return out;
}

export async function publishPlan(user: User, planId: string) {
  return db.transaction(async (tx) => {
    // Serialize with order, vehicle and planning writes before checking inputs.
    const at = await touch(tx);
    const p = await draftPlan(tx, planId);
    const pending = await tx
      .select({ id: s.decisions.id })
      .from(s.decisions)
      .where(
        and(eq(s.decisions.planId, planId), eq(s.decisions.status, "pending")),
      );
    if (pending.length)
      throw new PlanError(
        `Resolve ${plural(pending.length, "decision")} first.`,
      );

    const input = await engineInput(tx, p.day, p.depot, p.policy as PolicyId);
    if (!p.inputHash || p.inputHash !== inputHash(input))
      throw new PlanError(
        "Orders or operating constraints changed since this draft. Re-run the planner before publishing.",
      );
    const assignments = await tx
      .select()
      .from(s.planAssignments)
      .where(eq(s.planAssignments.planId, planId));
    const trips = await tx
      .select()
      .from(s.planTrips)
      .where(eq(s.planTrips.planId, planId))
      .orderBy(asc(s.planTrips.depart), asc(s.planTrips.vehicleId));
    const stops = await tx
      .select()
      .from(s.planStops)
      .where(
        inArray(
          s.planStops.tripId,
          trips.length
            ? trips.map((t) => t.id)
            : ["00000000-0000-0000-0000-000000000000"],
        ),
      )
      .orderBy(asc(s.planStops.seq));
    const stopsOf = (tripId: string) =>
      stops.filter((st) => st.tripId === tripId);

    if (
      assignments.length !== input.orders.length ||
      assignments.some((a) =>
        a.status === "served"
          ? !a.tripId ||
            !stopsOf(a.tripId).some((st) => st.orderIds.includes(a.orderId))
          : a.status !== "deferred" || a.tripId !== null,
      )
    )
      throw new PlanError(
        "Every order must be served on its assigned trip or deferred with a reason. Re-run the planner.",
      );

    // The independent validator has the last word before anything goes out.
    const violations = validatePlan(
      input,
      trips.map((t) => ({
        vehicleId: t.vehicleId,
        tripNo: t.tripNo as 1 | 2,
        brand: t.brand,
        district: t.district,
        orderIds: stopsOf(t.id).flatMap((st) => st.orderIds),
        stops: stopsOf(t.id).map((st) => ({
          outletId: st.outletId,
          orderIds: st.orderIds,
          arrive: st.arrive,
          serviceStart: st.serviceStart,
          serviceEnd: st.serviceEnd,
          waitMin: st.serviceStart - st.arrive,
          windowOpen: st.windowOpen,
          windowClose: st.windowClose,
        })),
        depart: t.depart,
        lastServiceEnd: t.lastServiceEnd,
        returnAt: t.returnAt,
        km: t.km,
        liters: t.liters,
        volumeM3: t.volumeM3,
        weightKg: t.weightKg,
        chilledM3: t.chilledM3,
      })),
      assignments
        .filter((a) => a.status === "deferred")
        .map((a) => ({ orderId: a.orderId, reason: a.reason ?? "" })),
    );
    if (violations.length)
      throw new PlanError(
        `The plan breaks a rule: ${violations[0].text}. Re-run the planner.`,
      );

    await tx
      .update(s.plans)
      .set({ status: "superseded" })
      .where(
        and(
          eq(s.plans.day, p.day),
          eq(s.plans.depot, p.depot),
          eq(s.plans.status, "published"),
        ),
      );
    await tx
      .update(s.plans)
      .set({ status: "published", publishedAt: at, publishedBy: user.id })
      .where(eq(s.plans.id, planId));

    const outlets = new Map(
      (
        await tx.select().from(s.outlets).where(eq(s.outlets.depot, p.depot))
      ).map((o) => [o.id, o]),
    );
    const drivers = new Map(
      (await tx.select().from(s.users).where(eq(s.users.role, "driver"))).map(
        (u) => [u.vehicleId, u],
      ),
    );

    // Hand the work to the dock and the drivers, keeping progress already made.
    const existing = await tx
      .select()
      .from(s.tripRuns)
      .where(and(eq(s.tripRuns.day, p.day), eq(s.tripRuns.depot, p.depot)));
    const existingStops = existing.length
      ? await tx
          .select()
          .from(s.stopRuns)
          .where(
            inArray(
              s.stopRuns.tripRunId,
              existing.map((r) => r.id),
            ),
          )
      : [];
    const ordersOnRun = (runId: string) =>
      new Set(
        existingStops
          .filter((st) => st.tripRunId === runId)
          .flatMap((st) => st.orderIds),
      );
    const newVehicleOf = new Map<string, string>();
    for (const t of trips)
      for (const st of stopsOf(t.id))
        for (const id of st.orderIds) newVehicleOf.set(id, t.vehicleId);
    const keep = new Set<string>();

    for (const [i, t] of trips.entries()) {
      const tStops = stopsOf(t.id);
      const orderIds = tStops.flatMap((st) => st.orderIds);
      const prev = existing.find(
        (r) => r.vehicleId === t.vehicleId && r.tripNo === t.tripNo,
      );
      const driver = drivers.get(t.vehicleId);
      if (prev && !["planned", "loading"].includes(prev.status)) {
        keep.add(prev.id);
        continue; // already out of the dock: the truck carries what it was given
      }
      let changeNote: string | null = null;
      if (prev) {
        const before = ordersOnRun(prev.id);
        const removed = [...before].filter((id) => !orderIds.includes(id));
        const added = orderIds.filter((id) => !before.has(id));
        const describe = (id: string, verb: string) => {
          const o = input.orders.find((x) => x.id === id);
          const out = o ? outlets.get(o.outletId) : undefined;
          return `${out ? `${out.id} ${out.name}` : id} ${verb}`;
        };
        const notes = [
          ...removed.map((id) =>
            describe(
              id,
              newVehicleOf.has(id)
                ? `moved to ${newVehicleOf.get(id)}. Don’t load it`
                : "deferred. Don’t load it",
            ),
          ),
          ...added.map((id) => describe(id, "added to this truck")),
        ];
        // One line per outlet, even when its chilled and dry orders both move.
        const unique = [...new Set(notes)];
        changeNote = unique.length ? unique.join(" · ") : null;
      }
      const values = {
        day: p.day,
        planTripId: t.id,
        planVersion: p.version,
        vehicleId: t.vehicleId,
        tripNo: t.tripNo,
        brand: t.brand,
        district: t.district,
        depot: p.depot,
        depart: t.depart,
        returnAt: t.returnAt,
        driverId: driver?.id ?? null,
        dock: (i % 6) + 1,
      };
      let runId: string;
      if (prev) {
        runId = prev.id;
        keep.add(prev.id);
        await tx
          .update(s.tripRuns)
          .set({ ...values, changeNote, changeAcked: changeNote === null })
          .where(eq(s.tripRuns.id, prev.id));
        await tx.delete(s.stopRuns).where(eq(s.stopRuns.tripRunId, prev.id));
      } else {
        const [row] = await tx
          .insert(s.tripRuns)
          .values({
            ...values,
            handoverCode: randomCode(),
            handoverToken: randomToken(),
          })
          .returning({ id: s.tripRuns.id });
        runId = row.id;
        keep.add(row.id);
      }
      if (tStops.length)
        await tx.insert(s.stopRuns).values(
          tStops.map((st) => ({
            tripRunId: runId,
            seq: st.seq,
            outletId: st.outletId,
            orderIds: st.orderIds,
            eta: st.arrive,
            serviceMin: st.serviceEnd - st.serviceStart,
            windowOpen: st.windowOpen,
            windowClose: st.windowClose,
          })),
        );
      const units = await unitsFor(tx, runId, tStops);
      const prevUnits = prev
        ? await tx
            .select()
            .from(s.loadUnits)
            .where(eq(s.loadUnits.tripRunId, prev.id))
        : [];
      await tx.delete(s.loadUnits).where(eq(s.loadUnits.tripRunId, runId));
      if (units.length)
        await tx.insert(s.loadUnits).values(
          units.map((u) => {
            const was = prevUnits.find(
              (x) => x.id === u.id && x.orderLineId === u.orderLineId,
            );
            return was
              ? {
                  ...u,
                  status: was.status,
                  loadedAt: was.loadedAt,
                  loadedBy: was.loadedBy,
                }
              : u;
          }),
        );
      if (driver)
        await notify(tx, {
          audience: `user:${driver.id}`,
          kind: "run",
          title: `Your run for ${dayLabel(p.day)}: ${t.district}`,
          body: `${plural(tStops.length, "stop")} · leave ${clockOf(t.depart)} · plan v${p.version}`,
          link: "/driver",
          at,
        });
    }
    const dropped = existing.filter(
      (r) => !keep.has(r.id) && ["planned", "loading"].includes(r.status),
    );
    if (dropped.length)
      await tx.delete(s.tripRuns).where(
        inArray(
          s.tripRuns.id,
          dropped.map((r) => r.id),
        ),
      );

    // Litres planned per vehicle, for the weekly fuel quota.
    const litres = new Map<string, number>();
    for (const t of trips)
      litres.set(t.vehicleId, (litres.get(t.vehicleId) ?? 0) + t.liters);
    const depotVehicles = (
      await tx
        .select({ id: s.vehicles.id })
        .from(s.vehicles)
        .where(eq(s.vehicles.depot, p.depot))
    ).map((v) => v.id);
    await tx
      .delete(s.fuelLog)
      .where(
        and(
          eq(s.fuelLog.day, p.day),
          inArray(s.fuelLog.vehicleId, depotVehicles),
        ),
      );
    if (litres.size)
      await tx.insert(s.fuelLog).values(
        [...litres].map(([vehicleId, liters]) => ({
          vehicleId,
          day: p.day,
          liters,
        })),
      );

    // Orders, the service record, and what every store is told.
    const nextRun = await nextOperatingDay(tx, p.day);
    const etaOf = new Map<string, { eta: number; vehicleId: string }>();
    for (const t of trips)
      for (const st of stopsOf(t.id))
        for (const id of st.orderIds)
          etaOf.set(id, { eta: st.arrive, vehicleId: t.vehicleId });

    let told = 0;
    for (const a of assignments) {
      const o = input.orders.find((x) => x.id === a.orderId);
      if (!o) continue;
      const out = outlets.get(o.outletId);
      const kind = requiresRefrigeration(o.temp)
        ? o.temp
        : o.brand === "Fresh"
          ? "dry"
          : o.brand.toLowerCase();
      if (a.status === "served") {
        const e = etaOf.get(o.id);
        await tx
          .update(s.orders)
          .set({ status: "planned", deferredTo: null, deferReason: null })
          .where(eq(s.orders.id, o.id));
        await tx
          .insert(s.serviceLog)
          .values({
            outletId: o.outletId,
            temp: o.temp,
            day: p.day,
            outcome: "served",
          })
          .onConflictDoNothing();
        if (e)
          await notify(tx, {
            audience: `outlet:${o.outletId}`,
            kind: "planned",
            title: `${weekdayName(p.day)}’s ${kind} order is planned`,
            body: `${e.vehicleId} · arrival about ${arrivalBand(e.eta).label}`,
            link: "/store/today",
            orderId: o.id,
            at,
          });
      } else {
        told++;
        // The order moves to the next run, where it joins that day's queue.
        await tx
          .update(s.orders)
          .set({
            status: "confirmed",
            deliveryDay: nextRun,
            deferredFrom: p.day,
            deferredTo: nextRun,
            deferReason: a.reason,
          })
          .where(eq(s.orders.id, o.id));
        await tx
          .insert(s.serviceLog)
          .values({
            outletId: o.outletId,
            temp: o.temp,
            day: p.day,
            outcome: "deferred",
            note: a.reason,
          })
          .onConflictDoUpdate({
            target: [
              s.serviceLog.outletId,
              s.serviceLog.temp,
              s.serviceLog.day,
            ],
            set: { outcome: "deferred", note: a.reason },
          });
        await notify(tx, {
          audience: `outlet:${o.outletId}`,
          kind: "deferral",
          title: `Your ${kind} order moves to ${dayLabel(nextRun)}`,
          body: a.reason ?? undefined,
          link: `/store/notice/${o.id}`,
          orderId: o.id,
          at,
        });
        await logEvent(tx, {
          at,
          kind: "order.deferred",
          actor: user,
          text: `Deferred ${o.id} for ${out ? `${out.id} ${out.name}` : o.outletId} to ${dayLabel(nextRun)}: ${a.reason}`,
          orderId: o.id,
          outletId: o.outletId,
        });
      }
    }

    await notify(tx, {
      audience: "role:loader",
      kind: "plan",
      title: `Plan v${p.version} published for ${dayLabel(p.day)}`,
      body: `${plural(trips.length, "trip")} to load at ${p.depot}`,
      link: "/loader",
      at,
    });
    const vehicles = new Set(trips.map((t) => t.vehicleId)).size;
    await logEvent(tx, {
      at,
      kind: "plan.published",
      actor: user,
      text: `Published plan v${p.version} to ${plural(vehicles, "vehicle")}. ${plural(told, "store")} told`,
      data: { planId, depot: p.depot },
    });
    return { version: p.version, vehicles, told };
  });
}

const weekdayName = (day: string) =>
  [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][new Date(`${day}T00:00:00Z`).getUTCDay()];

export async function latestPlan(day: string, depot: string) {
  const [p] = await db
    .select()
    .from(s.plans)
    .where(and(eq(s.plans.day, day), eq(s.plans.depot, depot)))
    .orderBy(desc(s.plans.version))
    .limit(1);
  return p ?? null;
}
