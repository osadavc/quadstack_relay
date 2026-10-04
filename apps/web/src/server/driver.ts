import { db, schema as s, type Tx } from "@relay/db";
import {
  cmpOps,
  dayLabel,
  maxOps,
  minutesBetween,
  normalizeOps,
  opsAt,
  plural,
  TEMP_LABEL,
} from "@relay/domain";
import { and, asc, desc, eq, inArray, ne, or } from "drizzle-orm";
import { z } from "zod";
import type { User } from "./auth";
import { now, revision, touch, vehicleDay, workingDay } from "./clock";
import { saveMedia } from "./media";
import { arrivalBand } from "./planning";
import { logEvent, notify } from "./record";

/*
 * The driver's phone works offline. It keeps a snapshot of the run and an
 * outbox of records, each with an id made on the phone and the time it was
 * recorded. When signal returns the outbox is sent in order; the server
 * applies each record once (a retry is recognised by its id) and keeps the
 * phone's time, so the record shows when things happened, not when they
 * arrived.
 */

export const recordSchema = z.object({
  clientId: z.string().min(6).max(64),
  kind: z.enum([
    "accept",
    "depart",
    "arrive",
    "complete",
    "problem",
    "signal",
    "reconcile",
  ]),
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/),
  offline: z.boolean().default(false),
  runId: z.string().uuid().optional(),
  seq: z.number().int().positive().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type DriverRecord = z.infer<typeof recordSchema>;

export class DriverError extends Error {}

const outletLine = (o: { id: string; name: string }) => `${o.id} ${o.name}`;

/* ------------------------------------------------------------------ */
/* Snapshot                                                            */
/* ------------------------------------------------------------------ */

export async function driverSnapshot(user: User) {
  const day = user.vehicleId
    ? await vehicleDay(user.vehicleId, user.depot ?? "")
    : await workingDay(user.depot ?? undefined);
  const runs = user.vehicleId
    ? await db
        .select()
        .from(s.tripRuns)
        .where(
          and(
            eq(s.tripRuns.day, day),
            eq(s.tripRuns.vehicleId, user.vehicleId),
          ),
        )
        .orderBy(asc(s.tripRuns.tripNo))
    : [];
  const run = runs.find((r) => r.status !== "completed") ?? runs.at(-1) ?? null;

  const [dispatcher] = await db
    .select()
    .from(s.users)
    .where(
      and(
        eq(s.users.role, "dispatcher"),
        eq(s.users.depot, user.depot ?? ""),
        eq(s.users.active, true),
      ),
    )
    .limit(1);
  const base = {
    clock: now(),
    day,
    revision: await revision(),
    epoch: "1",
    driver: { id: user.id, name: user.name, vehicleId: user.vehicleId },
    dispatch: {
      name: dispatcher?.name ?? "Dispatch",
      role: user.depot ? `Dispatch · ${user.depot}` : "Dispatch",
      phone: dispatcher?.phone ?? null,
    },
    otherTrips: runs
      .filter((r) => r.id !== run?.id)
      .map((r) => ({
        id: r.id,
        tripNo: r.tripNo,
        district: r.district,
        depart: r.depart,
        status: r.status,
      })),
  };
  if (!run)
    return {
      ...base,
      run: null,
      messages: [],
      reconciliations: [],
      notices: [],
    };

  const [vehicle] = await db
    .select()
    .from(s.vehicles)
    .where(eq(s.vehicles.id, run.vehicleId));
  const stops = await db
    .select()
    .from(s.stopRuns)
    .where(eq(s.stopRuns.tripRunId, run.id))
    .orderBy(asc(s.stopRuns.seq));
  const orderIds = stops.flatMap((st) => st.orderIds);
  const outlets = orderIds.length
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
  const orders = orderIds.length
    ? await db.select().from(s.orders).where(inArray(s.orders.id, orderIds))
    : [];
  const units = await db
    .select()
    .from(s.loadUnits)
    .where(eq(s.loadUnits.tripRunId, run.id));
  const shortfalls = await db
    .select()
    .from(s.shortfalls)
    .where(eq(s.shortfalls.tripRunId, run.id));
  const managers = outlets.length
    ? await db
        .select()
        .from(s.users)
        .where(
          and(
            eq(s.users.role, "store"),
            inArray(
              s.users.outletId,
              outlets.map((o) => o.id),
            ),
          ),
        )
    : [];
  const [loader] = run.releasedBy
    ? await db.select().from(s.users).where(eq(s.users.id, run.releasedBy))
    : [];
  const messages = await db
    .select({ m: s.messages, from: s.users.name })
    .from(s.messages)
    .leftJoin(s.users, eq(s.users.id, s.messages.fromUser))
    .where(eq(s.messages.tripRunId, run.id))
    .orderBy(desc(s.messages.sentAt));
  const recs = orderIds.length
    ? await db
        .select()
        .from(s.reconciliations)
        .where(inArray(s.reconciliations.orderId, orderIds))
    : [];
  const receipts = orderIds.length
    ? await db
        .select()
        .from(s.receipts)
        .where(inArray(s.receipts.orderId, orderIds))
    : [];
  const notices = await db
    .select()
    .from(s.notifications)
    .where(eq(s.notifications.audience, `user:${user.id}`))
    .orderBy(desc(s.notifications.at))
    .limit(12);

  return {
    ...base,
    run: {
      id: run.id,
      vehicleId: run.vehicleId,
      tripNo: run.tripNo,
      day: run.day,
      dayLabel: dayLabel(run.day),
      district: run.district,
      depot: run.depot,
      depart: run.depart,
      status: run.status,
      seal: run.seal,
      reeferTempC: run.reeferTempC,
      releasedAt: run.releasedAt,
      acceptedAt: run.acceptedAt,
      departedAt: run.departedAt,
      loaderName: loader?.name ?? null,
      reefer: vehicle?.temp === "reefer",
      vehicleLabel: `${vehicle?.temp === "reefer" ? "Reefer" : "Dry"} ${vehicle?.type ?? "truck"} · ${vehicle?.volumeCapM3.toFixed(1)} m³`,
      volumeM3: orders.reduce((a, o) => a + o.volumeM3, 0),
      weightKg: orders.reduce((a, o) => a + o.weightKg, 0),
      orderCount: orders.length,
      stops: stops.map((st) => {
        const outlet = outlets.find((o) => o.id === st.outletId);
        const manager = managers.find((m) => m.outletId === st.outletId);
        return {
          id: st.id,
          seq: st.seq,
          outletId: st.outletId,
          outletName: outlet?.name ?? st.outletId,
          district: outlet?.district ?? run.district,
          phone: manager?.phone ?? null,
          dockType: outlet?.dockType ?? "rear_dock",
          windowOpen: st.windowOpen,
          windowClose: st.windowClose,
          eta: st.eta,
          serviceMin: st.serviceMin,
          band: arrivalBand(st.eta),
          status: st.status,
          arrivedAt: st.arrivedAt,
          completedAt: st.completedAt,
          counts: st.counts,
          receiver: st.receiverName ?? manager?.name ?? null,
          orders: st.orderIds.map((id) => {
            const o = orders.find((x) => x.id === id);
            const us = units.filter((u) => u.orderId === id);
            const short = shortfalls.filter((x) => x.orderId === id);
            const shortCases = short.reduce((a, x) => a + x.cases, 0);
            const receipt = receipts.find((r) => r.orderId === id);
            return {
              id,
              temp: o?.temp ?? "ambient",
              brand: o?.brand ?? "Fresh",
              ordered: o?.units ?? 0,
              loaded: (o?.units ?? 0) - shortCases,
              unitCount: us.length,
              unitKind: us[0]?.kind ?? o?.temp ?? "ambient",
              shortfall: shortCases
                ? {
                    cases: shortCases,
                    what: [
                      ...new Set(
                        short.map(
                          (x) =>
                            units
                              .find((u) => u.id === x.unitId)
                              ?.name.toLowerCase() ?? x.unitId,
                        ),
                      ),
                    ].join(", "),
                  }
                : null,
              received: receipt
                ? { count: receipt.received, at: receipt.confirmedAt }
                : null,
            };
          }),
        };
      }),
    },
    messages: messages.map(({ m, from }) => ({
      id: m.id,
      text: m.text,
      at: m.sentAt,
      from: from ?? "Dispatch",
    })),
    reconciliations: recs.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      driverCount: r.driverCount,
      storeCount: r.storeCount,
      storeNote: r.storeNote,
      status: r.status,
      resolution: r.resolution,
      openedAt: r.openedAt,
    })),
    notices: notices.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      at: n.at,
      kind: n.kind,
    })),
  };
}

