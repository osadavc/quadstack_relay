import { db, schema as s, type Tx } from "@relay/db";
import { plural } from "@relay/domain";
import { and, eq, inArray } from "drizzle-orm";
import type { User } from "./auth";
import { touch } from "./clock";
import { saveMedia } from "./media";
import { logEvent, notify } from "./record";

/*
 * The dock. Loaders tick units onto the truck in reverse stop order, flag
 * anything damaged or missing before it leaves, seal the doors and hand the
 * load to the driver, who accepts it by QR or code.
 */

export class DockError extends Error {}

async function runFor(tx: Tx, runId: string) {
  const [run] = await tx
    .select()
    .from(s.tripRuns)
    .where(eq(s.tripRuns.id, runId));
  if (!run) throw new DockError("This vehicle is no longer on the plan.");
  return run;
}

function editable(run: { status: string }) {
  if (!["planned", "loading", "loaded"].includes(run.status))
    throw new DockError("This vehicle has already been released.");
}

export async function startLoading(user: User, runId: string) {
  return db.transaction(async (tx) => {
    const run = await runFor(tx, runId);
    editable(run);
    if (run.loadingStartedAt) return;
    const at = await touch(tx);
    await tx
      .update(s.tripRuns)
      .set({ status: "loading", loadingStartedAt: at })
      .where(eq(s.tripRuns.id, runId));
    await logEvent(tx, {
      at,
      kind: "dock.loading",
      actor: user,
      text: `Started loading ${run.vehicleId} for ${run.district}`,
      vehicleId: run.vehicleId,
      tripRunId: run.id,
    });
  });
}

export async function setUnit(
  user: User,
  runId: string,
  unitId: string,
  loaded: boolean,
) {
  return db.transaction(async (tx) => {
    const run = await runFor(tx, runId);
    editable(run);
    const at = await touch(tx);
    const [unit] = await tx
      .select()
      .from(s.loadUnits)
      .where(and(eq(s.loadUnits.tripRunId, runId), eq(s.loadUnits.id, unitId)));
    if (!unit) throw new DockError("Unknown unit");
    if (unit.status === "flagged") return;
    await tx
      .update(s.loadUnits)
      .set({
        status: loaded ? "loaded" : "pending",
        loadedAt: loaded ? at : null,
        loadedBy: loaded ? user.id : null,
      })
      .where(and(eq(s.loadUnits.tripRunId, runId), eq(s.loadUnits.id, unitId)));
    await tx
      .update(s.tripRuns)
      .set({
        status: "loading",

        loadingStartedAt: run.loadingStartedAt ?? at,
      })
      .where(eq(s.tripRuns.id, runId));
  });
}

export async function loadAll(user: User, runId: string) {
  return db.transaction(async (tx) => {
    const run = await runFor(tx, runId);
    editable(run);
    const at = await touch(tx);
    await tx
      .update(s.loadUnits)
      .set({ status: "loaded", loadedAt: at, loadedBy: user.id })
      .where(
        and(
          eq(s.loadUnits.tripRunId, runId),
          eq(s.loadUnits.status, "pending"),
        ),
      );
    await tx
      .update(s.tripRuns)
      .set({
        status: "loading",

        loadingStartedAt: run.loadingStartedAt ?? at,
      })
      .where(eq(s.tripRuns.id, runId));
  });
}

export const SHORTFALL_REASONS = [
  "damaged",
  "missing",
  "wrong",
  "warm",
] as const;
export type ShortfallReason = (typeof SHORTFALL_REASONS)[number];

const REASON_WORD: Record<ShortfallReason, string> = {
  damaged: "damaged",
  missing: "missing",
  wrong: "substituted",
  warm: "too warm",
};

