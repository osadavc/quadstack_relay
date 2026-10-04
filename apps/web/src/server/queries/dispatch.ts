import { db, previousOperatingDays, schema as s } from "@relay/db";
import {
  addDays,
  addMinutes,
  clockOf,
  clockOn,
  cmpOps,
  DOCK_LABEL,
  dayLabel,
  daysBetween,
  hhmm,
  minutesBetween,
  minutesOf,
  plural,
  requiresRefrigeration,
  stamp,
  weekday,
} from "@relay/domain";
import type { Decision, PlanKpis } from "@relay/engine";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { cutoffFor, now, runDay, workingDay } from "../clock";
import { outletHistory } from "../history";
import { latestPlan, nextOperatingDay } from "../planning";
import { mapLink, progressOf } from "../progress";
import { eventsFor, orderStories, trailOf } from "./story";

/** The day a depot is working, and the real time now. */
async function opsFor(depot: string) {
  const t = now();
  return { day: await workingDay(depot), clock: t, today: t.slice(0, 10) };
}

/** The day the live board follows: the earliest day with unfinished trips, else the latest. */
async function liveOps(depot: string) {
  const t = now();
  return { day: await runDay(depot), clock: t, today: t.slice(0, 10) };
}

/* ------------------------------------------------------------------ */
/* Order queue                                                         */
/* ------------------------------------------------------------------ */

export type RunMark = "served" | "skipped" | "none";

async function lastRuns(day: string, n = 5) {
  return (await previousOperatingDays(db, day, n)).reverse();
}

