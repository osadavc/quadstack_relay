import { describe, expect, test } from "bun:test";
import {
  checkVehicle,
  moveOptions,
  plan,
  planningInputKey,
  validatePlan,
} from "../src";
import type { EngineInput } from "../src/types";
import { loadDay } from "./fixtures";

const POLICIES = ["fairness", "fill", "routes"] as const;

describe("a day with more chilled demand than reefers, Peliyagoda", () => {
  for (const policy of POLICIES) {
    test(`${policy}: every trip passes the independent validator`, () => {
      const input = loadDay("Peliyagoda", policy);
      const res = plan(input);
      expect(validatePlan(input, res.trips, res.deferrals)).toEqual([]);
      // Every order is either served once or deferred with a reason.
      const served = res.trips.flatMap((t) => t.orderIds);
      const deferred = res.deferrals.map((d) => d.orderId);
      expect(new Set(served).size).toBe(served.length);
      expect(served.length + deferred.length).toBe(input.orders.length);
      for (const d of res.deferrals) expect(d.reason.length).toBeGreaterThan(5);
    });
  }

  test("demand exceeds capacity: chilled is the bottleneck", () => {
    const res = plan(loadDay());
    expect(res.kpis.deferred).toBeGreaterThan(0);
    expect(res.kpis.chilledPlannedM3).toBeLessThan(res.kpis.chilledDemandM3);
  });

  test("an outlet skipped two runs in a row is protected", () => {
    const res = plan(loadDay());
    const trip = res.trips.find((t) => t.orderIds.includes("WF-0406-074C"));
    expect(trip).toBeDefined();
  });

  test("a second skip in a row is handed to a person, with options", () => {
    const res = plan(loadDay());
    for (const d of res.deferrals.filter((x) => x.needsDecision)) {
      const decision = res.decisions.find((x) => x.orderId === d.orderId);
      expect(decision).toBeDefined();
      expect(decision?.options.at(-1)?.kind).toBe("defer");
    }
  });

  test("an order larger than any vehicle is deferred, not split", () => {
    const res = plan(loadDay());
    const d = res.deferrals.find((x) => x.orderId === "WS-0406-070");
    expect(d?.group).toBe("oversize");
  });

  test("same input, same plan", () => {
    const a = plan(loadDay());
    const b = plan(loadDay());
    expect(a.trips.map((t) => t.orderIds.join())).toEqual(
      b.trips.map((t) => t.orderIds.join()),
    );
  });

  test("a re-run after one move keeps everything else where it was", () => {
    const first = plan(loadDay());
    const previous: Record<string, string> = {};
    for (const t of first.trips)
      for (const id of t.orderIds) previous[id] = t.vehicleId;
    const moved = first.trips.find((t) => t.orderIds.includes("WF-0406-073A"));
    const target = first.trips.find(
      (t) => t.district === "Puttalam" && t.vehicleId !== moved?.vehicleId,
    );
    const res = plan({
      ...loadDay(),
      previous,
      pins: [
        {
          orderId: "WF-0406-029C",
          kind: "defer",
          reason: "Store closed for repairs",
        },
      ],
    });
    let changed = 0;
    for (const t of res.trips)
      for (const id of t.orderIds) if (previous[id] !== t.vehicleId) changed++;
    void target;
    // Only the deferred order and whatever filled its space may move.
    expect(changed).toBeLessThanOrEqual(3);
  });

  test("pins from a person survive a re-run", () => {
    const input: EngineInput = {
      ...loadDay(),
      pins: [
        {
          orderId: "WF-0406-029C",
          kind: "defer",
          reason: "Store asked to skip",
        },
      ],
    };
    const res = plan(input);
    const d = res.deferrals.find((x) => x.orderId === "WF-0406-029C");
    expect(d?.group).toBe("person");
    expect(d?.reason).toBe("Store asked to skip");
  });
});

