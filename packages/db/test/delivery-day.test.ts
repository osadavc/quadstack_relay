import { expect, test } from "bun:test";
import { toMinutes } from "@relay/domain";
import { plan, validatePlan } from "../../engine/src";
import type {
  EngineInput,
  EngineOrder,
  PolicyId,
} from "../../engine/src/types";
import { deliveryDayOrders } from "../seed/delivery-day";
import { csv } from "../seed/reference";
import type * as s from "../src/schema";

const outlets = csv("outlets.csv").map((o) => ({
  id: o.outlet_id,
  name: o.district,
  brand: o.brand as "Fresh" | "Style" | "Tech",
  district: o.district,
  depot: o.depot,
  dockType: o.dock_type,
  parking: o.parking_constraint,
  mallWindow: o.mall_window || null,
  windowOpen: o.window_open_time,
  windowClose: o.window_close_time,
}));
const products = csv("demo_products.csv").map(
  (p, i) =>
    ({
      id: i + 1,
      sku: p.sku,
      name: p.name,
      brand: p.brand as "Fresh" | "Style" | "Tech",
      temp: p.temp as "ambient" | "chilled" | "frozen",
      unit: p.unit,
      weightKg: Number(p.weight_kg),
      volumeM3: Number(p.volume_m3),
      active: true,
      createdAt: new Date(0),
    }) satisfies typeof s.products.$inferSelect,
);

function inputFor(day: string, depot: string, policy: PolicyId): EngineInput {
  return {
    date: day,
    depot,
    policy,
    pins:
      depot === "Peliyagoda"
        ? deliveryDayOrders(day, outlets, products)
            .filter((o) => o.outlet.id === "OUT074")
            .map((o) => ({
              kind: "vehicle",
              orderId: o.id,
              vehicleId: "VEH007",
            }))
        : [],
    orders: deliveryDayOrders(day, outlets, products)
      .filter((o) => o.outlet.depot === depot)
      .map((o) => ({
        id: o.id,
        outletId: o.outlet.id,
        brand: o.outlet.brand,
        temp: o.temp,
        district: o.outlet.district,
        depot,
        units: o.units,
        weightKg: o.weightKg,
        volumeM3: o.volumeM3,
        windowOpen: toMinutes(o.outlet.windowOpen),
        windowClose: toMinutes(o.outlet.windowClose),
        dockType: o.outlet.dockType as EngineOrder["dockType"],
        vanOnly: o.outlet.parking === "van_only",
        consecutiveSkips: o.outlet.id === "OUT077" ? 1 : 0,
        daysSinceServed: 1,
      })),
    vehicles: csv("vehicles.csv")
      .filter((v) => v.depot === depot)
      .map((v) => ({
        id: v.vehicle_id,
        type: v.type as "truck" | "van",
        temp: v.temp as "reefer" | "ambient",
        depot,
        weightCapKg: Number(v.weight_cap_kg),
        volumeCapM3: Number(v.volume_cap_m3),
        kmPerL: Number(v.km_per_l),
        weeklyQuotaL: Number(v.weekly_fuel_quota_l),
        fuelUsedL: 0,
      })),
    travel: csv("district_travel.csv")
      .filter((d) => d.depot === depot)
      .map((d) => ({
        district: d.district,
        depot,
        depotKm: Number(d.depot_to_district_km),
        depotMin: Number(d.depot_to_district_freeflow_min),
        interKm: Number(d.inter_stop_km),
        interMin: Number(d.inter_stop_freeflow_min),
      })),
    allowance: Object.fromEntries(
      csv("service_allowance.csv").map((a) => [
        `${a.brand}|${a.dock_type}`,
        Number(a.service_allowance_min),
      ]),
    ),
  };
}

test("day follows brand schedules and carries consistent product totals", () => {
  const day = deliveryDayOrders("2026-10-07", outlets, products);
  expect(day).toHaveLength(137);
  expect(new Set(day.map((o) => o.outlet.id)).size).toBe(89);
  expect(day.filter((o) => o.temp === "chilled")).toHaveLength(40);
  expect(day.filter((o) => o.temp === "frozen")).toHaveLength(8);
  expect(day.filter((o) => o.outlet.brand === "Style")).toHaveLength(5);
  expect(day.filter((o) => o.outlet.brand === "Tech")).toHaveLength(4);
  for (const o of day) {
    expect(o.units).toBe(o.lines.reduce((sum, l) => sum + l.cases, 0));
    expect(o.weightKg).toBeCloseTo(
      o.lines.reduce((sum, l) => sum + l.weightKg, 0),
      6,
    );
    expect(o.volumeM3).toBeCloseTo(
      o.lines.reduce((sum, l) => sum + l.volumeM3, 0),
      6,
    );
    expect(o.lines.every((l) => l.cases > 0 && Number.isInteger(l.cases))).toBe(
      true,
    );
  }
});

test("weekday cohorts remain a moderate day; every order fits an eligible vehicle", () => {
  for (const day of [
    "2026-10-05",
    "2026-10-06",
    "2026-10-07",
    "2026-10-08",
    "2026-10-09",
    "2026-10-10",
  ]) {
    expect(deliveryDayOrders(day, outlets, products)).toHaveLength(137);
    for (const depot of ["Peliyagoda", "Kandy"]) {
      const input = inputFor(day, depot, "fairness");
      for (const o of input.orders) {
        expect(
          input.vehicles.some(
            (v) =>
              (!o.vanOnly || v.type === "van") &&
              (o.temp === "ambient" || v.temp === "reefer") &&
              o.weightKg <= v.weightCapKg &&
              o.volumeM3 <= v.volumeCapM3,
          ),
        ).toBe(true);
      }
    }
  }
});

test("all policies respect constraints and identify deferrals on the seeded day", () => {
  for (const policy of ["fairness", "fill", "routes"] as const) {
    let deferred = 0;
    for (const depot of ["Peliyagoda", "Kandy"]) {
      const input = inputFor("2026-10-07", depot, policy);
      const result = plan(input);
      expect(validatePlan(input, result.trips, result.deferrals)).toEqual([]);
      expect(result.kpis.served).toBeGreaterThan(0);
      deferred += result.deferrals.length;
      console.log(
        `${policy} ${depot}: ${result.kpis.served}/${result.kpis.orders} served, ${result.deferrals.length} deferred`,
      );
    }
    expect(deferred).toBeGreaterThan(0);
  }
});

test("the seeded driver can carry OUT074 for the four-role walkthrough", () => {
  const input = inputFor("2026-10-07", "Peliyagoda", "fairness");
  input.pins = input.orders
    .filter((o) => o.outletId === "OUT074")
    .map((o) => ({
      kind: "vehicle",
      orderId: o.id,
      vehicleId: "VEH007",
    }));
  const result = plan(input);
  expect(validatePlan(input, result.trips, result.deferrals)).toEqual([]);
  const demo = result.trips
    .filter((t) => t.vehicleId === "VEH007")
    .flatMap((t) => t.orderIds);
  expect(demo).toContain("WF-1007-074A");
  expect(demo).toContain("WF-1007-074C");
});
