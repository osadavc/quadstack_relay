import { db, schema as s } from "@relay/db";
import {
  clockOf,
  clockOn,
  dayLabel,
  hhmm,
  minutesOf,
  plural,
} from "@relay/domain";
import { and, asc, eq, inArray } from "drizzle-orm";
import { now, runDay } from "../clock";
import { progressOf } from "../progress";

/* The dock screen and the load sheet. */

const BODY = (v: { type: string; temp: string; volumeCapM3: number }) =>
  `${v.temp === "reefer" ? "Reefer" : "Dry"} ${v.type} · ${v.volumeCapM3.toFixed(1)} m³`;

export async function dockQueue(depot: string) {
  const t = now();
  const day = await runDay(depot);
  const clock = minutesOf(t, day);
  const runs = await db
    .select()
    .from(s.tripRuns)
    .where(and(eq(s.tripRuns.day, day), eq(s.tripRuns.depot, depot)))
    .orderBy(asc(s.tripRuns.depart), asc(s.tripRuns.vehicleId));
  const [plan] = await db
    .select()
    .from(s.plans)
    .where(
      and(
        eq(s.plans.day, day),
        eq(s.plans.depot, depot),
        eq(s.plans.status, "published"),
      ),
    );
  if (!runs.length)
    return {
      day,
      dayLabel: dayLabel(day),
      clock: hhmm(t),
      version: null,
      window: null,
      cards: [],
    };

  const ids = runs.map((r) => r.id);
  const stops = await db
    .select()
    .from(s.stopRuns)
    .where(inArray(s.stopRuns.tripRunId, ids));
  const units = await db
    .select()
    .from(s.loadUnits)
    .where(inArray(s.loadUnits.tripRunId, ids));
  const vehicles = new Map(
    (await db.select().from(s.vehicles)).map((v) => [v.id, v]),
  );
  const users = new Map(
    (await db.select().from(s.users)).map((u) => [u.id, u]),
  );

  const cards = runs.map((run) => {
    const v = vehicles.get(run.vehicleId);
    const ru = units.filter((u) => u.tripRunId === run.id);
    const rs = stops.filter((st) => st.tripRunId === run.id);
    const done = ru.filter((u) => u.status !== "pending").length;
    const p = progressOf(run, rs, clock, ru.length ? done / ru.length : 0);
    const cases = ru.reduce((a, u) => a + u.cases, 0);
    const loadedUnits = done;
    const released = ["released", "accepted", "on_road", "completed"].includes(
      p.status,
    );
    const accepted = ["accepted", "on_road", "completed"].includes(p.status);
    const left = run.depart - clock;
    const driver = run.driverId ? users.get(run.driverId) : undefined;
    const driverName = driver ? driver.name.split(" ")[0] : "the driver";
    const allLoaded = loadedUnits >= ru.length && ru.length > 0;
    const outletsCount = new Set(rs.map((st) => st.outletId)).size;
    const orderCount = rs.reduce((a, st) => a + st.orderIds.length, 0);
    return {
      id: run.id,
      vehicleId: run.vehicleId,
      tripNo: run.tripNo,
      reefer: v?.temp === "reefer",
      body: v ? BODY(v) : "",
      departs: clockOf(run.depart),
      eta: released
        ? accepted
          ? "on its way"
          : "released"
        : left < -30
          ? "overdue"
          : left <= 0
            ? "now"
            : left < 90
              ? `in ${left} min`
              : left < 12 * 60
                ? `in ${Math.floor(left / 60)} h ${String(left % 60).padStart(2, "0")} min`
                : dayLabel(day),
      urgent: !released && left <= 45,
      brand: run.brand,
      route: `${run.district} · ${plural(outletsCount, "outlet")} · ${plural(orderCount, "order")}`,
      temp: v?.temp === "reefer" ? run.reeferTempC : null,
      banner:
        !run.changeAcked && run.changeNote
          ? `Plan v${run.planVersion}: ${run.changeNote}`
          : null,
      status: released
        ? accepted
          ? `Released ${p.releasedAt !== null ? clockOn(day, p.releasedAt) : ""} · accepted by ${driverName}${p.acceptedAt !== null ? ` ${clockOn(day, p.acceptedAt)}` : ""}`
          : `Released to ${driverName} · waiting for scan`
        : allLoaded
          ? `All ${ru.length} orders loaded · ready to release`
          : `${loadedUnits === 0 ? "Not started" : "Loading"} · ${loadedUnits} of ${ru.length} orders · ${cases} units`,
      progress: released ? 1 : ru.length ? loadedUnits / ru.length : 0,
      allLoaded,
      released,
      accepted,
      started: loadedUnits > 0 || Boolean(run.loadingStartedAt),
      dock: run.dock,
      driver: driverName,
    };
  });
  return {
    day,
    dayLabel: dayLabel(day),
    clock: hhmm(t),
    version: plan?.version ?? null,
    window: `${clockOf(Math.min(...runs.filter((r) => r.tripNo === 1).map((r) => r.depart)))}–${clockOf(Math.max(...runs.filter((r) => r.tripNo === 1).map((r) => r.depart)))}`,
    cards,
  };
}

