import type { Ctx } from "./schedule";
import type { PlanState } from "./state";
import type { EngineOrder, EngineVehicle, PlanKpis } from "./types";
import { requiresRefrigeration } from "./types";

const FRESH_CUTOFF = 8 * 60;

export function computeKpis(
  ctx: Ctx,
  s: PlanState,
  orders: EngineOrder[],
  vehicles: EngineVehicle[],
  spareIds: Set<string>,
): PlanKpis {
  let chilledDemand = 0;
  let chilledPlanned = 0;
  let totalDemand = 0;
  let totalPlanned = 0;
  for (const o of orders) {
    totalDemand += o.volumeM3;
    if (requiresRefrigeration(o.temp)) chilledDemand += o.volumeM3;
    if (s.placed.has(o.id)) {
      totalPlanned += o.volumeM3;
      if (requiresRefrigeration(o.temp)) chilledPlanned += o.volumeM3;
    }
  }

  // Nearest district with chilled demand: the quickest extra trip a reefer could run.
  const chilledDistricts = new Set(
    orders.filter((o) => requiresRefrigeration(o.temp)).map((o) => o.district),
  );
  const nearest = Math.min(
    ...[...chilledDistricts].map((d) => ctx.travel.get(d)?.depotMin ?? 999),
  );

  let used = 0;
  let reefers = 0;
  let reefersAtLimit = 0;
  let dryIdle = 0;
  let km = 0;
  let liters = 0;
  let fuelPeak: PlanKpis["fuelPeak"] = null;
  let within = true;
  const spareHeld: string[] = [];

  for (const v of vehicles) {
    const vs = s.vehicles.get(v.id);
    const planned = vs?.planned ?? [];
    if (planned.length) used++;
    for (const t of planned) {
      km += t.km;
      liters += t.liters;
    }
    if (v.temp === "reefer") {
      reefers++;
      const last = planned[planned.length - 1];
      const noTime =
        last &&
        last.returnAt + ctx.settings.reloadMin + nearest > FRESH_CUTOFF - 30;
      if (planned.length >= 2 || noTime) reefersAtLimit++;
    } else if (v.type === "truck" && planned.length === 0) {
      if (spareIds.has(v.id)) spareHeld.push(v.id);
      else dryIdle++;
    }
    const share = (v.fuelUsedL + (vs?.liters ?? 0)) / v.weeklyQuotaL;
    if (share > 1 + 1e-9) within = false;
    if (planned.length && (!fuelPeak || share > fuelPeak.share)) {
      fuelPeak = { vehicleId: v.id, share, district: planned[0].district };
    }
  }

  return {
    orders: orders.length,
    served: s.placed.size,
    deferred: orders.length - s.placed.size,
    chilledDemandM3: chilledDemand,
    chilledPlannedM3: chilledPlanned,
    totalDemandM3: totalDemand,
    totalPlannedM3: totalPlanned,
    vehiclesAvailable: vehicles.length,
    vehiclesUsed: used,
    reefersAvailable: reefers,
    reefersAtLimit,
    dryIdle,
    spareHeld,
    fuelPeak,
    fuelWithinQuota: within,
    km,
    liters,
  };
}
