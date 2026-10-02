import type { schema as s } from "@relay/db";
import { minutesOf } from "@relay/domain";

/*
 * Where a trip is right now, from its records: the dock's ticks, the
 * handover, and the driver's arrivals and proof of delivery. Expected times
 * for stops not yet reached are the plan's, shifted by how late the last
 * arrival was. A phone that has not been heard from for a few minutes while
 * the truck is on the road is out of contact.
 */

type Run = typeof s.tripRuns.$inferSelect;
type Stop = typeof s.stopRuns.$inferSelect;

/** Minutes without a heartbeat before a truck on the road is out of contact. */
export const OUT_OF_CONTACT_MIN = 3;

export type StopState = "done" | "current" | "pending" | "failed";

export interface StopProgress {
  seq: number;
  outletId: string;
  state: StopState;
  arrivedAt: number | null;
  completedAt: number | null;
  /** Actual arrival if there is one, else the plan plus the running delay. */
  expected: number;
  windowOpen: number;
  windowClose: number;
  late: boolean;
  atRisk: boolean;
}

export interface RunProgress {
  /** The run's day: every minute value below counts from its midnight. */
  day: string;
  status: Run["status"];
  loadedShare: number;
  departedAt: number | null;
  releasedAt: number | null;
  acceptedAt: number | null;
  stops: StopProgress[];
  done: number;
  delay: number;
  lastHeard: number | null;
  location: { lat: number; lng: number } | null;
  offline: boolean;
  completedAt: number | null;
}

const opsMin = (ts: string | null | undefined, day: string) =>
  ts ? minutesOf(ts, day) : null;

/**
 * @param now  the current time in minutes after midnight of the run's day
 *             (negative before that day, above 1440 after it)
 */
export function progressOf(
  run: Run,
  stops: Stop[],
  now: number,
  unitShare = 0,
): RunProgress {
  const day = run.day;
  const ordered = [...stops].sort((a, b) => a.seq - b.seq);
  const onRoad = run.status === "on_road" || run.status === "accepted";
  let delay = 0;
  let currentSet = false;
  const out: StopProgress[] = ordered.map((st) => {
    const arrivedAt = opsMin(st.arrivedAt, day);
    const completedAt = opsMin(st.completedAt, day);
    if (arrivedAt !== null) delay = Math.max(0, arrivedAt - st.eta);
    let state: StopState = "pending";
    if (st.status === "completed") state = "done";
    else if (st.status === "failed") state = "failed";
    else if (!currentSet && onRoad) {
      state = "current";
      currentSet = true;
    }
    let expected = arrivedAt ?? st.eta + delay;
    // Past the expected time and not there yet: it can't be earlier than now.
    if (arrivedAt === null && state !== "done" && onRoad && now > expected)
      expected = now;
    return {
      seq: st.seq,
      outletId: st.outletId,
      state,
      arrivedAt,
      completedAt,
      expected,
      windowOpen: st.windowOpen,
      windowClose: st.windowClose,
      late: arrivedAt !== null && arrivedAt > st.windowClose,
      atRisk:
        arrivedAt === null &&
        state !== "done" &&
        state !== "failed" &&
        expected > st.windowClose,
    };
  });
  const lastHeard = opsMin(run.lastHeardAt, day);
  return {
    day,
    status: run.status,
    loadedShare: ["released", "accepted", "on_road", "completed"].includes(
      run.status,
    )
      ? 1
      : unitShare,
    departedAt: opsMin(run.departedAt, day),
    releasedAt: opsMin(run.releasedAt, day),
    acceptedAt: opsMin(run.acceptedAt, day),
    stops: out,
    done: out.filter((x) => x.state === "done").length,
    delay,
    lastHeard,
    location:
      run.lastLat != null && run.lastLng != null
        ? { lat: run.lastLat, lng: run.lastLng }
        : null,
    offline:
      run.status === "on_road" &&
      lastHeard !== null &&
      now - lastHeard > OUT_OF_CONTACT_MIN,
    completedAt: opsMin(run.completedAt, day),
  };
}

export const mapLink = (loc: { lat: number; lng: number }) =>
  `https://www.openstreetmap.org/?mlat=${loc.lat.toFixed(5)}&mlon=${loc.lng.toFixed(5)}#map=14/${loc.lat.toFixed(5)}/${loc.lng.toFixed(5)}`;
