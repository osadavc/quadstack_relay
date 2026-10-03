import { colomboTime, maxOps, normalizeOps } from "@relay/domain";

/*
 * Records carry the time they were made on this device, as Asia/Colombo
 * wall-clock time. A new record is never stamped before one already
 * waiting to send, so the outbox stays in the order it was made.
 */
export function recordTime(outbox: { at: string }[]): string {
  let t = colomboTime();
  for (const r of outbox) t = maxOps(t, normalizeOps(r.at));
  return t;
}
