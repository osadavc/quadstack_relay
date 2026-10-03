import type { OutRecord, Snapshot } from "./types";

/*
 * What the phone shows is the last server snapshot with every waiting
 * record applied on top. When a record is accepted by the server it is
 * already in the next snapshot, so nothing is shown twice.
 */
export function applyOutbox(base: Snapshot, outbox: OutRecord[]): Snapshot {
  if (outbox.length === 0) return base;
  const snap: Snapshot = structuredClone(base);
  for (const r of outbox) applyOne(snap, r);
  return snap;
}

function applyOne(snap: Snapshot, r: OutRecord) {
  const run = snap.run;
  const at = r.at.replace("T", " ");
  switch (r.kind) {
    case "accept":
      if (
        run &&
        ["released", "planned", "loading", "loaded"].includes(run.status)
      ) {
        run.status = "accepted";
        run.acceptedAt = at;
      }
      return;
    case "depart":
      if (run && run.id === r.runId && run.status !== "completed") {
        run.status = "on_road";
        run.departedAt = run.departedAt ?? at;
      }
      return;
    case "arrive": {
      const stop = run?.stops.find((s) => s.seq === r.seq);
      if (run && stop && stop.status === "pending") {
        stop.status = "arrived";
        stop.arrivedAt = at;
        if (run.status !== "completed") run.status = "on_road";
      }
      return;
    }
    case "complete": {
      const stop = run?.stops.find((s) => s.seq === r.seq);
      if (run && stop && stop.status !== "completed") {
        stop.status = "completed";
        stop.arrivedAt = stop.arrivedAt ?? at;
        stop.completedAt = at;
        stop.counts = (r.payload.counts as Record<string, number>) ?? null;
        if (
          run.stops.every(
            (s) => s.status === "completed" || s.status === "failed",
          )
        )
          run.status = "completed";
      }
      return;
    }
    case "problem": {
      const stop = run?.stops.find((s) => s.seq === r.seq);
      if (run && stop) {
        stop.status = "failed";
        stop.completedAt = at;
        if (
          run.stops.every(
            (s) => s.status === "completed" || s.status === "failed",
          )
        )
          run.status = "completed";
      }
      return;
    }
    case "reconcile": {
      const rec = snap.reconciliations.find(
        (x) => x.orderId === r.payload.orderId,
      );
      if (rec) {
        rec.status = "resolved";
        rec.resolution =
          r.payload.resolution === "intact" ? "intact" : "after_handover";
      }
      return;
    }
    default:
      return;
  }
}
