import { db, schema as s } from "@relay/db";
import { and, eq } from "drizzle-orm";
import type { User } from "./auth";
import { touch } from "./clock";
import { logEvent, notify } from "./record";

/* Dispatch actions outside planning. */

export async function messageDriver(user: User, runId: string, text: string) {
  const body = text.trim();
  if (!body) return;
  await db.transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(s.tripRuns)
      .where(eq(s.tripRuns.id, runId));
    if (!run) return;
    const at = await touch(tx);
    await tx
      .insert(s.messages)
      .values({ tripRunId: runId, fromUser: user.id, text: body, sentAt: at });
    await logEvent(tx, {
      at,
      kind: "dispatch.message",
      actor: user,
      text: `Messaged ${run.vehicleId}: “${body}”`,
      vehicleId: run.vehicleId,
      tripRunId: run.id,
    });
    if (run.driverId)
      await notify(tx, {
        audience: `user:${run.driverId}`,
        kind: "message",
        title: body,
        link: "/driver",
        at,
      });
  });
}

/** Tell stores whose delivery is running late, so staff can wait or plan. */
export async function warnStores(
  user: User,
  stops: { outletId: string; vehicleId: string; expected: string }[],
) {
  if (!stops.length) return;
  await db.transaction(async (tx) => {
    const at = await touch(tx);
    for (const st of stops)
      await notify(tx, {
        audience: `outlet:${st.outletId}`,
        kind: "late",
        title: `Running late: about ${st.expected}`,
        body: `${st.vehicleId} is behind plan.`,
        link: "/store/today",
        at,
      });
    await logEvent(tx, {
      at,
      kind: "dispatch.warned",
      actor: user,
      text: `Told ${stops.map((x) => x.outletId).join(", ")} their delivery is running late`,
    });
  });
}

export async function setVehicleStatus(
  user: User,
  day: string,
  vehicleId: string,
  status: "available" | "workshop",
  note?: string,
) {
  await db.transaction(async (tx) => {
    const at = await touch(tx);
    await tx
      .insert(s.vehicleDays)
      .values({ vehicleId, day: day, status, note: note ?? null })
      .onConflictDoUpdate({
        target: [s.vehicleDays.vehicleId, s.vehicleDays.day],
        set: { status, note: note ?? null },
      });
    const [run] = await tx
      .select()
      .from(s.tripRuns)
      .where(and(eq(s.tripRuns.day, day), eq(s.tripRuns.vehicleId, vehicleId)));
    await logEvent(tx, {
      at,
      kind: "fleet.status",
      actor: user,
      text:
        status === "workshop"
          ? `Took ${vehicleId} out of service${note ? `: ${note}` : ""}.${run ? " Re-run the plan to move its orders" : ""}`
          : `Put ${vehicleId} back in service`,
      vehicleId,
    });
  });
}
