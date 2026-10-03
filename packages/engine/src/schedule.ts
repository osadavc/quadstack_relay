import type {
  AllowanceMap,
  DistrictTravel,
  EngineOrder,
  EngineSettings,
  EngineVehicle,
  PlannedStop,
  PlannedTrip,
} from "./types";

/*
 * Turning a set of orders on a vehicle into a timed plan.
 *
 * Planning uses Waypoint's own standard, the same one behind the planned
 * times in the route records: free-flow travel from district_travel.csv and
 * the handling allowance from service_allowance.csv. A trip leaves the depot,
 * drives to one district, serves its outlets in window order and drives back.
 * A vehicle that arrives early waits for the window to open; arriving after
 * the window closes is not allowed.
 */

const EPS = 1e-6;

export interface Ctx {
  travel: Map<string, DistrictTravel>;
  allowance: AllowanceMap;
  settings: EngineSettings;
}

export type FailCode =
  | "depot"
  | "temp"
  | "access"
  | "mix"
  | "volume"
  | "weight"
  | "window"
  | "trips"
  | "return"
  | "fuel"
  | "travel";

export interface Failure {
  code: FailCode;
  text: string;
  /** Extra numbers for the explanation, e.g. a trip's load. */
  data?: Record<string, number | string>;
}

export interface TripDraft {
  brand: EngineOrder["brand"];
  district: string;
  orders: EngineOrder[];
}

export type VehicleEval =
  | { ok: true; trips: PlannedTrip[]; liters: number }
  | { ok: false; failure: Failure };

export const allowanceFor = (ctx: Ctx, o: EngineOrder) =>
  ctx.allowance[`${o.brand}|${o.dockType}`] ?? 20;

/** Rules no packing can change: home depot, refrigeration and van access. */
export function legalFor(o: EngineOrder, v: EngineVehicle): Failure | null {
  if (o.depot !== v.depot)
    return { code: "depot", text: `${v.id} is based at ${v.depot}` };
  if (o.temp === "chilled" && v.temp !== "reefer")
    return { code: "temp", text: `${v.id} has no refrigeration` };
  if (o.vanOnly && v.type !== "van")
    return { code: "access", text: "Van-only outlet, trucks can’t reach it" };
  return null;
}

interface StopDraft {
  outletId: string;
  orderIds: string[];
  open: number;
  close: number;
  service: number;
  chilled: boolean;
}

/** One stop per outlet. The visiting order is chosen in `timeBest`. */
function stopsFor(ctx: Ctx, orders: EngineOrder[]): StopDraft[] {
  const byOutlet = new Map<string, StopDraft>();
  for (const o of orders) {
    const s = byOutlet.get(o.outletId);
    if (s) {
      s.orderIds.push(o.id);
      s.service += allowanceFor(ctx, o);
      if (o.temp === "chilled") s.chilled = true;
    } else {
      byOutlet.set(o.outletId, {
        outletId: o.outletId,
        orderIds: [o.id],
        open: o.windowOpen,
        close: o.windowClose,
        service: allowanceFor(ctx, o),
        chilled: o.temp === "chilled",
      });
    }
  }
  return [...byOutlet.values()];
}

interface TimedTrip {
  stops: PlannedStop[];
  depart: number;
  lastServiceEnd: number;
  returnAt: number;
  km: number;
}

function timeStops(
  stops: StopDraft[],
  t: DistrictTravel,
  earliest: number,
): TimedTrip | Failure {
  // Leave so the first stop opens as the truck arrives; never before `earliest`.
  const depart = Math.max(earliest, stops[0].open - t.depotMin);
  let clock = depart + t.depotMin;
  const out: PlannedStop[] = [];
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    if (i > 0) clock += t.interMin;
    if (clock > s.close + EPS) {
      return {
        code: "window",
        text: `Arrives ${fmt(clock)}, after ${s.outletId} closes at ${fmt(s.close)}`,
        data: { arrive: clock, close: s.close, outlet: s.outletId },
      };
    }
    const start = Math.max(clock, s.open);
    out.push({
      outletId: s.outletId,
      orderIds: s.orderIds,
      arrive: clock,
      serviceStart: start,
      serviceEnd: start + s.service,
      waitMin: start - clock,
      windowOpen: s.open,
      windowClose: s.close,
    });
    clock = start + s.service;
  }
  return {
    stops: out,
    depart,
    lastServiceEnd: clock,
    returnAt: clock + t.depotMin,
    km: t.depotKm * 2 + t.interKm * Math.max(0, stops.length - 1),
  };
}