export async function ordersQueue(depot: string) {
  const ops = await opsFor(depot);
  const outlets = await db
    .select()
    .from(s.outlets)
    .where(eq(s.outlets.depot, depot));
  const byId = new Map(outlets.map((o) => [o.id, o]));
  const all = await db
    .select()
    .from(s.orders)
    .where(
      inArray(s.orders.deliveryDay, [
        ops.day,
        await nextOperatingDay(db, ops.day),
      ]),
    );
  const mine = all.filter((o) => byId.has(o.outletId));
  const queue = mine.filter(
    (o) => o.deliveryDay === ops.day && o.status !== "draft",
  );
  // Orders already in for the run after this one.
  const upcoming = mine.filter(
    (o) => o.deliveryDay > ops.day && o.status !== "draft",
  );
  const drafts = mine.filter(
    (o) => o.deliveryDay === ops.day && o.status === "draft",
  );
  const users = await db
    .select({ id: s.users.id, name: s.users.name, role: s.users.role })
    .from(s.users);
  const history = await outletHistory(
    db,
    [...new Set(queue.map((o) => o.outletId))],
    ops.day,
  );
  const runs = await lastRuns(ops.day);

  const rows = queue
    .map((o) => {
      const out = byId.get(o.outletId);
      if (!out) return null;
      const h = history.get(o.outletId);
      const marks: RunMark[] = runs.map((d) => {
        const r = h?.runs.find((x) => x.day === d);
        return r ? r.outcome : "none";
      });
      const last = h?.lastServed[o.temp];
      const unserved = last ? daysBetween(last, ops.day) : null;
      const skips = h?.consecutiveSkips ?? 0;
      const placer = users.find((u) => u.id === o.placedBy);
      const skippedNames = (h?.skippedDays ?? [])
        .slice(0, skips)
        .reverse()
        .map((d) => dayLabel(d).split(" ")[0]);
      const guard =
        skips >= 2
          ? {
              tone: "danger" as const,
              title: "Protected",
              text: `Skipped ${listJoin(skippedNames)}. Plans first.`,
            }
          : skips === 1
            ? {
                tone: "warning" as const,
                title: "Skipped on the last run",
                text: "Deferring it again needs your decision.",
              }
            : null;
      return {
        id: o.id,
        outletId: o.outletId,
        outlet: out.name,
        brand: o.brand,
        district: out.district,
        temp: o.temp,
        units: o.units,
        volumeM3: o.volumeM3,
        weightKg: o.weightKg,
        window: `${out.windowOpen}–${out.windowClose}`,
        access:
          out.parking === "van_only"
            ? "Van only"
            : out.parking === "mall_dock"
              ? "Mall bay"
              : (DOCK_LABEL[out.dockType] ?? out.dockType),
        dockDetail:
          out.parking === "van_only"
            ? "Van only · narrow street"
            : out.parking === "mall_dock"
              ? `Mall bay · ${out.mallWindow}`
              : `${DOCK_LABEL[out.dockType]} · any vehicle`,
        runs: marks,
        skips,
        unserved: skips > 0 && unserved !== null ? unserved : null,
        protected: skips >= 2,
        movedFrom: o.deferredFrom ? dayLabel(o.deferredFrom) : null,
        placed: o.placedAt ? stamp(o.placedAt, ops.today) : "",
        placedBy:
          o.channel === "phone"
            ? `Phoned in · entered by ${placer?.name.split(" ")[0] ?? "dispatch"}`
            : `${placer?.name ?? "Store manager"} · in the app`,
        status: o.status,
        guard,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort(
      (a, b) =>
        Number(b.protected) - Number(a.protected) ||
        b.skips - a.skips ||
        a.outletId.localeCompare(b.outletId) ||
        a.temp.localeCompare(b.temp),
    );

  const fresh = rows.filter((r) => r.brand === "Fresh");
  const cutoff = cutoffFor(ops.day);
  const closed =
    cmpOps(ops.clock, cutoff) >= 0 || Boolean(await latestPlan(ops.day, depot));
  const minutesLeft = Math.max(0, minutesBetween(ops.clock, cutoff));
  // "16:00" when orders close today, "Sun 16:00" when they close on another day.
  const closesAt =
    cutoff.slice(0, 10) === ops.today
      ? hhmm(cutoff)
      : `${weekday(cutoff)} ${hhmm(cutoff)}`;
  return {
    day: ops.day,
    dayLabel: dayLabel(ops.day),
    clock: ops.clock,
    closed,
    closesAt,
    minutesLeft,
    nextDayLabel: dayLabel(await nextOperatingDay(db, ops.day)),
    rows,
    upcoming: upcoming.map((o) => ({
      id: o.id,
      outletId: o.outletId,
      outlet: byId.get(o.outletId)?.name ?? "",
      placed: o.placedAt ? hhmm(o.placedAt) : "",
    })),
    drafts: drafts.map((o) => ({
      id: o.id,
      outletId: o.outletId,
      outlet: byId.get(o.outletId)?.name ?? "",
    })),
    outletCount: new Set(rows.map((r) => r.outletId)).size,
    summary: {
      fresh: fresh.length,
      freshAmbient: fresh.filter((r) => r.temp === "ambient").length,
      freshChilled: fresh.filter((r) => requiresRefrigeration(r.temp)).length,
      style: rows.filter((r) => r.brand === "Style").length,
      tech: rows.filter((r) => r.brand === "Tech").length,
      volume: rows.reduce((a, r) => a + r.volumeM3, 0),
      weight: rows.reduce((a, r) => a + r.weightKg, 0),
      chilled: rows
        .filter((r) => requiresRefrigeration(r.temp))
        .reduce((a, r) => a + r.volumeM3, 0),
      skipped: new Set(rows.filter((r) => r.skips > 0).map((r) => r.outletId))
        .size,
      vanOnly: rows.filter((r) => r.access === "Van only").length,
    },
  };
}

function listJoin(xs: string[]) {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;
}

export async function orderDrawer(orderId: string) {
  const stories = await orderStories([orderId]);
  const st = stories.get(orderId);
  if (!st) return null;
  const [district] = await db
    .select()
    .from(s.districts)
    .where(eq(s.districts.name, st.outlet.district));
  const [manager] = await db
    .select()
    .from(s.users)
    .where(and(eq(s.users.outletId, st.outlet.id), eq(s.users.role, "store")));
  return {
    trail: trailOf(st, "dispatcher"),
    size: `${plural(st.order.units, "unit")} · ${Math.round(st.order.weightKg).toLocaleString("en-GB")} kg · ${st.order.volumeM3.toFixed(2)} m³`,
    window: `${st.outlet.windowOpen} – ${st.outlet.windowClose}`,
    fromDepot: `${district?.depotMin ?? "?"} min free-flow · ${district?.depotKm ?? "?"} km`,
    contact: manager
      ? {
          name: manager.name,
          role: `Store manager · ${st.outlet.id} ${st.outlet.name}`,
          phone: manager.phone,
        }
      : null,
  };
}

/* ------------------------------------------------------------------ */
/* Plan board                                                          */
/* ------------------------------------------------------------------ */

const GROUP_LABEL: Record<string, string> = {
  person: "Decided by dispatch",
  reefer: "No reefer space before 08:00",
  van: "Van access",
  window: "Delivery window",
  capacity: "Truck space",
  fuel: "Fuel quota",
  oversize: "Too big for any vehicle",
};
const GROUP_ORDER = [
  "person",
  "reefer",
  "van",
  "window",
  "capacity",
  "fuel",
  "oversize",
];

export async function planBoard(depot: string) {
  const ops = await opsFor(depot);
  const plan = await latestPlan(ops.day, depot);
  const published = await db
    .select()
    .from(s.plans)
    .where(
      and(
        eq(s.plans.day, ops.day),
        eq(s.plans.depot, depot),
        eq(s.plans.status, "published"),
      ),
    )
    .limit(1);
  const vehicles = await db
    .select({
      v: s.vehicles,
      status: s.vehicleDays.status,
      note: s.vehicleDays.note,
    })
    .from(s.vehicles)
    .leftJoin(
      s.vehicleDays,
      and(
        eq(s.vehicleDays.vehicleId, s.vehicles.id),
        eq(s.vehicleDays.day, ops.day),
      ),
    )
    .where(eq(s.vehicles.depot, depot))
    .orderBy(asc(s.vehicles.id));
  const [cal] = await db
    .select()
    .from(s.calendar)
    .where(eq(s.calendar.day, ops.day));
  const festival = await db
    .select()
    .from(s.calendar)
    .where(
      and(
        gte(s.calendar.day, ops.day),
        sql`${s.calendar.festival} is not null`,
      ),
    )
    .orderBy(asc(s.calendar.day))
    .limit(1);
  const orderCount = await db
    .select({ n: sql<number>`count(*)` })
    .from(s.orders)
    .innerJoin(s.outlets, eq(s.outlets.id, s.orders.outletId))
    .where(
      and(
        eq(s.orders.deliveryDay, ops.day),
        eq(s.outlets.depot, depot),
        inArray(s.orders.status, [
          "confirmed",
          "planned",
          "loaded",
          "delivered",
          "received",
        ]),
      ),
    );

  const base = {
    day: ops.day,
    dayLabel: dayLabel(ops.day),
    clock: ops.clock,
    depot,
    orders: Number(orderCount[0]?.n ?? 0),
    festival: festival[0]?.festival
      ? {
          name: festivalName(festival[0].festival),
          inDays: daysBetween(ops.day, festival[0].day),
        }
      : null,
    monsoon: cal?.monsoon ?? false,
    publishedVersion: published[0]?.version ?? null,
    workshop: vehicles
      .filter((v) => v.status === "workshop")
      .map((v) => ({ id: v.v.id, note: v.note })),
  };
  if (!plan) return { ...base, plan: null };

  const trips = await db
    .select()
    .from(s.planTrips)
    .where(eq(s.planTrips.planId, plan.id))
    .orderBy(asc(s.planTrips.depart));
  const stops = trips.length
    ? await db
        .select()
        .from(s.planStops)
        .where(
          inArray(
            s.planStops.tripId,
            trips.map((t) => t.id),
          ),
        )
        .orderBy(asc(s.planStops.seq))
    : [];
  const assignments = await db
    .select()
    .from(s.planAssignments)
    .where(eq(s.planAssignments.planId, plan.id));
  const orders = assignments.length
    ? await db
        .select()
        .from(s.orders)
        .where(
          inArray(
            s.orders.id,
            assignments.map((a) => a.orderId),
          ),
        )
    : [];
  const outlets = await db
    .select()
    .from(s.outlets)
    .where(eq(s.outlets.depot, depot));
  const outletById = new Map(outlets.map((o) => [o.id, o]));
  const history = await outletHistory(
    db,
    [...new Set(orders.map((o) => o.outletId))],
    ops.day,
  );
  const decisions = await db
    .select()
    .from(s.decisions)
    .where(
      and(eq(s.decisions.planId, plan.id), eq(s.decisions.status, "pending")),
    );
  const pins = await db.select().from(s.pins).where(eq(s.pins.day, ops.day));
  const nextRun = await nextOperatingDay(db, ops.day);
  const kpis = plan.kpis as PlanKpis;

  const protectedOrders = new Set(
    orders
      .filter((o) => (history.get(o.outletId)?.consecutiveSkips ?? 0) >= 2)
      .map((o) => o.id),
  );

  const lanes = vehicles
    .filter((v) => (v.status ?? "available") === "available")
    .map(({ v }) => {
      const vt = trips
        .filter((t) => t.vehicleId === v.id)
        .sort((a, b) => a.tripNo - b.tripNo);
      const fresh = vt.filter((t) => t.brand === "Fresh");
      const freshEnd = fresh.length
        ? Math.max(...fresh.map((t) => t.lastServiceEnd))
        : null;
      return {
        id: v.id,
        reefer: v.temp === "reefer",
        van: v.type === "van",
        kind: `${v.type === "van" ? "Van" : v.temp === "reefer" ? "Reefer" : "Dry"} · ${v.volumeCapM3.toFixed(1)} m³`,
        capM3: v.volumeCapM3,
        capKg: v.weightCapKg,
        freshEnds: freshEnd !== null ? clockOf(freshEnd) : null,
        freshTight: freshEnd !== null && freshEnd >= 7 * 60 + 45,
        spare: kpis.spareHeld.includes(v.id),
        fuelShare: v.weeklyQuotaL
          ? vt.reduce((a, t) => a + t.liters, 0) / v.weeklyQuotaL
          : 0,
        trips: vt.map((t) => {
          const ts = stops.filter((st) => st.tripId === t.id);
          const ids = ts.flatMap((st) => st.orderIds);
          const prot = ids.find((id) => protectedOrders.has(id));
          return {
            id: t.id,
            tripNo: t.tripNo,
            brand: t.brand,
            district: t.district,
            depart: t.depart,
            returnAt: t.returnAt,
            lastServiceEnd: t.lastServiceEnd,
            load: t.volumeM3 / v.volumeCapM3,
            weightShare: t.weightKg / v.weightCapKg,
            volumeM3: t.volumeM3,
            weightKg: t.weightKg,
            chilled: t.chilledM3 > 0,
            km: t.km,
            liters: t.liters,
            protects: prot
              ? (orders.find((o) => o.id === prot)?.outletId ?? null)
              : null,
            stops: ts.map((st) => ({
              seq: st.seq,
              outletId: st.outletId,
              outlet: outletById.get(st.outletId)?.name ?? st.outletId,
              orderIds: st.orderIds,
              arrive: st.arrive,
              windowOpen: st.windowOpen,
              windowClose: st.windowClose,
              temps: st.orderIds.map(
                (id) => orders.find((o) => o.id === id)?.temp ?? "ambient",
              ),
            })),
          };
        }),
      };
    })
    .sort(
      (a, b) =>
        laneRank(a) - laneRank(b) ||
        (b.trips[0] ? 1 : 0) - (a.trips[0] ? 1 : 0) ||
        a.id.localeCompare(b.id),
    );

  const deferred = assignments
    .filter((a) => a.status === "deferred")
    .map((a) => {
      const o = orders.find((x) => x.id === a.orderId);
      const out = o ? outletById.get(o.outletId) : undefined;
      const h = o ? history.get(o.outletId) : undefined;
      const skips = h?.consecutiveSkips ?? 0;
      const last = o ? h?.lastServed[o.temp] : undefined;
      const decision = decisions.find((d) => d.orderId === a.orderId);
      const pin = pins.find((p) => p.orderId === a.orderId);
      return {
        orderId: a.orderId,
        outletId: o?.outletId ?? "",
        outlet: out?.name ?? "",
        brand: o?.brand ?? "Fresh",
        temp: o?.temp ?? "ambient",
        volumeM3: o?.volumeM3 ?? 0,
        group: a.group ?? "capacity",
        reason: a.reason ?? "",
        status:
          skips > 0
            ? `Skipped last run${last ? ` · ${daysBetween(last, ops.day)} days` : ""}`
            : "Served last run",
        statusTone: skips > 0 ? ("warning" as const) : undefined,
        decisionId: decision?.id ?? null,
        pinned: Boolean(pin),
        next: decision
          ? { text: "Needs your decision", tone: "warning" as const }
          : {
              text: `${dayLabel(nextRun)} · ${skips >= 1 || pin ? "protected, plans first" : "first in line"}`,
              tone: "success" as const,
            },
      };
    });
  const groups = GROUP_ORDER.map((g) => ({
    key: g,
    label: GROUP_LABEL[g],
    items: deferred
      .filter((d) => d.group === g)
      .sort(
        (a, b) =>
          Number(Boolean(b.decisionId)) - Number(Boolean(a.decisionId)) ||
          b.volumeM3 - a.volumeM3,
      ),
  })).filter((g) => g.items.length);

  const pending = decisions.map((d) => {
    const o = orders.find((x) => x.id === d.orderId);
    const out = o ? outletById.get(o.outletId) : undefined;
    return {
      id: d.id,
      orderId: d.orderId,
      outletId: out?.id ?? "",
      outlet: out?.name ?? "",
    };
  });

  return {
    ...base,
    plan: {
      id: plan.id,
      version: plan.version,
      status: plan.status,
      policy: plan.policy,
      createdAt: stamp(plan.createdAt, ops.today),
      publishedAt: plan.publishedAt ? stamp(plan.publishedAt, ops.today) : null,
      edits: plan.edits,
      kpis,
      bestCase: plan.bestCaseChilledM3 ?? kpis.chilledPlannedM3,
      stats: plan.stats as { ms: number; iterations: number },
      deferredChilledM3: deferred
        .filter((d) => requiresRefrigeration(d.temp))
        .reduce((a, d) => a + d.volumeM3, 0),
      vehiclesWithTrips: new Set(trips.map((t) => t.vehicleId)).size,
    },
    lanes,
    groups,
    pending,
    nextRunLabel: dayLabel(nextRun),
    pins: pins.map((p) => ({
      orderId: p.orderId,
      kind: p.kind,
      vehicleId: p.vehicleId,
      reason: p.reason,
    })),
  };
}

const laneRank = (l: {
  reefer: boolean;
  van: boolean;
  trips: unknown[];
  spare: boolean;
}) =>
  (l.reefer ? 0 : l.van ? 1 : 2) * 10 + (l.trips.length ? 0 : l.spare ? 5 : 8);

function festivalName(key: string) {
  return (
    {
      new_year: "New Year",
      vesak: "Vesak",
      poson: "Poson",
      esala: "Esala",
      deepavali: "Deepavali",
      christmas: "Christmas",
      thai_pongal: "Thai Pongal",
    }[key] ?? key
  );
}

export type PlanBoardData = Awaited<ReturnType<typeof planBoard>>;

/* ------------------------------------------------------------------ */
/* Fairness decision                                                   */
/* ------------------------------------------------------------------ */

export async function decisionView(id: string) {
  const t = now();
  const [d] = await db.select().from(s.decisions).where(eq(s.decisions.id, id));
  if (!d) return null;
  const ops = { day: d.day, clock: t, today: t.slice(0, 10) };
  const detail = d.detail as Decision;
  const ids = new Set<string>([d.orderId]);
  for (const o of detail.options) {
    if (o.kind === "swap") ids.add(o.withOrderId);
    if (o.kind === "redirect")
      for (const x of [...o.serves, ...o.displaced]) ids.add(x);
  }
  const orders = await db
    .select()
    .from(s.orders)
    .where(inArray(s.orders.id, [...ids]));
  const outlets = await db
    .select()
    .from(s.outlets)
    .where(inArray(s.outlets.id, [...new Set(orders.map((o) => o.outletId))]));
  const name = (orderId: string) => {
    const o = orders.find((x) => x.id === orderId);
    const out = outlets.find((x) => x.id === o?.outletId);
    return out
      ? {
          id: out.id,
          name: out.name,
          volume: o?.volumeM3 ?? 0,
          temp: o?.temp ?? "ambient",
        }
      : { id: orderId, name: "", volume: 0, temp: "ambient" };
  };
  const order = orders.find((o) => o.id === d.orderId);
  const outlet = outlets.find((o) => o.id === order?.outletId);
  const history = order
    ? (await outletHistory(db, [order.outletId], ops.day)).get(order.outletId)
    : undefined;
  const last = order ? history?.lastServed[order.temp] : undefined;
  const nextRun = await nextOperatingDay(db, ops.day);
  return {
    id: d.id,
    status: d.status,
    kind: d.kind,
    orderId: d.orderId,
    order: order
      ? { volumeM3: order.volumeM3, temp: order.temp, brand: order.brand }
      : null,
    outlet: outlet
      ? {
          id: outlet.id,
          name: outlet.name,
          window: `${outlet.windowOpen} – ${outlet.windowClose}`,
          district: outlet.district,
        }
      : null,
    lastDelivery: last
      ? `${dayLabel(last)} · ${daysBetween(last, ops.day)} days`
      : "No recent delivery",
    skips: history?.consecutiveSkips ?? 0,
    closest: detail.closest,
    options: detail.options.map((o) =>
      o.kind === "swap"
        ? { ...o, with: name(o.withOrderId) }
        : o.kind === "redirect"
          ? {
              ...o,
              servesNamed: o.serves.map(name),
              displacedNamed: o.displaced.map(name),
            }
          : o,
    ),
    dayLabel: dayLabel(ops.day),
    nextRunLabel: dayLabel(nextRun),
    clock: hhmm(ops.clock),
  };
}

export type DecisionData = NonNullable<
  Awaited<ReturnType<typeof decisionView>>
>;

/* ------------------------------------------------------------------ */
/* Live board                                                          */
/* ------------------------------------------------------------------ */

export type LiveStatus =
  | "dock"
  | "on_time"
  | "at_risk"
  | "late"
  | "offline"
  | "delivered"
  | "done"
  | "loading"
  | "problem";

export async function liveBoard(depot: string) {
  const ops = await liveOps(depot);
  const clock = minutesOf(ops.clock, ops.day);
  const [plan] = await db
    .select()
    .from(s.plans)
    .where(
      and(
        eq(s.plans.day, ops.day),
        eq(s.plans.depot, depot),
        eq(s.plans.status, "published"),
      ),
    );
  const runs = await db
    .select()
    .from(s.tripRuns)
    .where(and(eq(s.tripRuns.day, ops.day), eq(s.tripRuns.depot, depot)));
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
        .select({ runId: s.loadUnits.tripRunId, status: s.loadUnits.status })
        .from(s.loadUnits)
        .where(
          inArray(
            s.loadUnits.tripRunId,
            runs.map((r) => r.id),
          ),
        )
    : [];
  const outlets = new Map(
    (await db.select().from(s.outlets).where(eq(s.outlets.depot, depot))).map(
      (o) => [o.id, o],
    ),
  );
  const vehicles = new Map(
    (await db.select().from(s.vehicles)).map((v) => [v.id, v]),
  );
  const drivers = new Map(
    (await db.select().from(s.users).where(eq(s.users.role, "driver"))).map(
      (u) => [u.id, u],
    ),
  );
  const rows = runs.map((run) => {
    const rs = stops.filter((st) => st.tripRunId === run.id);
    const ru = units.filter((u) => u.runId === run.id);
    const p = progressOf(
      run,
      rs,
      clock,
      ru.length
        ? ru.filter((u) => u.status !== "pending").length / ru.length
        : 0,
    );
    const next =
      p.stops.find((x) => x.state === "current") ??
      p.stops.find((x) => x.state === "pending");
    const nextOutlet = next ? outlets.get(next.outletId) : undefined;
    const lastDone = [...p.stops].reverse().find((x) => x.state === "done");
    const anyLate = p.stops.some((x) => x.late);
    const atRisk = p.stops.filter((x) => x.atRisk && x.state !== "done");
    const failed = p.stops.some((x) => x.state === "failed");
    let status: LiveStatus;
    if (p.offline) status = "offline";
    else if (failed) status = "problem";
    else if (p.status === "completed") status = "done";
    else if (["planned"].includes(p.status)) status = "dock";
    else if (["loading", "loaded"].includes(p.status)) status = "loading";
    else if (["released", "accepted"].includes(p.status)) status = "dock";
    else if (atRisk.length) status = "at_risk";
    else if (anyLate) status = "late";
    else if (lastDone && !next) status = "done";
    else if (lastDone) status = "delivered";
    else status = "on_time";

    const driver = run.driverId ? drivers.get(run.driverId) : undefined;
    let sub = "";
    if (status === "offline") {
      sub = `No signal since ${p.lastHeard !== null ? clockOn(p.day, p.lastHeard) : "departure"}`;
    } else if (
      p.status === "planned" ||
      p.status === "loading" ||
      p.status === "loaded"
    ) {
      sub = `At dock · leaves ${clockOf(run.depart)}`;
    } else if (p.status === "released" || p.status === "accepted") {
      sub = `Released${p.acceptedAt !== null ? `, accepted` : ""} · leaves ${clockOf(run.depart)}`;
    } else if (status === "done") {
      sub = `${p.done} of ${p.stops.length} with proof · back ${p.completedAt !== null ? clockOn(p.day, p.completedAt) : "soon"}`;
    } else if (next) {
      const arrived = next.arrivedAt !== null;
      sub = arrived
        ? `Arrived ${clockOn(p.day, next.arrivedAt ?? 0)} · unloading`
        : `ETA ${clockOf(next.expected)} · window ${next.atRisk ? "closes" : "to"} ${clockOf(next.windowClose)}${next.atRisk ? " · at risk" : ""}`;
      if (lastDone && lastDone.completedAt !== null)
        sub = `Delivered ${outlets.get(lastDone.outletId)?.id ?? ""} ${clockOn(p.day, lastDone.completedAt)}${rs.some((x) => x.recordedOffline) ? " · synced" : ""} · next ${clockOf(next.expected)}`;
    }

    if (status === "at_risk" && atRisk[0]) {
      const o = outlets.get(atRisk[0].outletId);
      sub = `${o ? `${o.id} ${o.name}` : atRisk[0].outletId}: ETA ${clockOf(atRisk[0].expected)}, window closes ${clockOf(atRisk[0].windowClose)}`;
    }

    const heard =
      p.lastHeard === null
        ? ""
        : clock - p.lastHeard <= 0
          ? "now"
          : `${clock - p.lastHeard} min`;
    return {
      id: run.id,
      vehicleId: run.vehicleId,
      tripNo: run.tripNo,
      district: run.district,
      reefer: vehicles.get(run.vehicleId)?.temp === "reefer",
      van: vehicles.get(run.vehicleId)?.type === "van",
      driver: driver?.name ?? null,
      location: p.location,
      map: p.location ? mapLink(p.location) : null,
      dots: p.stops.map((x) =>
        x.state === "done"
          ? "done"
          : x.state === "failed"
            ? "failed"
            : x.state === "current"
              ? p.offline
                ? "offline"
                : "current"
              : "pending",
      ),
      done: p.done,
      total: p.stops.length,
      next:
        next && nextOutlet
          ? `${nextOutlet.id} · ${nextOutlet.name}`
          : p.status === "completed"
            ? "Back at the depot"
            : "Returning to depot",
      sub,
      status,
      heard,
      atRisk: atRisk.map((x) => ({
        outletId: x.outletId,
        expected: clockOf(x.expected),
        close: clockOf(x.windowClose),
      })),
      lateStops: p.stops
        .filter((x) => x.late)
        .map((x) => ({
          outletId: x.outletId,
          minutes: (x.arrivedAt ?? 0) - x.windowClose,
        })),
      depart: run.depart,
      progress: p,
    };
  });

  const weight: Record<LiveStatus, number> = {
    offline: 0,
    problem: 1,
    at_risk: 2,
    late: 3,
    loading: 6,
    dock: 7,
    on_time: 4,
    delivered: 5,
    done: 8,
  };
  rows.sort(
    (a, b) =>
      weight[a.status] - weight[b.status] ||
      a.depart - b.depart ||
      a.vehicleId.localeCompare(b.vehicleId),
  );

  const allStops = rows.flatMap((r) => r.progress.stops);
  const lateList = rows.flatMap((r) =>
    r.lateStops.map((l) => ({ ...l, vehicleId: r.vehicleId })),
  );

  // Feed: every role's records for the run, from the cutoff before it or the
  // last 24 hours, whichever starts earlier (planning can happen days ahead).
  const dayBefore = `${addDays(ops.day, -1)} 16:00:00`;
  const lastDay = addMinutes(ops.clock, -24 * 60);
  const events = await db
    .select()
    .from(s.events)
    .where(
      gte(s.events.at, cmpOps(lastDay, dayBefore) < 0 ? lastDay : dayBefore),
    )
    .orderBy(desc(s.events.at), desc(s.events.id))
    .limit(80);
  const feed = [
    ...events
      .filter(
        (e) =>
          !["plan.run", "plan.edit", "admin.user"].includes(e.kind) &&
          (!e.vehicleId ||
            runs.some((r) => r.vehicleId === e.vehicleId) ||
            !e.tripRunId),
      )
      .map((e) => ({
        key: `e${e.id}`,
        at: e.at,
        time: stamp(e.at, ops.today),
        kind: e.kind,
        actor: e.actorName,
        role: e.role,
        text: e.text,
        source: e.source,
        tripRunId: e.tripRunId,
        vehicleId: e.vehicleId,
      })),
  ].sort((a, b) => cmpOps(b.at, a.at));

  return {
    day: ops.day,
    dayLabel: dayLabel(ops.day),
    clock: hhmm(ops.clock),
    publishedAt: plan?.publishedAt ? stamp(plan.publishedAt, ops.today) : null,
    version: plan?.version ?? null,
    rows: rows.map(({ progress: _p, ...r }) => r),
    counts: {
      vehicles: new Set(rows.map((r) => r.vehicleId)).size,
      out: rows.filter((r) => !["dock", "loading"].includes(r.status)).length,
      stopsDone: allStops.filter((x) => x.state === "done").length,
      stops: allStops.length,
      onTime: rows.filter((r) => ["on_time", "delivered"].includes(r.status))
        .length,
      atRisk: rows.filter((r) => r.status === "at_risk").length,
      late: lateList.length,
      lateNote: lateList[0]
        ? `${lateList[0].outletId} ${outlets.get(lateList[0].outletId)?.name ?? ""} · +${lateList[0].minutes}`
        : "none so far",
      offline: rows.filter((r) => r.status === "offline").length,
      offlineNote: rows.find((r) => r.status === "offline"),
    },
    feed: feed.slice(0, 60),
  };
}

export type LiveData = Awaited<ReturnType<typeof liveBoard>>;

/* ------------------------------------------------------------------ */
/* Sidebar, records and deferrals                                      */
/* ------------------------------------------------------------------ */

export async function sidebar(depot: string) {
  const ops = await opsFor(depot);
  const live = await liveBoard(depot);
  const queue = await db
    .select({ n: sql<number>`count(*)` })
    .from(s.orders)
    .innerJoin(s.outlets, eq(s.outlets.id, s.orders.outletId))
    .where(
      and(
        eq(s.orders.deliveryDay, ops.day),
        eq(s.outlets.depot, depot),
        sql`${s.orders.status} <> 'draft'`,
      ),
    );
  const deferred = await db
    .select({ n: sql<number>`count(*)` })
    .from(s.orders)
    .innerJoin(s.outlets, eq(s.outlets.id, s.orders.outletId))
    .where(and(eq(s.orders.deferredFrom, ops.day), eq(s.outlets.depot, depot)));
  const plan = await latestPlan(ops.day, depot);
  const pendingDecisions = plan
    ? await db
        .select({ n: sql<number>`count(*)` })
        .from(s.decisions)
        .where(
          and(
            eq(s.decisions.planId, plan.id),
            eq(s.decisions.status, "pending"),
          ),
        )
    : [{ n: 0 }];
  const attention = live.rows.filter((r) =>
    ["offline", "at_risk", "late", "problem"].includes(r.status),
  ).length;
  return {
    clock: hhmm(ops.clock),
    dayLabel: dayLabel(ops.day),
    orders: Number(queue[0]?.n ?? 0),
    deferred:
      Number(deferred[0]?.n ?? 0) ||
      (plan?.status === "draft" ? ((plan.kpis as PlanKpis).deferred ?? 0) : 0),
    decisions: Number(pendingDecisions[0]?.n ?? 0),
    attention,
    offline: live.counts.offline,
    offlineVehicle: live.counts.offlineNote?.vehicleId ?? null,
  };
}

export async function fleetRecords(depot: string) {
  const ops = await opsFor(depot);
  const rows = await db
    .select({
      v: s.vehicles,
      status: s.vehicleDays.status,
      note: s.vehicleDays.note,
    })
    .from(s.vehicles)
    .leftJoin(
      s.vehicleDays,
      and(
        eq(s.vehicleDays.vehicleId, s.vehicles.id),
        eq(s.vehicleDays.day, ops.day),
      ),
    )
    .where(eq(s.vehicles.depot, depot))
    .orderBy(asc(s.vehicles.id));
  const runs = await db
    .select()
    .from(s.tripRuns)
    .where(and(eq(s.tripRuns.day, ops.day), eq(s.tripRuns.depot, depot)));
  return rows.map(({ v, status, note }) => ({
    id: v.id,
    type: v.type,
    temp: v.temp,
    label: `${v.temp === "reefer" ? "Reefer" : "Dry"} ${v.type}`,
    cap: `${v.volumeCapM3.toFixed(1)} m³ · ${v.weightCapKg.toLocaleString("en-GB")} kg`,
    quota: v.weeklyQuotaL,
    kmPerL: v.kmPerL,
    status: (status ?? "available") as "available" | "workshop",
    note,
    trips: runs
      .filter((r) => r.vehicleId === v.id)
      .sort((a, b) => a.tripNo - b.tripNo)
      .map((r) => r.district),
  }));
}

export async function outletWatch(depot: string) {
  const ops = await opsFor(depot);
  const outlets = await db
    .select()
    .from(s.outlets)
    .where(eq(s.outlets.depot, depot));
  const history = await outletHistory(
    db,
    outlets.map((o) => o.id),
    ops.day,
  );
  return {
    counts: {
      Fresh: outlets.filter((o) => o.brand === "Fresh").length,
      Style: outlets.filter((o) => o.brand === "Style").length,
      Tech: outlets.filter((o) => o.brand === "Tech").length,
    },
    total: outlets.length,
    watch: outlets
      .map((o) => ({ o, h: history.get(o.id) }))
      .filter(({ h }) => (h?.consecutiveSkips ?? 0) > 0)
      .sort(
        (a, b) => (b.h?.consecutiveSkips ?? 0) - (a.h?.consecutiveSkips ?? 0),
      )
      .map(({ o, h }) => ({
        id: o.id,
        name: o.name,
        skips: h?.consecutiveSkips ?? 0,
        note:
          (h?.consecutiveSkips ?? 0) >= 2
            ? `Skipped ${plural(h?.consecutiveSkips ?? 0, "run")} in a row · protected`
            : "Skipped last run",
      })),
  };
}

export async function deferralsRecord(depot: string) {
  const ops = await opsFor(depot);
  const outlets = await db
    .select()
    .from(s.outlets)
    .where(eq(s.outlets.depot, depot));
  const byId = new Map(outlets.map((o) => [o.id, o]));
  const since = addDays(ops.day, -10);
  const log = await db
    .select()
    .from(s.serviceLog)
    .where(
      and(eq(s.serviceLog.outcome, "deferred"), gte(s.serviceLog.day, since)),
    )
    .orderBy(desc(s.serviceLog.day));
  const mine = log.filter((l) => byId.has(l.outletId));
  // Skips before this day: one or more means this deferral is a second skip.
  const history = await outletHistory(
    db,
    [...new Set(mine.map((l) => l.outletId))],
    ops.day,
  );
  // Orders the published plan moved off this day.
  const today = await db
    .select()
    .from(s.orders)
    .where(eq(s.orders.deferredFrom, ops.day));
  const decisions = await db
    .select()
    .from(s.decisions)
    .where(eq(s.decisions.day, ops.day))
    .orderBy(desc(s.decisions.id));
  return {
    dayLabel: dayLabel(ops.day),
    today: today
      .filter((o) => byId.has(o.outletId))
      .map((o) => ({
        id: o.id,
        outletId: o.outletId,
        outlet: byId.get(o.outletId)?.name ?? "",
        temp: o.temp,
        volumeM3: o.volumeM3,
        reason: o.deferReason ?? "",
        nextRun: o.deferredTo ? dayLabel(o.deferredTo) : "",
        skips: history.get(o.outletId)?.consecutiveSkips ?? 0,
        decided: decisions.some(
          (d) => d.orderId === o.id && d.status === "resolved",
        ),
      })),
    log: mine.map((l) => ({
      outletId: l.outletId,
      outlet: byId.get(l.outletId)?.name ?? "",
      temp: l.temp,
      day: dayLabel(l.day),
      note: l.note ?? "",
    })),
    decisions: decisions.map((d) => ({
      id: d.id,
      orderId: d.orderId,
      status: d.status,
      chosen: d.chosen,
      reason: d.reason,
      at: d.decidedAt ? stamp(d.decidedAt, ops.today) : null,
    })),
  };
}

export async function storyEvents(orderId: string) {
  return eventsFor({ orderIds: [orderId] });
}
