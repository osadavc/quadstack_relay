import type { EngineInput, EngineOrder, PlannedTrip } from "./types";
import { DEFAULT_SETTINGS } from "./types";

/*
 * Independent check of a finished plan against every operating constraint.
 * It does not reuse the scheduler, so a bug there shows up here. The tests
 * run it on every plan the engine produces, and the app runs it before a
 * plan can be published.
 */

export interface Violation {
  rule:
    | "unknown"
    | "duplicate"
    | "depot"
    | "temp"
    | "access"
    | "mix"
    | "volume"
    | "weight"
    | "trips"
    | "window"
    | "sequence"
    | "fuel";
  text: string;
  vehicleId?: string;
  orderId?: string;
}

const EPS = 1e-6;

export function validatePlan(
  input: EngineInput,
  trips: PlannedTrip[],
): Violation[] {
  const settings = { ...DEFAULT_SETTINGS, ...input.settings };
  const orders = new Map(input.orders.map((o) => [o.id, o]));
  const vehicles = new Map(input.vehicles.map((v) => [v.id, v]));
  const travel = new Map(input.travel.map((t) => [t.district, t]));
  const out: Violation[] = [];
  const seen = new Set<string>();

  const byVehicle = new Map<string, PlannedTrip[]>();
  for (const t of trips) {
    const list = byVehicle.get(t.vehicleId) ?? [];
    list.push(t);
    byVehicle.set(t.vehicleId, list);
  }

  for (const [vid, list] of byVehicle) {
    const v = vehicles.get(vid);
    if (!v) {
      out.push({
        rule: "unknown",
        text: `Unknown vehicle ${vid}`,
        vehicleId: vid,
      });
      continue;
    }
    if (list.length > 2)
      out.push({
        rule: "trips",
        text: `${vid} runs ${list.length} trips; the limit is 2`,
        vehicleId: vid,
      });

    const sorted = [...list].sort((a, b) => a.depart - b.depart);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].depart + EPS < sorted[i - 1].returnAt + settings.reloadMin)
        out.push({
          rule: "sequence",
          text: `${vid} leaves on trip ${i + 1} before trip ${i} is back and reloaded`,
          vehicleId: vid,
        });
    }

    let liters = 0;
    for (const t of list) {
      const tr = travel.get(t.district);
      const tripOrders = t.orderIds
        .map((id) => orders.get(id))
        .filter((o): o is EngineOrder => !!o);
      if (tripOrders.length !== t.orderIds.length)
        out.push({
          rule: "unknown",
          text: "Trip has unknown orders",
          vehicleId: vid,
        });

      let vol = 0;
      let wt = 0;
      for (const o of tripOrders) {
        if (seen.has(o.id))
          out.push({
            rule: "duplicate",
            text: `${o.id} planned twice`,
            orderId: o.id,
          });
        seen.add(o.id);
        vol += o.volumeM3;
        wt += o.weightKg;
        if (o.depot !== v.depot)
          out.push({
            rule: "depot",
            text: `${vid} (${v.depot}) carries ${o.id} for ${o.depot}`,
            vehicleId: vid,
            orderId: o.id,
          });
        if (o.temp === "chilled" && v.temp !== "reefer")
          out.push({
            rule: "temp",
            text: `${o.id} is chilled but ${vid} has no refrigeration`,
            vehicleId: vid,
            orderId: o.id,
          });
        if (o.vanOnly && v.type !== "van")
          out.push({
            rule: "access",
            text: `${o.outletId} is van-only but ${vid} is a truck`,
            vehicleId: vid,
            orderId: o.id,
          });
        if (o.brand !== t.brand || o.district !== t.district)
          out.push({
            rule: "mix",
            text: `${o.id} doesn’t match the trip’s brand and district`,
            vehicleId: vid,
            orderId: o.id,
          });
      }
      if (vol > v.volumeCapM3 + EPS)
        out.push({
          rule: "volume",
          text: `${vid} trip ${t.tripNo}: ${vol.toFixed(1)} of ${v.volumeCapM3} m³`,
          vehicleId: vid,
        });
      if (wt > v.weightCapKg + EPS)
        out.push({
          rule: "weight",
          text: `${vid} trip ${t.tripNo}: ${Math.round(wt)} of ${v.weightCapKg} kg`,
          vehicleId: vid,
        });

      // Re-time the trip from the raw tables and compare with the windows.
      if (tr) {
        let clock = t.depart + tr.depotMin;
        let km = tr.depotKm * 2;
        t.stops.forEach((s, i) => {
          if (i > 0) {
            clock += tr.interMin;
            km += tr.interKm;
          }
          const stopOrders = s.orderIds
            .map((id) => orders.get(id))
            .filter((o): o is EngineOrder => !!o);
          const open = stopOrders[0]?.windowOpen ?? s.windowOpen;
          const close = stopOrders[0]?.windowClose ?? s.windowClose;
          if (clock > close + EPS)
            out.push({
              rule: "window",
              text: `${s.outletId} reached after its window closes`,
              vehicleId: vid,
              orderId: s.orderIds[0],
            });
          const start = Math.max(clock, open);
          const service = stopOrders.reduce(
            (a, o) => a + (input.allowance[`${o.brand}|${o.dockType}`] ?? 20),
            0,
          );
          clock = start + service;
        });
        liters += km / v.kmPerL;
      }
    }
    if (v.fuelUsedL + liters > v.weeklyQuotaL + EPS)
      out.push({
        rule: "fuel",
        text: `${vid} needs ${Math.round(liters)} L; ${Math.round(v.weeklyQuotaL - v.fuelUsedL)} L left this week`,
        vehicleId: vid,
      });
  }
  return out;
}
