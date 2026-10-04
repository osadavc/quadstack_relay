import { type Ctx, evaluateVehicle, type Failure, legalFor } from "./schedule";
import type { PlanState } from "./state";
import { toHHMM } from "./time";
import type { DeferralGroup, EngineOrder } from "./types";
import { requiresRefrigeration } from "./types";

/*
 * Why an order could not be placed, in words a store manager can read.
 * Every vehicle that could legally carry the order is tried again against
 * the final plan, and the blocking rules are summarised.
 */

const fmtM3 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

export interface Attempt {
  vehicleId: string;
  tripNo: 1 | 2 | null;
  failure: Failure;
  /** Trip load before adding the order, for capacity failures. */
  loadM3?: number;
  capM3?: number;
}

export function attemptsFor(ctx: Ctx, s: PlanState, o: EngineOrder): Attempt[] {
  const out: Attempt[] = [];
  for (const vs of s.vehicles.values()) {
    if (legalFor(o, vs.v)) continue;
    let compatible = false;
    vs.trips.forEach((t, i) => {
      if (t.brand !== o.brand || t.district !== o.district) return;
      compatible = true;
      const next = vs.trips.map((x, j) =>
        j === i ? { ...x, orders: [...x.orders, o] } : x,
      );
      const ev = evaluateVehicle(ctx, vs.v, next);
      if (ev.ok) return;
      const planned = vs.planned.find((p) =>
        p.orderIds.includes(t.orders[0].id),
      );
      out.push({
        vehicleId: vs.v.id,
        tripNo: planned?.tripNo ?? null,
        failure: ev.failure,
        loadM3: t.orders.reduce((a, x) => a + x.volumeM3, 0),
        capM3: vs.v.volumeCapM3,
      });
    });
    if (vs.trips.length < 2) {
      const ev = evaluateVehicle(ctx, vs.v, [
        ...vs.trips,
        { brand: o.brand, district: o.district, orders: [o] },
      ]);
      if (!ev.ok)
        out.push({ vehicleId: vs.v.id, tripNo: null, failure: ev.failure });
    } else if (!compatible) {
      out.push({
        vehicleId: vs.v.id,
        tripNo: null,
        failure: {
          code: "trips",
          text: `${vs.v.id} already runs 2 trips (limit is 2)`,
        },
      });
    }
  }
  return out;
}

export function explainDeferral(
  ctx: Ctx,
  s: PlanState,
  o: EngineOrder,
): { group: DeferralGroup; reason: string } {
  const legal = [...s.vehicles.values()].filter((vs) => !legalFor(o, vs.v));
  if (legal.length === 0) {
    if (o.vanOnly)
      return {
        group: "van",
        reason: requiresRefrigeration(o.temp)
          ? "Van-only outlet · no reefer van at this depot"
          : "Van-only outlet · no van at this depot",
      };
    return {
      group: "capacity",
      reason: "No vehicle at this depot can carry it",
    };
  }
  const maxVol = Math.max(...legal.map((vs) => vs.v.volumeCapM3));
  const maxWt = Math.max(...legal.map((vs) => vs.v.weightCapKg));
  if (o.volumeM3 > maxVol || o.weightKg > maxWt) {
    return {
      group: "oversize",
      reason:
        o.volumeM3 > maxVol
          ? `${fmtM3(o.volumeM3)} m³ is larger than any vehicle (${fmtM3(maxVol)} m³). Needs splitting`
          : `${Math.round(o.weightKg).toLocaleString("en-GB")} kg is heavier than any vehicle. Needs splitting`,
    };
  }

  const attempts = attemptsFor(ctx, s, o);
  const codes = new Set(attempts.map((a) => a.failure.code));
  const close = toHHMM(o.windowClose);

  if (codes.size > 0 && [...codes].every((c) => c === "fuel")) {
    return {
      group: "fuel",
      reason:
        "Every vehicle that could take it would pass its weekly fuel quota",
    };
  }

  const fullTrip = attempts
    .filter(
      (a) =>
        (a.failure.code === "volume" || a.failure.code === "weight") &&
        a.loadM3 !== undefined,
    )
    .sort(
      (a, b) =>
        (a.loadM3 ?? 0) +
        o.volumeM3 -
        (a.capM3 ?? 0) -
        ((b.loadM3 ?? 0) + o.volumeM3 - (b.capM3 ?? 0)),
    )[0];

  if (o.vanOnly) {
    const kind = requiresRefrigeration(o.temp) ? "reefer van" : "van";
    const n = legal.length;
    return {
      group: "van",
      reason: fullTrip
        ? `Van-only outlet · ${kind} trips full (${fmtM3(fullTrip.loadM3 ?? 0)} of ${fmtM3(fullTrip.capM3 ?? 0)} m³)`
        : `Van-only outlet · ${n} ${kind}${n === 1 ? "" : "s"} at the trip limit`,
    };
  }

  if (requiresRefrigeration(o.temp)) {
    return {
      group: "reefer",
      reason: fullTrip
        ? `${o.district} reefer trip full (${fmtM3(fullTrip.loadM3 ?? 0)} of ${fmtM3(fullTrip.capM3 ?? 0)} m³)`
        : `Every reefer at its trip or time limit before ${close}`,
    };
  }

  if ([...codes].every((c) => c === "window" || c === "return")) {
    return {
      group: "window",
      reason: `No free vehicle reaches ${o.district} before ${close}`,
    };
  }
  return {
    group: "capacity",
    reason: fullTrip
      ? `${o.district} trips full (${fmtM3(fullTrip.loadM3 ?? 0)} of ${fmtM3(fullTrip.capM3 ?? 0)} m³)`
      : `No truck space left for ${o.district}`,
  };
}