const fmt = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m) % 60).padStart(2, "0")}`;

const isFailure = (x: TimedTrip | Failure): x is Failure => "code" in x;

const byClose = (a: StopDraft, b: StopDraft) =>
  a.close - b.close || a.open - b.open || a.outletId.localeCompare(b.outletId);
const byOpen = (a: StopDraft, b: StopDraft) =>
  a.open - b.open || a.close - b.close || a.outletId.localeCompare(b.outletId);

/**
 * Pick the visiting order. Travel between outlets in a district is the same
 * for every pair, so only the windows matter. A few orderings are tried
 * (earliest closing, earliest opening, chilled first) and the feasible one
 * that finishes first wins; on a tie, chilled goods come off the truck first.
 */
function timeBest(
  stops: StopDraft[],
  t: DistrictTravel,
  earliest: number,
): TimedTrip | Failure {
  if (stops.length === 1) return timeStops(stops, t, earliest);
  const chilledFirst = (a: StopDraft, b: StopDraft) =>
    Number(b.chilled) - Number(a.chilled) || byOpen(a, b);
  const orders = [
    [...stops].sort(byClose),
    [...stops].sort(byOpen),
    [...stops].sort(chilledFirst),
  ];
  let best: TimedTrip | null = null;
  let bestKey = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  let firstFailure: Failure | null = null;
  for (const seq of orders) {
    const r = timeStops(seq, t, earliest);
    if (isFailure(r)) {
      firstFailure ??= r;
      continue;
    }
    const chilledAt = r.stops.reduce(
      (a, s, i) => a + (seq[i].chilled ? s.arrive : 0),
      0,
    );
    const key = [r.lastServiceEnd, chilledAt];
    if (
      key[0] < bestKey[0] - EPS ||
      (Math.abs(key[0] - bestKey[0]) < EPS && key[1] < bestKey[1])
    ) {
      best = r;
      bestKey = key;
    }
  }
  return best ?? (firstFailure as Failure);
}

/**
 * Schedule every trip on one vehicle and check capacity, windows, the
 * two-trip limit, the return time and the weekly fuel quota.
 */
export function evaluateVehicle(
  ctx: Ctx,
  v: EngineVehicle,
  trips: TripDraft[],
): VehicleEval {
  if (trips.length > 2)
    return { ok: false, failure: { code: "trips", text: "Two trips a day" } };

  const prepared: {
    draft: TripDraft;
    stops: StopDraft[];
    t: DistrictTravel;
  }[] = [];
  for (const draft of trips) {
    const t = ctx.travel.get(draft.district);
    if (!t) {
      return {
        ok: false,
        failure: {
          code: "travel",
          text: `No travel data for ${draft.district}`,
        },
      };
    }
    let vol = 0;
    let wt = 0;
    for (const o of draft.orders) {
      vol += o.volumeM3;
      wt += o.weightKg;
    }
    if (vol > v.volumeCapM3 + EPS) {
      return {
        ok: false,
        failure: {
          code: "volume",
          text: `${round(vol)} m³ exceeds ${v.id}’s ${v.volumeCapM3} m³`,
          data: { load: vol, cap: v.volumeCapM3 },
        },
      };
    }
    if (wt > v.weightCapKg + EPS) {
      return {
        ok: false,
        failure: {
          code: "weight",
          text: `${Math.round(wt).toLocaleString("en-GB")} kg exceeds ${v.id}’s ${v.weightCapKg.toLocaleString("en-GB")} kg`,
          data: { load: wt, cap: v.weightCapKg },
        },
      };
    }
    prepared.push({ draft, stops: stopsFor(ctx, draft.orders), t });
  }

  // Try the trips in window order first, then the other way round.
  const orders =
    prepared.length === 2
      ? [
          [0, 1],
          [1, 0],
        ].sort(
          (a, b) =>
            Math.min(...prepared[a[0]].stops.map((x) => x.close)) -
            Math.min(...prepared[b[0]].stops.map((x) => x.close)),
        )
      : [[0]];

  let lastFailure: Failure | null = null;
  for (const seq of orders) {
    let earliest = ctx.settings.earliestDepart;
    const timed: { idx: number; tt: TimedTrip }[] = [];
    let failed: Failure | null = null;
    for (const idx of seq) {
      const p = prepared[idx];
      const tt = timeBest(p.stops, p.t, earliest);
      if (isFailure(tt)) {
        failed = tt;
        break;
      }
      if (tt.returnAt > ctx.settings.latestReturn + EPS) {
        failed = {
          code: "return",
          text: `Back at the depot ${fmt(tt.returnAt)}, after ${fmt(ctx.settings.latestReturn)}`,
        };
        break;
      }
      timed.push({ idx, tt });
      earliest = tt.returnAt + ctx.settings.reloadMin;
    }
    if (failed) {
      lastFailure = failed;
      continue;
    }

    let liters = 0;
    const planned: PlannedTrip[] = timed.map(({ idx, tt }, n) => {
      const { draft } = prepared[idx];
      const l = tt.km / v.kmPerL;
      liters += l;
      let vol = 0;
      let wt = 0;
      let chilled = 0;
      for (const o of draft.orders) {
        vol += o.volumeM3;
        wt += o.weightKg;
        if (o.temp === "chilled") chilled += o.volumeM3;
      }
      return {
        vehicleId: v.id,
        tripNo: (n + 1) as 1 | 2,
        brand: draft.brand,
        district: draft.district,
        orderIds: tt.stops.flatMap((s) => s.orderIds),
        stops: tt.stops,
        depart: tt.depart,
        lastServiceEnd: tt.lastServiceEnd,
        returnAt: tt.returnAt,
        km: tt.km,
        liters: l,
        volumeM3: vol,
        weightKg: wt,
        chilledM3: chilled,
      };
    });

    const remaining = v.weeklyQuotaL - v.fuelUsedL;
    if (liters > remaining + EPS) {
      return {
        ok: false,
        failure: {
          code: "fuel",
          text: `Needs ${Math.round(liters)} L, ${Math.round(Math.max(0, remaining))} L left this week`,
          data: { liters, remaining },
        },
      };
    }
    return { ok: true, trips: planned, liters };
  }
  return {
    ok: false,
    failure: lastFailure ?? { code: "window", text: "No feasible schedule" },
  };
}

const round = (n: number) => Math.round(n * 10) / 10;
