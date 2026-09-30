import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DB } from "../src/client";
import { hashPassword } from "../src/password";
import * as s from "../src/schema";

/*
 * Loads the General Data files the Hackathon needs and one account per role.
 * outlets.csv, vehicles.csv and calendar.csv are the shared datasets;
 * district_travel.csv and service_allowance.csv give the travel and
 * unloading minutes needed to check delivery windows and fuel quotas.
 * Nothing else is added: depots are the ones the files name, and an outlet
 * is known by its id and district, as in outlets.csv.
 */

const DATA = join(dirname(fileURLToPath(import.meta.url)), "../data");

export function csv(name: string): Record<string, string>[] {
  const [head, ...rows] = readFileSync(join(DATA, name), "utf8")
    .trim()
    .split(/\r?\n/);
  const cols = head.split(",");
  return rows.map((r) => {
    const cells = r.split(",");
    return Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? ""]));
  });
}

/** Password for the starting accounts. Change it after the first sign-in. */
export const START_PASSWORD = process.env.SEED_PASSWORD ?? "relay2026";

export async function seedReference(db: DB) {
  const outlets = csv("outlets.csv");
  const vehicles = csv("vehicles.csv");
  const travel = csv("district_travel.csv");
  const depotIds = [
    ...new Set([
      ...outlets.map((o) => o.depot),
      ...vehicles.map((v) => v.depot),
      ...travel.map((d) => d.depot),
    ]),
  ].sort();
  await db.insert(s.depots).values(depotIds.map((id) => ({ id, name: id })));

  await db.insert(s.districts).values(
    travel.map((d) => ({
      name: d.district,
      depot: d.depot,
      roadClass: d.road_class,
      freeFlowKmh: Number(d.free_flow_kmh),
      depotKm: Number(d.depot_to_district_km),
      depotMin: Number(d.depot_to_district_freeflow_min),
      interKm: Number(d.inter_stop_km),
      interMin: Number(d.inter_stop_freeflow_min),
    })),
  );

  await db.insert(s.outlets).values(
    outlets.map((o) => ({
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
    })),
  );

  await db.insert(s.vehicles).values(
    vehicles.map((v) => ({
      id: v.vehicle_id,
      type: v.type,
      temp: v.temp,
      weightCapKg: Number(v.weight_cap_kg),
      volumeCapM3: Number(v.volume_cap_m3),
      fuelType: v.fuel_type,
      kmPerL: Number(v.km_per_l),
      weeklyQuotaL: Number(v.weekly_fuel_quota_l),
      depot: v.depot,
    })),
  );

  await db.insert(s.serviceAllowances).values(
    csv("service_allowance.csv").map((a) => ({
      brand: a.brand as "Fresh" | "Style" | "Tech",
      dockType: a.dock_type,
      minutes: Number(a.service_allowance_min),
    })),
  );

  const cal = csv("calendar.csv").map((c) => ({
    day: c.date,
    dow: Number(c.dow),
    isoYear: Number(c.iso_year),
    isoWeek: Number(c.iso_week),
    isPayday: c.is_payday === "1",
    festival: c.festival || null,
    festivalRamp: Number(c.festival_ramp),
    isHoliday: c.is_holiday === "1",
    monsoon: c.monsoon === "1",
    isOperating: c.is_operating === "1",
  }));
  for (let i = 0; i < cal.length; i += 300)
    await db.insert(s.calendar).values(cal.slice(i, i + 300));

  // One account per role to start with. Dispatch adds everyone else.
  const hash = hashPassword(START_PASSWORD);
  const truck = vehicles.find((v) => v.vehicle_id === "VEH007");
  const store = outlets.find((o) => o.outlet_id === "OUT074");
  if (!truck || !store)
    throw new Error("VEH007 or OUT074 missing from the data");
  await db.insert(s.users).values([
    {
      email: "gayan@waypoint.lk",
      name: "Gayan Gimhana",
      role: "dispatcher",
      title: `Dispatcher · ${truck.depot}`,
      depot: truck.depot,
      passwordHash: hash,
    },
    {
      email: "gayashan@waypoint.lk",
      name: "Gayashan Gamage",
      role: "loader",
      title: `Loader · ${truck.depot}`,
      depot: truck.depot,
      passwordHash: hash,
    },
    {
      email: "nimal@waypoint.lk",
      name: "Nimal Vidath",
      role: "driver",
      title: "Driver · VEH007",
      depot: truck.depot,
      vehicleId: "VEH007",
      passwordHash: hash,
    },
    {
      email: "yoshitha@waypoint.lk",
      name: "Yoshitha Dissanayake",
      role: "store",
      title: "Store manager · OUT074",
      outletId: "OUT074",
      passwordHash: hash,
    },
  ]);
}
