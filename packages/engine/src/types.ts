/*
 * Inputs and outputs of the Relay allocation engine. Everything is plain data
 * so the engine runs the same in a server action, a test or a script.
 * Times are minutes after midnight on the delivery day (03:30 = 210).
 */

export type Brand = "Fresh" | "Style" | "Tech";
export type Temp = "chilled" | "ambient";
export type DockType = "rear_dock" | "street" | "mall_bay";
export type VehicleType = "truck" | "van";
export type VehicleTemp = "reefer" | "ambient";

export interface EngineOrder {
  id: string;
  outletId: string;
  brand: Brand;
  district: string;
  depot: string;
  temp: Temp;
  units: number;
  weightKg: number;
  volumeM3: number;
  /** Delivery window, minutes after midnight. Mall outlets carry the mall window here. */
  windowOpen: number;
  windowClose: number;
  dockType: DockType;
  vanOnly: boolean;
  /** Runs in a row this order stream (outlet + temperature) was deferred. */
  consecutiveSkips: number;
  /** Days since this outlet last received this kind of goods. */
  daysSinceServed: number;
}

export interface EngineVehicle {
  id: string;
  type: VehicleType;
  temp: VehicleTemp;
  weightCapKg: number;
  volumeCapM3: number;
  kmPerL: number;
  weeklyQuotaL: number;
  /** Litres already used this ISO week, before today's plan. */
  fuelUsedL: number;
  depot: string;
}

export interface DistrictTravel {
  district: string;
  depot: string;
  depotKm: number;
  depotMin: number;
  interKm: number;
  interMin: number;
}

/** Service allowance in minutes, keyed `${brand}|${dockType}`. */
export type AllowanceMap = Record<string, number>;

export type PolicyId = "fairness" | "fill" | "routes";

export interface EngineSettings {
  /** Earliest departure for any trip, minutes after midnight. */
  earliestDepart: number;
  /** Minutes at the depot between a vehicle's two trips. */
  reloadMin: number;
  /** Every vehicle is back at the depot by this time. */
  latestReturn: number;
  /** Dry trucks kept out of the plan to cover a breakdown. */
  spareDryTrucks: number;
  /** Randomised construction passes; the best plan wins. */
  iterations: number;
  seed: number;
}

/*
 * The brief sets no departure time, reload time, return time or spare
 * vehicle, so by default none is imposed: a trip may leave from midnight,
 * the second trip may leave as soon as the first is back, every trip ends
 * within the day, and the whole available fleet is planned.
 */
export const DEFAULT_SETTINGS: EngineSettings = {
  earliestDepart: 0,
  reloadMin: 0,
  latestReturn: 24 * 60,
  spareDryTrucks: 0,
  iterations: 240,
  seed: 1,
};

/** A decision made by a person, which every re-run must respect. */
export type Pin =
  | { orderId: string; kind: "vehicle"; vehicleId: string; note?: string }
  | { orderId: string; kind: "defer"; reason: string };

export interface EngineInput {
  date: string;
  depot: string;
  orders: EngineOrder[];
  vehicles: EngineVehicle[];
  travel: DistrictTravel[];
  allowance: AllowanceMap;
  policy: PolicyId;
  pins?: Pin[];
  /**
   * The vehicle each order had in the plan being replaced. Re-runs keep
   * orders where they were when nothing is gained by moving them, so a
   * decision or a manual move doesn't reshuffle trucks the dock is loading.
   */
  previous?: Record<string, string>;
  settings?: Partial<EngineSettings>;
}

export interface PlannedStop {
  outletId: string;
  orderIds: string[];
  arrive: number;
  serviceStart: number;
  serviceEnd: number;
  waitMin: number;
  windowOpen: number;
  windowClose: number;
}

export interface PlannedTrip {
  vehicleId: string;
  tripNo: 1 | 2;
  brand: Brand;
  district: string;
  orderIds: string[];
  stops: PlannedStop[];
  depart: number;
  lastServiceEnd: number;
  returnAt: number;
  km: number;
  liters: number;
  volumeM3: number;
  weightKg: number;
  chilledM3: number;
}

export type DeferralGroup =
  | "reefer"
  | "van"
  | "window"
  | "capacity"
  | "fuel"
  | "oversize"
  | "person";

export interface Deferral {
  orderId: string;
  group: DeferralGroup;
  /** One line a dispatcher and a store manager can both read. */
  reason: string;
  /** A second skip in a row for this outlet: a person must decide. */
  needsDecision: boolean;
}

export type CheckResult = { ok: boolean; text: string };

export type DecisionOption =
  | {
      kind: "swap";
      withOrderId: string;
      vehicleId: string;
      tripNo: 1 | 2;
      feasible: boolean;
      checks: CheckResult[];
      /** Trip load after the swap. */
      loadAfterM3: number;
      capacityM3: number;
      recommended: boolean;
    }
  | {
      /** Send one of a reefer's trips to this district instead. */
      kind: "redirect";
      vehicleId: string;
      tripNos: (1 | 2)[];
      fromDistricts: string[];
      /** Orders the redirected trip carries, the flagged one first. */
      serves: string[];
      /** Orders that come off the vehicle and go back to the planner. */
      displaced: string[];
      /** Displaced orders whose outlet was also skipped last run. */
      newSecondSkips: string[];
      feasible: boolean;
      checks: CheckResult[];
      loadAfterM3: number;
      capacityM3: number;
      recommended: boolean;
    }
  | {
      kind: "add";
      vehicleId: string;
      feasible: boolean;
      checks: CheckResult[];
    }
  | { kind: "defer" };

export interface Decision {
  orderId: string;
  kind: "second_skip" | "protected_unplaced";
  /** The trip the order came closest to, for the "why" bar. */
  closest: {
    vehicleId: string;
    tripNo: 1 | 2;
    district: string;
    loadM3: number;
    capacityM3: number;
  } | null;
  options: DecisionOption[];
}

export interface PlanKpis {
  orders: number;
  served: number;
  deferred: number;
  chilledDemandM3: number;
  chilledPlannedM3: number;
  totalDemandM3: number;
  totalPlannedM3: number;
  vehiclesAvailable: number;
  vehiclesUsed: number;
  reefersAvailable: number;
  reefersAtLimit: number;
  dryIdle: number;
  spareHeld: string[];
  /** Highest share of weekly fuel quota after today's plan. */
  fuelPeak: { vehicleId: string; share: number; district: string } | null;
  fuelWithinQuota: boolean;
  km: number;
  liters: number;
}

export interface PlanResult {
  trips: PlannedTrip[];
  deferrals: Deferral[];
  decisions: Decision[];
  kpis: PlanKpis;
  stats: { iterations: number; ms: number; score: number[] };
}