describe("constraints", () => {
  const input = loadDay();

  test("chilled goods never go on a dry truck", () => {
    const res = checkVehicle(input, "VEH008", ["WF-0406-074C"]);
    expect(res.ok).toBe(false);
  });

  test("frozen orders require reefers and contribute to refrigerated demand", () => {
    const frozen: EngineInput = {
      ...input,
      orders: input.orders.map((o) =>
        o.temp === "chilled" ? { ...o, temp: "frozen" } : o,
      ),
    };
    expect(checkVehicle(frozen, "VEH008", ["WF-0406-074C"]).ok).toBe(false);
    const result = plan(frozen);
    expect(result.kpis.chilledDemandM3).toBeGreaterThan(0);
    expect(result.kpis.chilledPlannedM3).toBeGreaterThan(0);
    expect(validatePlan(frozen, result.trips, result.deferrals)).toEqual([]);
    for (const trip of result.trips) {
      if (
        trip.orderIds.some(
          (id) => frozen.orders.find((o) => o.id === id)?.temp === "frozen",
        )
      )
        expect(frozen.vehicles.find((v) => v.id === trip.vehicleId)?.temp).toBe(
          "reefer",
        );
    }
  });

  test("van-only outlets refuse trucks", () => {
    const res = checkVehicle(input, "VEH006", ["WF-0406-001C"]);
    expect(res).toEqual({
      ok: false,
      reason: "Van-only outlet, trucks can’t reach it",
    });
  });

  test("capacity is checked on volume and weight", () => {
    const big = input.orders
      .filter((o) => o.district === "Gampaha" && o.temp === "chilled")
      .map((o) => o.id);
    const res = checkVehicle(input, "VEH007", big);
    expect(res.ok).toBe(false);
  });

  test("windows: a Puttalam stop that closes before a truck can get there", () => {
    const tight: EngineInput = {
      ...input,
      orders: input.orders.map((o) =>
        o.id === "WF-0406-073A" ? { ...o, windowOpen: 0, windowClose: 30 } : o,
      ),
    };
    const res = checkVehicle(tight, "VEH007", ["WF-0406-073A"]);
    expect(res.ok).toBe(false);
  });

  test("fuel quota is enforced", () => {
    const dry: EngineInput = {
      ...input,
      vehicles: input.vehicles.map((v) =>
        v.id === "VEH007" ? { ...v, fuelUsedL: v.weeklyQuotaL - 5 } : v,
      ),
    };
    const res = checkVehicle(dry, "VEH007", ["WF-0406-074C"]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("L left this week");
  });

  test("move options list the blocking rule for each vehicle", () => {
    const res = plan(input);
    const assignment: Record<string, string | null> = {};
    for (const t of res.trips)
      for (const id of t.orderIds) assignment[id] = t.vehicleId;
    const opts = moveOptions(input, assignment, "WF-0406-074A");
    expect(opts.length).toBeGreaterThan(0);
    for (const o of opts) if (!o.ok) expect(o.reason).toBeTruthy();
  });
});

describe("publishing safeguards", () => {
  const input = loadDay();
  const result = plan(input);

  test("an order added after planning cannot silently disappear", () => {
    const changed = {
      ...input,
      orders: [
        ...input.orders,
        { ...input.orders[0], id: "ADDED-AFTER-DRAFT" },
      ],
    };
    expect(
      validatePlan(changed, result.trips, result.deferrals),
    ).toContainEqual({
      rule: "missing",
      text: "ADDED-AFTER-DRAFT is neither served nor deferred. Re-run the planner.",
      orderId: "ADDED-AFTER-DRAFT",
    });
  });

  test("deferrals must have a reason and cannot also be served", () => {
    const id = result.trips[0].orderIds[0];
    const violations = validatePlan(input, result.trips, [
      ...result.deferrals,
      { orderId: id, reason: "" },
    ]);
    expect(
      violations.some((v) => v.rule === "duplicate" && v.orderId === id),
    ).toBe(true);
    expect(
      violations.some((v) => v.rule === "deferral" && v.orderId === id),
    ).toBe(true);
  });

  test("draft input identity ignores row ordering and previous placement", () => {
    expect(
      planningInputKey({
        ...input,
        orders: [...input.orders].reverse(),
        vehicles: [...input.vehicles].reverse(),
        travel: [...input.travel].reverse(),
        previous: { [input.orders[0].id]: "VEH007" },
      }),
    ).toBe(planningInputKey(input));
  });

  test("changed order sizes, windows, fuel and decisions invalidate a draft", () => {
    const key = planningInputKey(input);
    for (const changed of [
      {
        ...input,
        orders: input.orders.map((o, i) =>
          i ? o : { ...o, weightKg: o.weightKg + 1 },
        ),
      },
      {
        ...input,
        orders: input.orders.map((o, i) =>
          i ? o : { ...o, windowClose: o.windowClose + 1 },
        ),
      },
      {
        ...input,
        vehicles: input.vehicles.map((v, i) =>
          i ? v : { ...v, fuelUsedL: 1 },
        ),
      },
      {
        ...input,
        pins: [
          {
            kind: "defer" as const,
            orderId: input.orders[0].id,
            reason: "Dispatcher decision",
          },
        ],
      },
    ])
      expect(planningInputKey(changed)).not.toBe(key);
  });
});