export type DriverSnapshot = Awaited<ReturnType<typeof driverSnapshot>>;

/* ------------------------------------------------------------------ */
/* Applying records                                                    */
/* ------------------------------------------------------------------ */

async function ownRun(tx: Tx, user: User, runId: string | undefined) {
  if (!runId) throw new DriverError("Missing run");
  const [run] = await tx
    .select()
    .from(s.tripRuns)
    .where(eq(s.tripRuns.id, runId));
  if (!run || run.vehicleId !== user.vehicleId)
    throw new DriverError("Not your vehicle");
  return run;
}

async function stopOf(tx: Tx, runId: string, seq: number | undefined) {
  if (!seq) throw new DriverError("Missing stop");
  const [stop] = await tx
    .select()
    .from(s.stopRuns)
    .where(and(eq(s.stopRuns.tripRunId, runId), eq(s.stopRuns.seq, seq)));
  if (!stop) throw new DriverError("Unknown stop");
  return stop;
}

/** Accept a load by the dock's code (typed, or from the QR link). */
export async function acceptLoad(
  user: User,
  code: string,
  at?: string,
  offline = false,
) {
  return db.transaction(async (tx) => {
    if (!user.vehicleId) throw new DriverError("No vehicle on this account");
    const [run] = await tx
      .select()
      .from(s.tripRuns)
      .where(
        and(
          eq(s.tripRuns.vehicleId, user.vehicleId),
          or(
            eq(s.tripRuns.handoverCode, code.trim()),
            eq(s.tripRuns.handoverToken, code.trim()),
          ),
        ),
      );
    if (!run) throw new DriverError("That code doesn’t match your vehicle");
    if (run.status === "accepted" || run.status === "on_road") return run.id;
    if (run.status !== "released")
      throw new DriverError("The dock hasn’t released this load yet");
    const when = at ? clampTime(at) : await touch(tx);
    if (at) await touch(tx);
    await tx
      .update(s.tripRuns)
      .set({
        status: "accepted",
        acceptedAt: when,
        lastHeardAt: when,
      })
      .where(eq(s.tripRuns.id, run.id));
    const [loader] = run.releasedBy
      ? await tx.select().from(s.users).where(eq(s.users.id, run.releasedBy))
      : [];
    await logEvent(tx, {
      at: when,
      kind: "driver.accepted",
      actor: user,
      text: `Accepted ${run.vehicleId} from ${loader?.name.split(" ")[0] ?? "the dock"}`,
      vehicleId: run.vehicleId,
      tripRunId: run.id,
      source: offline ? "offline" : "online",
    });
    return run.id;
  });
}

