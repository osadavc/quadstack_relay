import {
  type Ctx,
  evaluateVehicle,
  legalFor,
  type TripDraft,
} from "./schedule";
import type { EngineOrder, EngineVehicle, PlannedTrip } from "./types";

/*
 * Mutable working plan used while the engine builds and improves a plan.
 * Each vehicle keeps its trip drafts and the last good evaluation, so a
 * failed insertion never leaves the plan in a broken state.
 */

export interface VehicleState {
  v: EngineVehicle;
  trips: TripDraft[];
  planned: PlannedTrip[];
  liters: number;
}

export interface PlanState {
  vehicles: Map<string, VehicleState>;
  /** orderId → vehicleId for every served order. */
  placed: Map<string, string>;
}

export function emptyState(vehicles: EngineVehicle[]): PlanState {
  return {
    vehicles: new Map(
      vehicles.map((v) => [v.id, { v, trips: [], planned: [], liters: 0 }]),
    ),
    placed: new Map(),
  };
}

export function cloneState(s: PlanState): PlanState {
  const vehicles = new Map<string, VehicleState>();
  for (const [id, vs] of s.vehicles) {
    vehicles.set(id, {
      v: vs.v,
      trips: vs.trips.map((t) => ({ ...t, orders: [...t.orders] })),
      planned: vs.planned,
      liters: vs.liters,
    });
  }
  return { vehicles, placed: new Map(s.placed) };
}

export type Move =
  | { kind: "join"; vehicleId: string; tripIdx: number }
  | { kind: "open"; vehicleId: string };

/** Trips after adding `o` with `move`, or null when the move does not apply. */
export function tripsWith(
  vs: VehicleState,
  o: EngineOrder,
  move: Move,
): TripDraft[] | null {
  if (move.kind === "join") {
    const t = vs.trips[move.tripIdx];
    if (!t || t.brand !== o.brand || t.district !== o.district) return null;
    return vs.trips.map((x, i) =>
      i === move.tripIdx ? { ...x, orders: [...x.orders, o] } : x,
    );
  }
  if (vs.trips.length >= 2) return null;
  return [...vs.trips, { brand: o.brand, district: o.district, orders: [o] }];
}

/** Try a move; on success the state is updated and true is returned. */
export function tryApply(
  ctx: Ctx,
  s: PlanState,
  o: EngineOrder,
  move: Move,
): boolean {
  const vs = s.vehicles.get(move.vehicleId);
  if (!vs || legalFor(o, vs.v)) return false;
  const next = tripsWith(vs, o, move);
  if (!next) return false;
  const ev = evaluateVehicle(ctx, vs.v, next);
  if (!ev.ok) return false;
  vs.trips = next;
  vs.planned = ev.trips;
  vs.liters = ev.liters;
  s.placed.set(o.id, vs.v.id);
  return true;
}

/** Remove an order from the plan, dropping its trip if it empties. */
export function removeOrder(ctx: Ctx, s: PlanState, orderId: string): boolean {
  const vid = s.placed.get(orderId);
  if (!vid) return false;
  const vs = s.vehicles.get(vid);
  if (!vs) return false;
  const next = vs.trips
    .map((t) => ({ ...t, orders: t.orders.filter((o) => o.id !== orderId) }))
    .filter((t) => t.orders.length > 0);
  if (next.length === 0) {
    vs.trips = [];
    vs.planned = [];
    vs.liters = 0;
  } else {
    const ev = evaluateVehicle(ctx, vs.v, next);
    // Removing a stop can only make a schedule easier, but stay safe.
    if (!ev.ok) return false;
    vs.trips = next;
    vs.planned = ev.trips;
    vs.liters = ev.liters;
  }
  s.placed.delete(orderId);
  return true;
}

export function allTrips(s: PlanState): PlannedTrip[] {
  const out: PlannedTrip[] = [];
  for (const vs of s.vehicles.values()) out.push(...vs.planned);
  return out;
}
