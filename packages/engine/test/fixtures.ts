import { readFileSync } from "node:fs";
import { join } from "node:path";
import { toMinutes } from "../src/time";
import type {
  AllowanceMap,
  DistrictTravel,
  EngineInput,
  EngineOrder,
  EngineVehicle,
  PolicyId,
} from "../src/types";

/*
 * Engine input from the General Data files the app loads (outlets,
 * vehicles, district travel, service allowance) with test orders: one per
 * temperature each outlet's brand orders, sized so chilled demand is more
 * than the depot's reefers can carry. The orders are test inputs only.
 */

const DATA = join(import.meta.dir, "../../db/data");

function csv(name: string): Record<string, string>[] {
  const [head, ...rows] = readFileSync(join(DATA, name), "utf8")
    .trim()
    .split("\n");
  const cols = head.split(",");
  return rows.map((r) => {
    const cells = r.split(",");
    return Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? ""]));
  });
}

export const TEST_DAY = "2026-04-06";
const TEMPS: Record<string, ("chilled" | "ambient")[]> = {
  Fresh: ["chilled", "ambient"],
  Style: ["ambient"],
  Tech: ["ambient"],
};
/** Test skip history: OUT074 skipped twice (protected), two more once. */
const SKIPS: Record<string, number> = { OUT074: 2, OUT050: 1, OUT059: 1 };
/** One Style order larger than any vehicle. */
const OVERSIZE = "OUT070";

export const testId = (brand: string, outletId: string, temp: string) => {
  const b = brand === "Fresh" ? "F" : brand === "Style" ? "S" : "T";
  const suffix = brand === "Fresh" ? (temp === "chilled" ? "C" : "A") : "";
  return `W${b}-0406-${outletId.slice(3)}${suffix}`;
};

function size(brand: string, temp: string, vanOnly: boolean, outletId: string) {
  if (outletId === OVERSIZE)
    return { units: 400, weightKg: 4000, volumeM3: 40.7 };
  if (temp === "chilled")
    return vanOnly
      ? { units: 40, weightKg: 300, volumeM3: 2.5 }
      : { units: 150, weightKg: 1200, volumeM3: 10 };
  if (brand === "Fresh") return { units: 80, weightKg: 800, volumeM3: 4 };
  if (brand === "Style") return { units: 60, weightKg: 600, volumeM3: 6 };
  return { units: 10, weightKg: 1500, volumeM3: 3 };
}

export function loadDay(depot = "Peliyagoda", policy: PolicyId = "fairness") {
  const orders: EngineOrder[] = csv("outlets.csv")
    .filter((o) => o.depot === depot)
    .flatMap((o) =>
      (TEMPS[o.brand] ?? ["ambient"]).map((temp) => {
        const vanOnly = o.parking_constraint === "van_only";
        return {
          id: testId(o.brand, o.outlet_id, temp),
          outletId: o.outlet_id,
          brand: o.brand as EngineOrder["brand"],
          district: o.district,
          depot: o.depot,
          temp,
          ...size(o.brand, temp, vanOnly, o.outlet_id),
          windowOpen: toMinutes(o.window_open_time),
          windowClose: toMinutes(o.window_close_time),
          dockType: o.dock_type as EngineOrder["dockType"],
          vanOnly,
          consecutiveSkips: SKIPS[o.outlet_id] ?? 0,
          daysSinceServed: SKIPS[o.outlet_id] ?? 0,
        };
      }),
    );
  const vehicles: EngineVehicle[] = csv("vehicles.csv").map((v) => ({
    id: v.vehicle_id,
    type: v.type as EngineVehicle["type"],
    temp: v.temp as EngineVehicle["temp"],
    weightCapKg: Number(v.weight_cap_kg),
    volumeCapM3: Number(v.volume_cap_m3),
    kmPerL: Number(v.km_per_l),
    weeklyQuotaL: Number(v.weekly_fuel_quota_l),
    fuelUsedL: 0,
    depot: v.depot,
  }));
  const travel: DistrictTravel[] = csv("district_travel.csv").map((t) => ({
    district: t.district,
    depot: t.depot,
    depotKm: Number(t.depot_to_district_km),
    depotMin: Number(t.depot_to_district_freeflow_min),
    interKm: Number(t.inter_stop_km),
    interMin: Number(t.inter_stop_freeflow_min),
  }));
  const allowance: AllowanceMap = Object.fromEntries(
    csv("service_allowance.csv").map((a) => [
      `${a.brand}|${a.dock_type}`,
      Number(a.service_allowance_min),
    ]),
  );
  const input: EngineInput = {
    date: TEST_DAY,
    depot,
    orders,
    vehicles,
    travel,
    allowance,
    policy,
  };
  return input;
}