async function applyOne(tx: Tx, user: User, r: DriverRecord, sentAt: string) {
  const at = clampTime(r.at);
  const source = r.offline ? "offline" : "online";
  const run =
    r.kind === "accept" || r.kind === "reconcile"
      ? null
      : await ownRun(tx, user, r.runId);
  const lat = typeof r.payload.lat === "number" ? r.payload.lat : null;
  const lng = typeof r.payload.lng === "number" ? r.payload.lng : null;

  /** The phone was heard at `at`, possibly with its position. */
  const heard = async () => {
    if (!run) return;
    const last = run.lastHeardAt ? maxOps(run.lastHeardAt, at) : at;
    await tx
      .update(s.tripRuns)
      .set({
        lastHeardAt: last,
        ...(lat !== null && lng !== null ? { lastLat: lat, lastLng: lng } : {}),
      })
      .where(eq(s.tripRuns.id, run.id));
  };

  switch (r.kind) {
    case "accept":
      // Handled by acceptLoad before a transaction is opened.
      return { ok: true };
    case "depart": {
      if (!run) break;
      if (run.status === "on_road" || run.status === "completed")
        return { ok: true };
      if (!["accepted", "released"].includes(run.status))
        throw new DriverError("Accept the load before you leave");
      await tx
        .update(s.tripRuns)
        .set({ status: "on_road", departedAt: at })
        .where(eq(s.tripRuns.id, run.id));
      await heard();
      await tx
        .update(s.orders)
        .set({ status: "loaded" })
        .where(
          inArray(
            s.orders.id,
            (
              await tx
                .select()
                .from(s.stopRuns)
                .where(eq(s.stopRuns.tripRunId, run.id))
            ).flatMap((st) => st.orderIds),
          ),
        );
      await logEvent(tx, {
        at,
        kind: "driver.departed",
        actor: user,
        text: `Left ${run.depot} for ${run.district}`,
        vehicleId: run.vehicleId,
        tripRunId: run.id,
        source,
      });
      return { ok: true };
    }
    case "signal": {
      // Older phones report connectivity changes; treat them as a heartbeat.
      await heard();
      return { ok: true };
    }
    case "arrive": {
      if (!run) break;
      const stop = await stopOf(tx, run.id, r.seq);
      if (stop.arrivedAt) return { ok: true };
      const [outlet] = await tx
        .select()
        .from(s.outlets)
        .where(eq(s.outlets.id, stop.outletId));
      await tx
        .update(s.stopRuns)
        .set({ status: "arrived", arrivedAt: at, recordedOffline: r.offline })
        .where(eq(s.stopRuns.id, stop.id));
      if (run.status !== "on_road")
        await tx
          .update(s.tripRuns)
          .set({ status: "on_road", departedAt: run.departedAt ?? at })
          .where(eq(s.tripRuns.id, run.id));
      await heard();
      const late = cmpOps(at, opsAt(run.day, stop.windowClose)) > 0;
      await logEvent(tx, {
        at,
        kind: "driver.arrived",
        actor: user,
        text: `Arrived at ${outletLine(outlet)}${late ? ", after the window closed" : ", on time"}`,
        outletId: outlet.id,
        vehicleId: run.vehicleId,
        tripRunId: run.id,
        source,
      });
      return { ok: true };
    }
    case "complete": {
      if (!run) break;
      const stop = await stopOf(tx, run.id, r.seq);
      if (stop.status === "completed") return { ok: true };
      const p = r.payload as {
        counts?: Record<string, number>;
        receiver?: string;
        tempC?: number;
        photo?: string;
        signature?: string;
      };
      if (!p.signature)
        throw new DriverError("The receiver’s signature is missing");
      const photoId = await saveMedia(tx, p.photo, "photo");
      const signatureId = await saveMedia(tx, p.signature, "signature");
      const counts = Object.fromEntries(
        stop.orderIds.map((id) => [
          id,
          Math.max(0, Math.round(Number(p.counts?.[id] ?? 0))),
        ]),
      );
      const [outlet] = await tx
        .select()
        .from(s.outlets)
        .where(eq(s.outlets.id, stop.outletId));
      await tx
        .update(s.stopRuns)
        .set({
          status: "completed",
          arrivedAt: stop.arrivedAt ?? at,
          completedAt: at,
          counts,
          receiverName: p.receiver ?? null,
          tempC: typeof p.tempC === "number" ? p.tempC : null,
          photoId,
          signatureId,
          recordedOffline: r.offline || stop.recordedOffline,
          syncedAt: sentAt,
        })
        .where(eq(s.stopRuns.id, stop.id));
      // An order the store already counted stays received.
      await tx
        .update(s.orders)
        .set({ status: "delivered" })
        .where(
          and(
            inArray(s.orders.id, stop.orderIds),
            ne(s.orders.status, "received"),
          ),
        );
      await heard();
      const orders = await tx
        .select()
        .from(s.orders)
        .where(inArray(s.orders.id, stop.orderIds));
      const parts = orders.map(
        (o) =>
          `${counts[o.id]} ${o.brand === "Fresh" ? TEMP_LABEL[o.temp].toLowerCase() : "units"}`,
      );
      await logEvent(tx, {
        at,
        kind: "driver.delivered",
        actor: user,
        text: `Proof of delivery at ${outletLine(outlet)}: ${parts.join(", ")} · photo and signature${typeof p.tempC === "number" ? ` · ${p.tempC.toFixed(1)} °C` : ""}${r.offline ? ` (recorded offline, sent ${sentAt.slice(11, 16)})` : ""}`,
        outletId: outlet.id,
        vehicleId: run.vehicleId,
        tripRunId: run.id,
        source,
        data: { counts, photoId, signatureId },
      });
      await notify(tx, {
        audience: `outlet:${outlet.id}`,
        kind: "delivered",
        title: `Delivered ${at.slice(11, 16)} by ${user.name.split(" ")[0]}`,
        link: "/store/today",
        at,
      });
      for (const o of orders) await compareCounts(tx, o.id, at);
      const remaining = await tx
        .select()
        .from(s.stopRuns)
        .where(
          and(
            eq(s.stopRuns.tripRunId, run.id),
            inArray(s.stopRuns.status, ["pending", "arrived"]),
          ),
        );
      if (remaining.length === 0)
        await tx
          .update(s.tripRuns)
          .set({ status: "completed", completedAt: at })
          .where(eq(s.tripRuns.id, run.id));
      return { ok: true };
    }
    case "problem": {
      if (!run) break;
      const stop = await stopOf(tx, run.id, r.seq);
      const [outlet] = await tx
        .select()
        .from(s.outlets)
        .where(eq(s.outlets.id, stop.outletId));
      const reason = String(r.payload.reason ?? "Something else");
      await tx
        .update(s.stopRuns)
        .set({
          status: "failed",
          problem: reason,
          completedAt: at,
          recordedOffline: r.offline,
        })
        .where(eq(s.stopRuns.id, stop.id));
      await tx
        .update(s.orders)
        .set({ status: "failed" })
        .where(inArray(s.orders.id, stop.orderIds));
      await heard();
      await logEvent(tx, {
        at,
        kind: "driver.problem",
        actor: user,
        text: `Couldn’t deliver at ${outletLine(outlet)}: ${reason}`,
        outletId: outlet.id,
        vehicleId: run.vehicleId,
        tripRunId: run.id,
        source,
      });
      await notify(tx, {
        audience: "role:dispatcher",
        kind: "problem",
        title: `${run.vehicleId} couldn’t deliver at ${outlet.id}`,
        body: reason,
        at,
      });
      await notify(tx, {
        audience: `outlet:${outlet.id}`,
        kind: "problem",
        title: "Delivery not made",
        body: reason,
        link: "/store/today",
        at,
      });
      return { ok: true };
    }
    case "reconcile": {
      const orderId = String(r.payload.orderId ?? "");
      const resolution =
        r.payload.resolution === "intact" ? "intact" : "after_handover";
      const [rec] = await tx
        .select()
        .from(s.reconciliations)
        .where(eq(s.reconciliations.orderId, orderId));
      if (!rec) throw new DriverError("Nothing to settle for that order");
      if (rec.status === "resolved") return { ok: true };
      await tx
        .update(s.reconciliations)
        .set({
          status: "resolved",
          resolution,
          resolvedAt: at,
          resolvedBy: user.id,
        })
        .where(eq(s.reconciliations.id, rec.id));
      const [order] = await tx
        .select()
        .from(s.orders)
        .where(eq(s.orders.id, orderId));
      const diff = rec.driverCount - rec.storeCount;
      await logEvent(tx, {
        at,
        kind: "driver.reconciled",
        actor: user,
        text:
          resolution === "intact"
            ? `Handed over ${rec.driverCount} intact. Sent to dispatch for review`
            : `${plural(Math.abs(diff), "unit")} difference recorded as damage after handover`,
        orderId,
        outletId: order?.outletId,
        source,
      });
      if (resolution === "intact")
        await notify(tx, {
          audience: "role:dispatcher",
          kind: "dispute",
          title: `Count dispute on ${orderId}`,
          body: `Driver handed over ${rec.driverCount}, store counted ${rec.storeCount}. Review the photo.`,
          orderId,
          at,
        });
      return { ok: true };
    }
  }
  return { ok: true };
}

