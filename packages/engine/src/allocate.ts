import { explainDeferral } from "./explain";
import { buildDecisions } from "./fairness";
import { computeKpis } from "./kpis";
import { type Ctx, legalFor } from "./schedule";
import {
  allTrips,
  cloneState,
  emptyState,
  type Move,
  type PlanState,
  removeOrder,
  tryApply,
} from "./state";
import { mulberry32 } from "./time";
import {
  DEFAULT_SETTINGS,
  type Deferral,
  type EngineInput,
  type EngineOrder,
  type EngineVehicle,
  type PlanResult,
  type PolicyId,
  requiresRefrigeration,
} from "./types";

/*
 * Relay's planner.
 *
 *  1. Person decisions (pins) go in first and are never undone by a re-run.
 *  2. Orders are placed in priority order. Outlets skipped two runs in a row
 *     are protected and go before everything else.
 *  3. Each order takes the cheapest feasible move: join a trip already going
 *     to its district, or open a trip on a vehicle that has a slot left.
 *     Reefers are kept for chilled goods and vans for van-only outlets on
 *     the first pass; leftover space is offered to everything afterwards.
 *  4. The construction runs many times with seeded random tie-breaks and
 *     the best plan by the policy's score wins.
 *  5. The winner is improved with swaps (a deferred order for a lower-value
 *     served one) and by folding small trips into spare space elsewhere.
 *  6. Every deferral gets a reason. A second skip in a row is not decided by
 *     the engine: it goes to the dispatcher with checked options.
 */

/** Outlets skipped this many runs in a row are planned first. */
export const PROTECT_AFTER_SKIPS = 2;

export const isProtected = (o: EngineOrder) =>
  o.consecutiveSkips >= PROTECT_AFTER_SKIPS;

/** How much a served order is worth to the plan under each policy. */
export function orderValue(o: EngineOrder, policy: PolicyId): number {
  switch (policy) {
    case "fill":
      return requiresRefrigeration(o.temp)
        ? 10 + 3 * o.volumeM3
        : 4 + 0.2 * o.volumeM3;
    case "routes":
      return 8;
    default: {
      const base = requiresRefrigeration(o.temp)
        ? 10 + o.volumeM3
        : o.brand === "Fresh"
          ? 6 + 0.3 * o.volumeM3
          : 5 + 0.2 * o.volumeM3;
      // Long gaps count for a little; repeated skips are the guard's job.
      return base + (o.daysSinceServed >= 3 ? 2 : 0);
    }
  }
}

function priority(o: EngineOrder, policy: PolicyId, ctx: Ctx): number {
  const protect = isProtected(o) ? 1000 : 0;
  const far = (ctx.travel.get(o.district)?.depotMin ?? 0) / 60;
  switch (policy) {
    case "fill":
      return (
        protect + (requiresRefrigeration(o.temp) ? 60 : 0) + 4 * o.volumeM3
      );
    case "routes":
      return (
        protect +
        (requiresRefrigeration(o.temp) ? 30 : 0) -
        4 * far +
        o.volumeM3
      );
    default:
      return (
        protect +
        (requiresRefrigeration(o.temp) ? 40 : 0) +
        (o.brand === "Fresh" ? 15 : 0) +
        (o.consecutiveSkips === 1 ? 6 : 0) +
        Math.min(o.daysSinceServed, 7) * 1.5 +
        1.5 * o.volumeM3 +
        (o.vanOnly ? 8 : 0) +
        far
      );
  }
}

/** Score a plan; compared element by element, higher is better. */
function score(
  s: PlanState,
  orders: Map<string, EngineOrder>,
  policy: PolicyId,
  previous: Record<string, string> = {},
): number[] {
  let protectedServed = 0;
  let value = 0;
  for (const id of s.placed.keys()) {
    const o = orders.get(id);
    if (!o) continue;
    if (isProtected(o)) protectedServed++;
    value += orderValue(o, policy);
  }
  let used = 0;
  let km = 0;
  for (const vs of s.vehicles.values()) {
    if (vs.planned.length) used++;
    for (const t of vs.planned) km += t.km;
  }
  if (policy === "routes") value -= km * 0.02;
  let changes = 0;
  for (const [id, vid] of Object.entries(previous)) {
    if (!orders.has(id)) continue;
    if (s.placed.get(id) !== vid) changes++;
  }
  // On a re-run every order that moves costs value, so the plan only
  // reshuffles for a real gain, not for a marginally better packing.
  value -= CHANGE_COST * changes;
  return [protectedServed, round3(value), -changes, -used, -Math.round(km)];
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Value an order must add on a re-run to be worth moving another one. */
const CHANGE_COST = 4;

function better(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] > b[i] + 1e-9) return true;
    if (a[i] < b[i] - 1e-9) return false;
  }
  return false;
}

