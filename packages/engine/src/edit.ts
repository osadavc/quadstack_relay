import {
  type Ctx,
  evaluateVehicle,
  legalFor,
  type TripDraft,
} from "./schedule";
import {
  DEFAULT_SETTINGS,
  type EngineInput,
  type EngineOrder,
  type PlannedTrip,
} from "./types";

/*
 * Manual planning with validation. The dispatcher can move one order to
 * another vehicle (or defer it) on a draft plan; only the two vehicles
 * involved are re-timed, and the move is refused with the blocking rule if
 * it breaks any constraint.
 */

export type Assignment = Record<string, string | null>;

function ctxFor(input: EngineInput): Ctx {
  return {
    travel: new Map(input.travel.map((t) => [t.district, t])),
    allowance: input.allowance,
    settings: { ...DEFAULT_SETTINGS, ...input.settings },
  };
}

/** Group a vehicle's orders into trips: one per brand and district. */
function draftsFor(orders: EngineOrder[]): TripDraft[] {
  const groups = new Map<string, TripDraft>();
  for (const o of orders) {
    const key = `${o.brand}|${o.district}`;
    const g = groups.get(key);
    if (g) g.orders.push(o);
    else groups.set(key, { brand: o.brand, district: o.district, orders: [o] });
  }
  return [...groups.values()];
}

export type VehicleCheck =
  | { ok: true; trips: PlannedTrip[] }
  | { ok: false; reason: string };

export function checkVehicle(
  input: EngineInput,
  vehicleId: string,
  orderIds: string[],
): VehicleCheck {
  const v = input.vehicles.find((x) => x.id === vehicleId);
  if (!v) return { ok: false, reason: `Unknown vehicle ${vehicleId}` };
  const byId = new Map(input.orders.map((o) => [o.id, o]));
  const orders = orderIds
    .map((id) => byId.get(id))
    .filter((o): o is EngineOrder => !!o);
  for (const o of orders) {
    const bad = legalFor(o, v);
    if (bad) return { ok: false, reason: bad.text };
  }
  if (orders.length === 0) return { ok: true, trips: [] };
  const drafts = draftsFor(orders);
  if (drafts.length > 2)
    return {
      ok: false,
      reason: `${vehicleId} would need ${drafts.length} trips (limit is 2)`,
    };
  const ev = evaluateVehicle(ctxFor(input), v, drafts);
  return ev.ok
    ? { ok: true, trips: ev.trips }
    : { ok: false, reason: ev.failure.text };
}

export interface MoveOption {
  vehicleId: string;
  ok: boolean;
  reason?: string;
  /** Load of the trip the order would join, after the move. */
  loadM3?: number;
  capM3?: number;
}

/** Every vehicle the order could move to, feasible ones first. */
export function moveOptions(
  input: EngineInput,
  assignment: Assignment,
  orderId: string,
): MoveOption[] {
  const order = input.orders.find((o) => o.id === orderId);
  if (!order) return [];
  const current = assignment[orderId] ?? null;
  const out: MoveOption[] = [];
  for (const v of input.vehicles) {
    if (v.depot !== order.depot || v.id === current) continue;
    const ids = Object.entries(assignment)
      .filter(([, vid]) => vid === v.id)
      .map(([id]) => id);
    const res = checkVehicle(input, v.id, [...ids, orderId]);
    if (res.ok) {
      const trip = res.trips.find((t) => t.orderIds.includes(orderId));
      out.push({
        vehicleId: v.id,
        ok: true,
        loadM3: trip?.volumeM3,
        capM3: v.volumeCapM3,
      });
    } else {
      out.push({ vehicleId: v.id, ok: false, reason: res.reason });
    }
  }
  return out.sort(
    (a, b) =>
      Number(b.ok) - Number(a.ok) ||
      (a.ok && b.ok ? (b.loadM3 ?? 0) - (a.loadM3 ?? 0) : 0) ||
      a.vehicleId.localeCompare(b.vehicleId),
  );
}