/**
 * When the store's count and the driver's handover differ, open a
 * reconciliation the driver settles once both records are in.
 */
export async function compareCounts(tx: Tx, orderId: string, at: string) {
  const [receipt] = await tx
    .select()
    .from(s.receipts)
    .where(eq(s.receipts.orderId, orderId));
  if (!receipt) return;
  const stops = await tx
    .select()
    .from(s.stopRuns)
    .where(eq(s.stopRuns.status, "completed"));
  const stop = stops.find((st) => st.orderIds.includes(orderId) && st.counts);
  if (!stop?.counts) return;
  const driverCount = stop.counts[orderId] ?? 0;
  if (driverCount === receipt.received) return;
  const [existing] = await tx
    .select()
    .from(s.reconciliations)
    .where(eq(s.reconciliations.orderId, orderId));
  if (existing) return;
  await tx.insert(s.reconciliations).values({
    orderId,
    stopRunId: stop.id,
    driverCount,
    storeCount: receipt.received,
    storeNote: receipt.note,
    openedAt: cmpOps(at, receipt.confirmedAt) > 0 ? at : receipt.confirmedAt,
  });
  const [run] = await tx
    .select()
    .from(s.tripRuns)
    .where(eq(s.tripRuns.id, stop.tripRunId));
  if (run?.driverId)
    await notify(tx, {
      audience: `user:${run.driverId}`,
      kind: "reconcile",
      title: `Count difference on ${orderId}`,
      body: `Store counted ${receipt.received}, you handed over ${driverCount}.`,
      link: "/driver/reconcile",
      at,
    });
}