type Pass = "strict" | "relaxed";

/** Whether a vehicle may take this order on this pass. */
function allowed(
  o: EngineOrder,
  v: EngineVehicle,
  pass: Pass,
  tripOrders: EngineOrder[] | null,
): boolean {
  if (pass === "relaxed") return true;
  // Vans are kept for outlets trucks can't reach.
  if (v.type === "van" && !o.vanOnly) return false;
  // Reefer space is kept for chilled goods. Ambient goods ride along only
  // when the same outlet's chilled order is already on that trip.
  if (v.temp === "reefer" && o.temp === "ambient" && !o.vanOnly) {
    if (!tripOrders) return false;
    return tripOrders.some(
      (x) => x.outletId === o.outletId && requiresRefrigeration(x.temp),
    );
  }
  return true;
}

interface Candidate {
  move: Move;
  cost: number;
}

function candidates(
  ctx: Ctx,
  s: PlanState,
  o: EngineOrder,
  pass: Pass,
  remainingDemand: (o: EngineOrder, v: EngineVehicle) => number,
  rand: () => number,
  spareIds: Set<string>,
  previous: Record<string, string> = {},
): Candidate[] {
  const out: Candidate[] = [];
  const was = previous[o.id];
  const t = ctx.travel.get(o.district);
  if (!t) return out;
  for (const vs of s.vehicles.values()) {
    if (legalFor(o, vs.v)) continue;
    vs.trips.forEach((trip, tripIdx) => {
      if (trip.brand !== o.brand || trip.district !== o.district) return;
      if (!allowed(o, vs.v, pass, trip.orders)) return;
      const sameOutlet = trip.orders.some((x) => x.outletId === o.outletId);
      const cost =
        (sameOutlet ? 0 : t.interMin + t.interKm * 0.6) +
        rand() * 2 -
        (was === vs.v.id ? 500 : 0);
      out.push({ move: { kind: "join", vehicleId: vs.v.id, tripIdx }, cost });
    });
    if (vs.trips.length < 2 && allowed(o, vs.v, pass, null)) {
      const demand = remainingDemand(o, vs.v);
      const cap = vs.v.volumeCapM3;
      const fit = demand <= cap ? (cap - demand) * 1.6 : (demand - cap) * 0.4;
      const cost =
        t.depotMin * 2 +
        t.depotKm * 0.6 +
        (vs.trips.length === 0 ? 45 : 0) +
        fit +
        (spareIds.has(vs.v.id) ? 400 : 0) +
        rand() * 8 -
        (was === vs.v.id ? 500 : 0);
      out.push({ move: { kind: "open", vehicleId: vs.v.id }, cost });
    }
  }
  out.sort((a, b) => a.cost - b.cost);
  return out;
}

function place(
  ctx: Ctx,
  s: PlanState,
  o: EngineOrder,
  pass: Pass,
  remainingDemand: (o: EngineOrder, v: EngineVehicle) => number,
  rand: () => number,
  spareIds: Set<string>,
  previous: Record<string, string> = {},
): boolean {
  for (const c of candidates(
    ctx,
    s,
    o,
    pass,
    remainingDemand,
    rand,
    spareIds,
    previous,
  )) {
    if (tryApply(ctx, s, o, c.move)) return true;
  }
  return false;
}