export async function flagShortfall(
  user: User,
  runId: string,
  input: {
    unitId: string;
    reason: ShortfallReason;
    cases: number;
    note?: string;
    photo?: string | null;
  },
) {
  return db.transaction(async (tx) => {
    const run = await runFor(tx, runId);
    editable(run);
    const [unit] = await tx
      .select()
      .from(s.loadUnits)
      .where(
        and(eq(s.loadUnits.tripRunId, runId), eq(s.loadUnits.id, input.unitId)),
      );
    if (!unit) throw new DockError("Unknown unit");
    const cases = Math.max(1, Math.min(unit.cases, Math.round(input.cases)));
    const at = await touch(tx);
    const photoId = await saveMedia(tx, input.photo, "photo");
    const [order] = await tx
      .select()
      .from(s.orders)
      .where(eq(s.orders.id, unit.orderId));
    const [outlet] = await tx
      .select()
      .from(s.outlets)
      .where(eq(s.outlets.id, order.outletId));
    const existing = await tx
      .select()
      .from(s.shortfalls)
      .where(
        and(
          eq(s.shortfalls.tripRunId, runId),
          eq(s.shortfalls.unitId, unit.id),
        ),
      );
    const creditRef =
      existing[0]?.creditRef ??
      `CR-${order.id.slice(3)}-${unit.id.split("-").at(-1)}`;
    if (existing.length)
      await tx
        .update(s.shortfalls)
        .set({
          reason: input.reason,
          cases,
          note: input.note ?? null,
          photoId: photoId ?? existing[0].photoId,
          recordedAt: at,
        })
        .where(eq(s.shortfalls.id, existing[0].id));
    else
      await tx.insert(s.shortfalls).values({
        tripRunId: runId,
        unitId: unit.id,
        orderId: unit.orderId,
        orderLineId: unit.orderLineId,
        reason: input.reason,
        cases,
        note: input.note ?? null,
        photoId,
        creditRef,
        recordedAt: at,
        recordedBy: user.id,
      });
    await tx
      .update(s.loadUnits)
      .set({ status: "flagged", loadedAt: at, loadedBy: user.id })
      .where(
        and(eq(s.loadUnits.tripRunId, runId), eq(s.loadUnits.id, unit.id)),
      );
    await tx
      .update(s.tripRuns)
      .set({
        status: "loading",

        loadingStartedAt: run.loadingStartedAt ?? at,
      })
      .where(eq(s.tripRuns.id, runId));

    const what = `${plural(cases, "unit")} ${unit.name.toLowerCase()} ${REASON_WORD[input.reason]}`;
    const loadedLine = `${unit.cases - cases} of ${unit.cases} loaded`;
    await logEvent(tx, {
      at,
      kind: "dock.shortfall",
      actor: user,
      text: `Flagged ${what} on ${unit.id} for ${outlet.id} ${outlet.name}. Credit ${creditRef}`,
      orderId: order.id,
      outletId: outlet.id,
      vehicleId: run.vehicleId,
      tripRunId: run.id,
      data: { unitId: unit.id, cases, reason: input.reason, photoId },
    });
    await notify(tx, {
      audience: `outlet:${outlet.id}`,
      kind: "shortfall",
      title: `${what} at the dock, credited`,
      body: `${unit.name}: ${loadedLine}. Credit ${creditRef}.`,
      link: `/store/record/${order.id}`,
      orderId: order.id,
      at,
    });
    if (run.driverId)
      await notify(tx, {
        audience: `user:${run.driverId}`,
        kind: "shortfall",
        title: `${what} for ${outlet.id}`,
        body: "The store has been told.",
        link: "/driver",
        at,
      });
    await notify(tx, {
      audience: "role:dispatcher",
      kind: "shortfall",
      title: `Dock flagged ${run.vehicleId} loaded short`,
      body: `${what} · ${order.id}`,
      orderId: order.id,
      at,
    });
  });
}

export async function ackChange(user: User, runId: string) {
  return db.transaction(async (tx) => {
    const run = await runFor(tx, runId);
    const at = await touch(tx);
    await tx
      .update(s.tripRuns)
      .set({ changeAcked: true })
      .where(eq(s.tripRuns.id, runId));
    await logEvent(tx, {
      at,
      kind: "dock.change_acked",
      actor: user,
      text: `Confirmed the plan change on ${run.vehicleId}: ${run.changeNote ?? "none"}`,
      vehicleId: run.vehicleId,
      tripRunId: run.id,
    });
  });
}

export async function releaseVehicle(
  user: User,
  runId: string,
  seal: string,
  reeferTempC?: number | null,
) {
  return db.transaction(async (tx) => {
    const run = await runFor(tx, runId);
    editable(run);
    const units = await tx
      .select()
      .from(s.loadUnits)
      .where(eq(s.loadUnits.tripRunId, runId));
    const left = units.filter((u) => u.status === "pending").length;
    if (left) throw new DockError(`${plural(left, "unit")} still on the dock.`);
    if (!seal.trim())
      throw new DockError("Enter the seal number from the doors.");
    if (!run.changeAcked) throw new DockError("Confirm the plan change first.");
    const [vehicle] = await tx
      .select()
      .from(s.vehicles)
      .where(eq(s.vehicles.id, run.vehicleId));
    const reefer = vehicle?.temp === "reefer";
    const temp = reeferTempC ?? null;
    if (reefer && (temp === null || Number.isNaN(temp)))
      throw new DockError(
        "Enter the reefer temperature from the unit's display.",
      );
    if (reefer && temp !== null && (temp < -25 || temp > 15))
      throw new DockError(
        "That temperature looks wrong. Check the reefer display.",
      );
    const at = await touch(tx);
    await tx
      .update(s.tripRuns)
      .set({
        status: "released",
        releasedAt: at,
        releasedBy: user.id,
        seal: seal.trim(),
        reeferTempC: reefer ? temp : null,
      })
      .where(eq(s.tripRuns.id, runId));
    const flagged = units.filter((u) => u.status === "flagged").length;
    await tx
      .update(s.orders)
      .set({ status: "loaded" })
      .where(inArray(s.orders.id, [...new Set(units.map((u) => u.orderId))]));
    const [driver] = run.driverId
      ? await tx.select().from(s.users).where(eq(s.users.id, run.driverId))
      : [];
    await logEvent(tx, {
      at,
      kind: "dock.released",
      actor: user,
      text: `Released ${run.vehicleId} to ${driver ? driver.name.split(" ")[0] : "the driver"} · seal ${seal.trim()}${reefer && temp !== null ? ` · reefer ${temp.toFixed(1)} °C` : ""}${flagged ? ` · ${plural(flagged, "shortfall")} recorded` : ""}`,
      vehicleId: run.vehicleId,
      tripRunId: run.id,
    });
    if (run.driverId)
      await notify(tx, {
        audience: `user:${run.driverId}`,
        kind: "release",
        title: `${run.vehicleId} is ready for you`,
        body: `Scan the dock’s QR or enter code ${run.handoverCode}.`,
        link: "/driver",
        at,
      });
  });
}