export type DockCard = Awaited<ReturnType<typeof dockQueue>>["cards"][number];

export async function loadSheet(runId: string) {
  const t = now();
  const [run] = await db
    .select()
    .from(s.tripRuns)
    .where(eq(s.tripRuns.id, runId));
  if (!run) return null;
  const [v] = await db
    .select()
    .from(s.vehicles)
    .where(eq(s.vehicles.id, run.vehicleId));
  const stops = await db
    .select()
    .from(s.stopRuns)
    .where(eq(s.stopRuns.tripRunId, runId))
    .orderBy(asc(s.stopRuns.seq));
  const units = await db
    .select()
    .from(s.loadUnits)
    .where(eq(s.loadUnits.tripRunId, runId));
  const shortfalls = await db
    .select()
    .from(s.shortfalls)
    .where(eq(s.shortfalls.tripRunId, runId));
  const outlets = stops.length
    ? await db
        .select()
        .from(s.outlets)
        .where(
          inArray(
            s.outlets.id,
            stops.map((st) => st.outletId),
          ),
        )
    : [];
  const orders = stops.length
    ? await db
        .select()
        .from(s.orders)
        .where(
          inArray(
            s.orders.id,
            stops.flatMap((st) => st.orderIds),
          ),
        )
    : [];
  const userRows = await db.select().from(s.users);
  const users = new Map(userRows.map((u) => [u.id, u]));
  const driver = run.driverId ? users.get(run.driverId) : undefined;
  const releasedBy = run.releasedBy ? users.get(run.releasedBy) : undefined;
  const lastSeq = stops.length;
  // Who hears about a shortfall the moment it is saved.
  const dispatcher = userRows.find(
    (u) => u.role === "dispatcher" && u.depot === run.depot,
  );
  const stores = Object.fromEntries(
    outlets.map((o) => {
      const m = userRows.find((u) => u.role === "store" && u.outletId === o.id);
      return [o.id, { name: m?.name ?? `${o.name} store`, outlet: o.name }];
    }),
  );

  // Last stop goes in first, at the nose; the first stop's goods at the doors.
  const sections = [...stops]
    .sort((a, b) => b.seq - a.seq)
    .flatMap((st) => {
      const stopUnits = units.filter((u) => u.stopSeq === st.seq);
      const temps = ["ambient", "chilled", "frozen"] as const;
      // Within a stop, chilled goods go last so they are at the doors.
      return temps
        .map((temp) => ({
          temp,
          list: stopUnits.filter((u) => u.temp === temp),
        }))
        .filter((g) => g.list.length);
    })
    .map((g, i, all) => {
      const st = stops.find((x) => x.seq === g.list[0].stopSeq);
      const out = outlets.find((o) => o.id === st?.outletId);
      const orderIds = [...new Set(g.list.map((u) => u.orderId))];
      const cases = g.list.reduce((a, u) => a + u.cases, 0);
      const position =
        i === 0
          ? "Load first, deepest"
          : i === all.length - 1
            ? "Load last, at the doors"
            : `Load ${ordinal(i + 1)}`;
      const firstStop = st?.seq === 1;
      return {
        n: i + 1,
        stopSeq: st?.seq ?? 0,
        outletId: out?.id ?? "",
        outlet: out?.name ?? "",
        temp: g.temp,
        title: `${position} · Stop ${st?.seq} · ${out?.id} ${out?.name}`,
        phoneTitle: `${i === 0 ? "Deepest · " : i === all.length - 1 ? "At the doors · " : ""}Stop ${st?.seq} · ${out?.id} · ${g.temp}`,
        sub: `${orderIds.length === 1 ? `Order ${orderIds[0]}` : plural(orderIds.length, "order")} · ${cases} units${firstStop && i === all.length - 1 ? " · unloads first" : ""}`,
        volumeM3: g.list.reduce((a, u) => a + u.volumeM3, 0),
        units: g.list
          .sort((a, b) =>
            a.id.localeCompare(b.id, undefined, { numeric: true }),
          )
          .map((u) => {
            const sf = shortfalls.find((x) => x.unitId === u.id);
            return {
              id: u.id,
              name: u.name,
              kind: u.kind,
              orderId: u.orderId,
              cases: u.cases,
              volumeM3: u.volumeM3,
              status: u.status,
              loadedAt: u.loadedAt ? hhmm(u.loadedAt) : null,
              shortfall: sf
                ? {
                    cases: sf.cases,
                    reason: sf.reason,
                    at: hhmm(sf.recordedAt),
                    note: sf.note,
                    photo: Boolean(sf.photoId),
                  }
                : null,
            };
          }),
      };
    });

  const flat = sections.flatMap((sct) => sct.units);

  const status = run.status;
  const next = flat.find((u) => u.status === "pending")?.id ?? null;
  const total = flat.reduce((a, u) => a + u.volumeM3, 0);
  const released = ["released", "accepted", "on_road", "completed"].includes(
    status,
  );
  return {
    id: run.id,
    day: run.day,
    dayLabel: dayLabel(run.day),
    clock: hhmm(t),
    dock: run.dock,
    contacts: {
      driver: driver?.name ?? `${run.vehicleId} driver`,
      dispatcher: dispatcher?.name ?? "Dispatch",
      stores,
    },
    vehicleId: run.vehicleId,
    reefer: v?.temp === "reefer",
    body: v ? BODY(v) : "",
    capM3: v?.volumeCapM3 ?? 0,
    departs: clockOf(run.depart),
    district: run.district,
    driverName: driver?.name ?? `${run.vehicleId} driver`,
    hasDriver: Boolean(driver),
    driverInitials: driver ? initials(driver.name) : "DR",
    planVersion: run.planVersion,
    status,
    released,
    accepted: ["accepted", "on_road", "completed"].includes(status),
    releasedAt: run.releasedAt ? hhmm(run.releasedAt) : null,
    acceptedAt: run.acceptedAt ? hhmm(run.acceptedAt) : null,
    releasedBy: releasedBy?.name ?? null,
    seal: run.seal,
    temp: v?.temp === "reefer" ? run.reeferTempC : null,
    changeNote: run.changeNote,
    changeAcked: run.changeAcked,
    handoverCode: run.handoverCode ?? "",
    handoverToken: run.handoverToken ?? "",
    totals: {
      volumeM3: orders.reduce((a, o) => a + o.volumeM3, 0),
      weightKg: orders.reduce((a, o) => a + o.weightKg, 0),
      units: flat.length,
      done: flat.filter((u) => u.status !== "pending").length,
      flagged: flat.filter((u) => u.status === "flagged").length,
      shortCases: shortfalls.reduce((a, x) => a + x.cases, 0),
    },
    sections,
    next,
    free: Math.max(0, (v?.volumeCapM3 ?? 0) - total),
    lastSeq,
    shortfalls: shortfalls.map((x) => ({
      unitId: x.unitId,
      cases: x.cases,
      reason: x.reason,
      at: hhmm(x.recordedAt),
    })),
  };
}

export type LoadSheetData = NonNullable<Awaited<ReturnType<typeof loadSheet>>>;

const ordinal = (n: number) =>
  ["first", "second", "third", "fourth", "fifth", "sixth"][n - 1] ?? `${n}th`;
export const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