export function plan(input: EngineInput): PlanResult {
  const started = Date.now();
  const settings = { ...DEFAULT_SETTINGS, ...input.settings };
  const ctx: Ctx = {
    travel: new Map(input.travel.map((t) => [t.district, t])),
    allowance: input.allowance,
    settings,
  };
  const depotOrders = input.orders.filter((o) => o.depot === input.depot);
  const vehicles = input.vehicles.filter((v) => v.depot === input.depot);
  const orders = new Map(depotOrders.map((o) => [o.id, o]));
  const pins = new Map((input.pins ?? []).map((p) => [p.orderId, p]));
  const previous = input.previous ?? {};

  // The largest dry truck is held back as the breakdown spare when it can be.
  const dry = vehicles
    .filter((v) => v.type === "truck" && v.temp === "ambient")
    .sort((a, b) => b.volumeCapM3 - a.volumeCapM3 || a.id.localeCompare(b.id));
  const spareIds = new Set(
    dry.slice(0, settings.spareDryTrucks).map((v) => v.id),
  );

  const personDeferred = new Map<string, string>();
  const free: EngineOrder[] = [];
  for (const o of depotOrders) {
    const p = pins.get(o.id);
    if (p?.kind === "defer") personDeferred.set(o.id, p.reason);
    else free.push(o);
  }

  const base = emptyState(vehicles);
  const pinFailures = new Map<string, string>();
  for (const o of free) {
    const p = pins.get(o.id);
    if (p?.kind !== "vehicle") continue;
    const vs = base.vehicles.get(p.vehicleId);
    const ok =
      vs &&
      !legalFor(o, vs.v) &&
      (vs.trips.some((_, i) =>
        tryApply(ctx, base, o, {
          kind: "join",
          vehicleId: p.vehicleId,
          tripIdx: i,
        }),
      ) ||
        tryApply(ctx, base, o, { kind: "open", vehicleId: p.vehicleId }));
    if (!ok) pinFailures.set(o.id, `No longer fits on ${p.vehicleId}`);
  }

  const toPlace = free.filter(
    (o) => !base.placed.has(o.id) && !pinFailures.has(o.id),
  );

  let best: PlanState | null = null;
  let bestScore: number[] = [];
  const iterations = Math.max(1, settings.iterations);

  // Most passes order orders by the chosen policy; some borrow the other
  // policies' orderings, and the chosen policy's score still picks the winner.
  const others = (["fairness", "fill", "routes"] as PolicyId[]).filter(
    (p) => p !== input.policy,
  );
  for (let it = 0; it < iterations; it++) {
    const rand = mulberry32(settings.seed + it * 7919);
    const noise = it < 3 ? 0 : 0.35;
    const orderBy =
      it % 5 === 3 ? others[0] : it % 5 === 4 ? others[1] : input.policy;
    // On a re-run the first pass places last time's orders first, so a
    // plan close to the one being replaced is always among the candidates.
    const seeded = it === 0 && Object.keys(previous).length > 0;
    const keyed = toPlace.map((o) => {
      const p = priority(o, orderBy, ctx);
      // Protected orders always go first, whatever the ordering.
      const k = isProtected(o) ? p : p * (1 + noise * (rand() - 0.5));
      return { o, k: seeded && previous[o.id] ? k + 1e6 : k };
    });
    keyed.sort((a, b) => b.k - a.k || a.o.id.localeCompare(b.o.id));
    const s = cloneState(base);
    const waiting = new Set(keyed.map((x) => x.o.id));

    // What a new trip could still pick up in this district, for best-fit.
    const remainingDemand = (o: EngineOrder, v: EngineVehicle) => {
      let vol = 0;
      for (const id of waiting) {
        const x = orders.get(id);
        if (!x || x.brand !== o.brand || x.district !== o.district) continue;
        if (
          v.temp === "reefer"
            ? requiresRefrigeration(x.temp)
            : x.temp === "ambient"
        )
          if (!x.vanOnly || v.type === "van") vol += x.volumeM3;
      }
      return vol;
    };

    const tieRand = it < 3 ? () => 0 : rand;
    // Seeded pass: last time's orders go straight back on their vehicles.
    if (seeded)
      for (const { o } of keyed) {
        const vs = s.vehicles.get(previous[o.id] ?? "");
        if (!vs || legalFor(o, vs.v)) continue;
        const ok =
          vs.trips.some(
            (trip, i) =>
              trip.brand === o.brand &&
              trip.district === o.district &&
              tryApply(ctx, s, o, {
                kind: "join",
                vehicleId: vs.v.id,
                tripIdx: i,
              }),
          ) ||
          (vs.trips.length < 2 &&
            tryApply(ctx, s, o, { kind: "open", vehicleId: vs.v.id }));
        if (ok) waiting.delete(o.id);
      }
    const left: EngineOrder[] = [];
    for (const { o } of keyed) {
      if (s.placed.has(o.id)) continue;
      if (
        !place(
          ctx,
          s,
          o,
          "strict",
          remainingDemand,
          tieRand,
          spareIds,
          previous,
        )
      )
        left.push(o);
      waiting.delete(o.id);
    }
    for (const o of left) {
      place(ctx, s, o, "relaxed", () => 0, tieRand, spareIds, previous);
    }

    const sc = score(s, orders, input.policy, previous);
    if (!best || better(sc, bestScore)) {
      best = s;
      bestScore = sc;
    }
  }

  const finalState = improve(
    ctx,
    best ?? base,
    orders,
    input.policy,
    pins,
    spareIds,
    previous,
  );
  const finalScore = score(finalState, orders, input.policy, previous);

  const deferrals: Deferral[] = [];
  for (const o of depotOrders) {
    if (finalState.placed.has(o.id)) continue;
    const reason = personDeferred.get(o.id);
    if (reason) {
      deferrals.push({
        orderId: o.id,
        group: "person",
        reason,
        needsDecision: false,
      });
      continue;
    }
    const why = explainDeferral(ctx, finalState, o);
    deferrals.push({
      orderId: o.id,
      group: why.group,
      reason: pinFailures.get(o.id) ?? why.reason,
      needsDecision:
        (o.consecutiveSkips >= 1 || isProtected(o)) && why.group !== "oversize",
    });
  }

  const decisions = buildDecisions(
    ctx,
    finalState,
    deferrals.filter((d) => d.needsDecision),
    orders,
    new Set(
      deferrals.filter((d) => d.group !== "person").map((d) => d.orderId),
    ),
  );

  const trips = allTrips(finalState).sort(
    (a, b) => a.vehicleId.localeCompare(b.vehicleId) || a.tripNo - b.tripNo,
  );

  return {
    trips,
    deferrals,
    decisions,
    kpis: computeKpis(ctx, finalState, depotOrders, vehicles, spareIds),
    stats: {
      iterations,
      ms: Date.now() - started,
      score: finalScore,
    },
  };
}

