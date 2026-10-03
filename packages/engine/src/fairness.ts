import { attemptsFor } from "./explain";
import {
  type Ctx,
  evaluateVehicle,
  legalFor,
  type TripDraft,
} from "./schedule";
import { cloneState, type PlanState, removeOrder, tryApply } from "./state";
import { toHHMM } from "./time";
import type {
  CheckResult,
  Decision,
  DecisionOption,
  Deferral,
  EngineOrder,
} from "./types";

/*
 * The fairness guard. When the plan would skip an outlet for a second run in
 * a row, the engine does not decide who goes without. It hands the dispatcher
 * the options it has already checked:
 *  - swap with an order on the same trip whose outlet was served last run,
 *  - add it to another vehicle (with the rule that blocks it, if any),
 *  - defer again, with a reason the area manager sees.
 */

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const kg = (n: number) => Math.round(n).toLocaleString("en-GB");

function tripOf(s: PlanState, orderId: string) {
  const vid = s.placed.get(orderId);
  if (!vid) return null;
  const vs = s.vehicles.get(vid);
  const trip = vs?.planned.find((t) => t.orderIds.includes(orderId));
  return vs && trip ? { vs, trip } : null;
}

/**
 * Send one (or both) of a reefer's trips to the flagged order's district,
 * filled with the orders waiting there, skipped outlets first. The orders
 * that come off the vehicle are offered back to the rest of the fleet, so
 * each option shows its real net effect.
 */
function redirectOptions(
  ctx: Ctx,
  s: PlanState,
  x: EngineOrder,
  orders: Map<string, EngineOrder>,
  deferredIds: Set<string>,
): (DecisionOption & { kind: "redirect" })[] {
  const pool = [...deferredIds]
    .map((id) => orders.get(id))
    .filter(
      (o): o is EngineOrder =>
        !!o &&
        o.id !== x.id &&
        o.brand === x.brand &&
        o.district === x.district,
    )
    .sort(
      (a, b) =>
        Number(b.consecutiveSkips > 0) - Number(a.consecutiveSkips > 0) ||
        Number(b.temp === "chilled") - Number(a.temp === "chilled") ||
        b.volumeM3 - a.volumeM3,
    );
  const chilledOf = (list: EngineOrder[]) =>
    list.reduce((a, o) => a + (o.temp === "chilled" ? o.volumeM3 : 0), 0);
  const outletsOf = (list: EngineOrder[]) =>
    [...new Set(list.map((o) => o.outletId))].join(", ");

  type Ranked = DecisionOption & {
    kind: "redirect";
    rank: [number, number, number];
  };
  const out: Ranked[] = [];
  for (const vs of s.vehicles.values()) {
    if (legalFor(x, vs.v) || vs.trips.length === 0) continue;
    const variants: number[][] = vs.trips.map((_, i) => [i]);
    if (vs.trips.length === 2) variants.push([0, 1]);
    for (const drop of variants) {
      const keep: TripDraft[] = vs.trips.filter((_, i) => !drop.includes(i));
      const trip: TripDraft = {
        brand: x.brand,
        district: x.district,
        orders: [x],
      };
      let ev = evaluateVehicle(ctx, vs.v, [...keep, trip]);
      if (!ev.ok) continue;
      for (const p of pool) {
        if (legalFor(p, vs.v)) continue;
        const next = { ...trip, orders: [...trip.orders, p] };
        const trial = evaluateVehicle(ctx, vs.v, [...keep, next]);
        if (trial.ok) {
          trip.orders = next.orders;
          ev = trial;
        }
      }
      if (!ev.ok) continue;

      // Apply it to a copy of the plan and offer the displaced orders back.
      const displaced = drop.flatMap((i) => vs.trips[i].orders);
      const trialState = cloneState(s);
      const tv = trialState.vehicles.get(vs.v.id);
      if (!tv) continue;
      tv.trips = [...keep, trip];
      tv.planned = ev.trips;
      tv.liters = ev.liters;
      for (const o of displaced) trialState.placed.delete(o.id);
      for (const o of trip.orders) trialState.placed.set(o.id, vs.v.id);
      const lost: EngineOrder[] = [];
      for (const o of displaced) {
        let placed = false;
        for (const other of trialState.vehicles.values()) {
          if (other.v.id === vs.v.id) continue;
          const moves = [
            ...other.trips.map((_, i) => ({
              kind: "join" as const,
              vehicleId: other.v.id,
              tripIdx: i,
            })),
            { kind: "open" as const, vehicleId: other.v.id },
          ];
          if (moves.some((m) => tryApply(ctx, trialState, o, m))) {
            placed = true;
            break;
          }
        }
        if (!placed) lost.push(o);
      }

      const planned = ev.trips.find((t) => t.orderIds.includes(x.id));
      if (!planned) continue;
      const fromTrips = drop
        .map((i) =>
          vs.planned.find((t) => t.orderIds.includes(vs.trips[i].orders[0].id)),
        )
        .filter((t) => !!t);
      const newSecondSkips = lost
        .filter((o) => o.consecutiveSkips > 0)
        .map((o) => o.id);
      const prevented = trip.orders.filter(
        (o) => o.consecutiveSkips > 0,
      ).length;
      const net = chilledOf(trip.orders) - chilledOf(lost);
      const stop = planned.stops.find((st) => st.orderIds.includes(x.id));

      const checks: CheckResult[] = [
        {
          ok: true,
          text: `Serves ${outletsOf(trip.orders)} · ${fmt1(planned.volumeM3)} of ${fmt1(vs.v.volumeCapM3)} m³`,
        },
      ];
      if (stop)
        checks.push({
          ok: true,
          text: `Arrives ${x.outletId} ${toHHMM(stop.arrive)}, window to ${toHHMM(stop.windowClose)}`,
        });
      checks.push(
        lost.length === 0
          ? {
              ok: true,
              text: `Everything on the old trip still goes, on other vehicles`,
            }
          : newSecondSkips.length
            ? {
                ok: false,
                text: `${outletsOf(lost.filter((o) => o.consecutiveSkips > 0))} would be skipped again`,
              }
            : {
                ok: true,
                text: `${outletsOf(lost)} move to the next run (served last run)`,
              },
      );
      out.push({
        kind: "redirect",
        vehicleId: vs.v.id,
        tripNos: fromTrips.map((t) => t.tripNo).sort(),
        fromDistricts: [...new Set(fromTrips.map((t) => t.district))],
        serves: trip.orders.map((o) => o.id),
        displaced: lost.map((o) => o.id),
        newSecondSkips,
        feasible: newSecondSkips.length === 0,
        checks,
        loadAfterM3: planned.volumeM3,
        capacityM3: vs.v.volumeCapM3,
        recommended: false,
        rank: [newSecondSkips.length, -prevented, -net],
      });
    }
  }
  const seen = new Set<string>();
  return out
    .sort(
      (a, b) =>
        a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.rank[2] - b.rank[2],
    )
    .filter((o) => {
      // One redirect per vehicle: its best variant.
      if (seen.has(o.vehicleId)) return false;
      seen.add(o.vehicleId);
      return true;
    })
    .slice(0, 2)
    .map(({ rank: _rank, ...rest }) => rest);
}

