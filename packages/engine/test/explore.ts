/* Dev script: print the plan for the test day. `bun test/explore.ts [policy]` */
import { plan, toHHMM, validatePlan } from "../src";
import type { PolicyId } from "../src/types";
import { loadDay } from "./fixtures";

const policy = (process.argv[2] ?? "fairness") as PolicyId;
const input = loadDay("Peliyagoda", policy);
const res = plan(input);
const orders = new Map(input.orders.map((o) => [o.id, o]));

console.log(policy, res.stats, res.kpis);
for (const t of res.trips) {
  console.log(
    `${t.vehicleId} T${t.tripNo} ${t.brand.padEnd(5)} ${t.district.padEnd(10)} ${toHHMM(t.depart)}-${toHHMM(t.returnAt)} last ${toHHMM(t.lastServiceEnd)} ${t.volumeM3.toFixed(1)}m3 ${Math.round(t.weightKg)}kg chilled ${t.chilledM3.toFixed(1)} :: ${t.stops.map((s) => `${s.outletId}@${toHHMM(s.arrive)}(${s.orderIds.map((id) => orders.get(id)?.temp[0]).join("")})`).join(" ")}`,
  );
}
for (const d of res.deferrals) {
  const o = orders.get(d.orderId);
  console.log(
    "DEFER",
    d.orderId,
    o?.temp,
    o?.volumeM3,
    `skips=${o?.consecutiveSkips}`,
    d.group,
    d.reason,
    d.needsDecision ? "NEEDS DECISION" : "",
  );
}
for (const dec of res.decisions) console.log(JSON.stringify(dec, null, 1));
console.log("violations", validatePlan(input, res.trips));