/**
 * Local improvement on the winning plan:
 *  - a deferred order may take the place of a lower-value served order,
 *    if the displaced order can go elsewhere or is worth less;
 *  - a trip whose orders all fit into spare space on other trips to the
 *    same district is folded away, freeing a vehicle.
 */
function improve(
  ctx: Ctx,
  start: PlanState,
  orders: Map<string, EngineOrder>,
  policy: PolicyId,
  pins: Map<string, { kind: string }>,
  spareIds: Set<string>,
  previous: Record<string, string>,
): PlanState {
  let s = start;
  const sc0 = (x: PlanState) => score(x, orders, policy, previous);
  let current = sc0(s);
  const locked = (id: string) => pins.has(id);

  for (let round = 0; round < 3; round++) {
    let changed = false;
    const deferred = [...orders.values()]
      .filter((o) => !s.placed.has(o.id) && !locked(o.id))
      .sort((a, b) => orderValue(b, policy) - orderValue(a, policy));

    for (const x of deferred) {
      // Direct insertion with any leftover space.
      const direct = cloneState(s);
      if (
        place(
          ctx,
          direct,
          x,
          "relaxed",
          () => 0,
          () => 0,
          spareIds,
          previous,
        )
      ) {
        const sc = sc0(direct);
        if (better(sc, current)) {
          s = direct;
          current = sc;
          changed = true;
          continue;
        }
      }
      // Swap with a served order of the same brand and district.
      const victims = [...s.placed.keys()]
        .map((id) => orders.get(id))
        .filter(
          (y): y is EngineOrder =>
            !!y &&
            y.brand === x.brand &&
            y.district === x.district &&
            !isProtected(y) &&
            !locked(y.id) &&
            orderValue(y, policy) < orderValue(x, policy),
        )
        .sort((a, b) => orderValue(a, policy) - orderValue(b, policy));
      for (const y of victims) {
        const trial = cloneState(s);
        const vid = trial.placed.get(y.id);
        if (!vid || !removeOrder(ctx, trial, y.id)) continue;
        const vs = trial.vehicles.get(vid);
        if (!vs) continue;
        const moves: Move[] = [
          ...vs.trips.map((_, i) => ({
            kind: "join" as const,
            vehicleId: vid,
            tripIdx: i,
          })),
          { kind: "open", vehicleId: vid },
        ];
        if (!moves.some((m) => tryApply(ctx, trial, x, m))) continue;
        place(
          ctx,
          trial,
          y,
          "relaxed",
          () => 0,
          () => 0,
          spareIds,
          previous,
        );
        const sc = sc0(trial);
        if (better(sc, current)) {
          s = trial;
          current = sc;
          changed = true;
          break;
        }
      }
    }

    // Fold trips into spare space on trips already going to that district.
    for (const vs of [...s.vehicles.values()]) {
      for (const trip of [...vs.trips]) {
        const trial = cloneState(s);
        const ids = trip.orders.map((o) => o.id);
        if (ids.some(locked)) continue;
        let ok = true;
        for (const id of ids) {
          if (!removeOrder(ctx, trial, id)) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        for (const o of trip.orders) {
          const homes: Move[] = [];
          for (const other of trial.vehicles.values()) {
            if (other.v.id === vs.v.id) continue;
            other.trips.forEach((t, i) => {
              if (t.brand === o.brand && t.district === o.district)
                homes.push({ kind: "join", vehicleId: other.v.id, tripIdx: i });
            });
          }
          if (!homes.some((m) => tryApply(ctx, trial, o, m))) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        const sc = sc0(trial);
        if (better(sc, current)) {
          s = trial;
          current = sc;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return s;
}