export function buildDecisions(
  ctx: Ctx,
  s: PlanState,
  flagged: Deferral[],
  orders: Map<string, EngineOrder>,
  deferredIds: Set<string>,
): Decision[] {
  const out: Decision[] = [];
  for (const d of flagged) {
    const x = orders.get(d.orderId);
    if (!x) continue;

    // Served orders on trips the flagged order could legally join.
    const peers = [...s.placed.keys()]
      .map((id) => orders.get(id))
      .filter(
        (y): y is EngineOrder =>
          !!y &&
          y.brand === x.brand &&
          y.district === x.district &&
          y.consecutiveSkips === 0,
      )
      .filter((y) => {
        const at = tripOf(s, y.id);
        return at && !legalFor(x, at.vs.v);
      });

    const swaps: (DecisionOption & { kind: "swap" })[] = [];
    for (const y of peers) {
      const at = tripOf(s, y.id);
      if (!at) continue;
      const trial = cloneState(s);
      if (!removeOrder(ctx, trial, y.id)) continue;
      const vs = trial.vehicles.get(at.vs.v.id);
      if (!vs) continue;
      const idx = vs.trips.findIndex(
        (t) => t.brand === x.brand && t.district === x.district,
      );
      const ok =
        idx >= 0
          ? tryApply(ctx, trial, x, {
              kind: "join",
              vehicleId: vs.v.id,
              tripIdx: idx,
            })
          : tryApply(ctx, trial, x, { kind: "open", vehicleId: vs.v.id });
      const after = tripOf(trial, x.id);
      const checks: CheckResult[] = [];
      if (ok && after) {
        const spareKg = vs.v.weightCapKg - after.trip.weightKg;
        checks.push({
          ok: true,
          text: `Trip load ${fmt1(after.trip.volumeM3)} of ${fmt1(vs.v.volumeCapM3)} m³ · ${kg(spareKg)} of ${kg(vs.v.weightCapKg)} kg spare`,
        });
        const stop = after.trip.stops.find((st) => st.orderIds.includes(x.id));
        if (stop)
          checks.push({
            ok: true,
            text: `Arrives ${toHHMM(stop.arrive)}, window to ${toHHMM(stop.windowClose)}`,
          });
        checks.push({
          ok: true,
          text: `Back at the depot by ${toHHMM(after.trip.returnAt)}`,
        });
      } else {
        const load = at.trip.volumeM3 - y.volumeM3 + x.volumeM3;
        checks.push({
          ok: load <= at.vs.v.volumeCapM3,
          text: `Trip load would be ${fmt1(load)} of ${fmt1(at.vs.v.volumeCapM3)} m³`,
        });
        checks.push({
          ok: false,
          text: "The trip can’t be timed inside the windows",
        });
      }
      swaps.push({
        kind: "swap",
        withOrderId: y.id,
        vehicleId: at.vs.v.id,
        tripNo: at.trip.tripNo,
        feasible: Boolean(ok && after),
        checks,
        loadAfterM3: after?.trip.volumeM3 ?? at.trip.volumeM3,
        capacityM3: at.vs.v.volumeCapM3,
        recommended: false,
      });
    }
    // Prefer swapping like for like, then the smallest order served last run.
    swaps.sort((a, b) => {
      if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
      const ya = orders.get(a.withOrderId);
      const yb = orders.get(b.withOrderId);
      const same = (y?: EngineOrder) => (y?.temp === x.temp ? 0 : 1);
      return (
        same(ya) - same(yb) ||
        Math.abs((ya?.volumeM3 ?? 0) - x.volumeM3) -
          Math.abs((yb?.volumeM3 ?? 0) - x.volumeM3)
      );
    });
    const chosenSwaps = swaps.filter((o) => o.feasible).slice(0, 2);
    const redirects =
      chosenSwaps.length === 0
        ? redirectOptions(ctx, s, x, orders, deferredIds)
        : [];
    if (chosenSwaps.length === 0 && redirects.length === 0 && swaps[0])
      chosenSwaps.push(swaps[0]);
    if (chosenSwaps[0]?.feasible) chosenSwaps[0].recommended = true;
    else if (redirects[0] && redirects[0].newSecondSkips.length === 0)
      redirects[0].recommended = true;

    // Other vehicles, with every rule that blocks them.
    const attempts = attemptsFor(ctx, s, x);
    const swapVehicles = new Set([
      ...chosenSwaps.map((o) => o.vehicleId),
      ...redirects.map((o) => o.vehicleId),
    ]);
    const byVehicle = new Map<string, CheckResult[]>();
    for (const a of attempts) {
      if (swapVehicles.has(a.vehicleId)) continue;
      const list = byVehicle.get(a.vehicleId) ?? [];
      if (!list.some((c) => c.text === a.failure.text))
        list.push({ ok: false, text: a.failure.text });
      byVehicle.set(a.vehicleId, list);
    }
    const adds: DecisionOption[] = [...byVehicle.entries()]
      .map(([vehicleId, checks]) => {
        const v = s.vehicles.get(vehicleId)?.v;
        if (v && x.volumeM3 > v.volumeCapM3)
          checks.unshift({
            ok: false,
            text: `${fmt1(x.volumeM3)} m³ exceeds ${vehicleId}’s ${fmt1(v.volumeCapM3)} m³`,
          });
        return { kind: "add" as const, vehicleId, feasible: false, checks };
      })
      // Show the vehicle that came closest: fewest blocking rules, vans for van-only.
      .sort((a, b) => a.checks.length - b.checks.length)
      .slice(0, 1);

    const closestAttempt = attempts
      .filter((a) => a.loadM3 !== undefined && a.tripNo)
      .sort(
        (a, b) =>
          (a.loadM3 ?? 0) - (a.capM3 ?? 0) - ((b.loadM3 ?? 0) - (b.capM3 ?? 0)),
      )
      .reverse()[0];
    const closest = closestAttempt
      ? {
          vehicleId: closestAttempt.vehicleId,
          tripNo: closestAttempt.tripNo as 1 | 2,
          district: x.district,
          loadM3: closestAttempt.loadM3 ?? 0,
          capacityM3: closestAttempt.capM3 ?? 0,
        }
      : null;

    out.push({
      orderId: x.id,
      kind: x.consecutiveSkips >= 1 ? "second_skip" : "protected_unplaced",
      closest,
      options: [...chosenSwaps, ...redirects, ...adds, { kind: "defer" }],
    });
  }
  return out;
}