export interface ApplyResult {
  clientId: string;
  ok: boolean;
  duplicate?: boolean;
  error?: string;
}

/** Apply an outbox, oldest first. Each record is its own transaction. */
export async function applyRecords(
  user: User,
  records: DriverRecord[],
): Promise<ApplyResult[]> {
  const out: ApplyResult[] = [];
  const sorted = [...records].sort((a, b) => cmpOps(a.at, b.at));
  const sentAt = now();
  for (const r of sorted) {
    try {
      if (r.kind === "accept") {
        const [seen] = await db
          .select()
          .from(s.clientRecords)
          .where(eq(s.clientRecords.clientId, r.clientId));
        if (seen) {
          out.push({ clientId: r.clientId, ok: true, duplicate: true });
          continue;
        }
        await acceptLoad(
          user,
          String(r.payload.code ?? ""),
          r.at.replace("T", " "),
          r.offline,
        );
        await db.insert(s.clientRecords).values({
          clientId: r.clientId,
          userId: user.id,
          kind: r.kind,
          recordedAt: r.at.replace("T", " "),
          result: { ok: true },
        });
        out.push({ clientId: r.clientId, ok: true });
        continue;
      }
      const res = await db.transaction(async (tx) => {
        const [seen] = await tx
          .select()
          .from(s.clientRecords)
          .where(eq(s.clientRecords.clientId, r.clientId));
        if (seen) return { duplicate: true };
        await applyOne(tx, user, r, sentAt);
        await tx.insert(s.clientRecords).values({
          clientId: r.clientId,
          userId: user.id,
          kind: r.kind,
          recordedAt: r.at.replace("T", " "),
          result: { ok: true },
        });
        await touch(tx);
        return { duplicate: false };
      });
      out.push({ clientId: r.clientId, ok: true, duplicate: res.duplicate });
    } catch (e) {
      out.push({
        clientId: r.clientId,
        ok: false,
        error: e instanceof Error ? e.message : "Failed",
      });
    }
  }
  return out;
}

/** A time from the phone, never later than now (a phone clock can run fast). */
function clampTime(at: string) {
  const t = normalizeOps(at);
  const n = now();
  return cmpOps(t, n) > 0 ? n : t;
}

/** The phone is online: note when and, if allowed, where. */
export async function heartbeat(
  user: User,
  runId: string,
  lat?: number | null,
  lng?: number | null,
) {
  const [run] = await db
    .select()
    .from(s.tripRuns)
    .where(eq(s.tripRuns.id, runId));
  if (!run || run.vehicleId !== user.vehicleId)
    throw new DriverError("Not your vehicle");
  const t = now();
  const wasQuiet = !run.lastHeardAt || minutesBetween(run.lastHeardAt, t) >= 2;
  await db
    .update(s.tripRuns)
    .set({
      lastHeardAt: t,
      ...(typeof lat === "number" && typeof lng === "number"
        ? { lastLat: lat, lastLng: lng }
        : {}),
    })
    .where(eq(s.tripRuns.id, runId));
  // Only a phone coming back after a gap changes what other screens show.
  if (wasQuiet) await touch(db);
}
