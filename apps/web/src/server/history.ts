import { type DBOrTx, schema as s } from "@relay/db";
import { daysBetween } from "@relay/domain";
import { inArray } from "drizzle-orm";

/*
 * Service history per outlet, read from the service log. An outlet is
 * skipped on a run when any of its orders was deferred; the fairness guard
 * counts skipped runs in a row.
 */

export interface OutletHistory {
  /** Runs in a row the outlet was skipped, most recent first. */
  consecutiveSkips: number;
  /** Most recent runs first: served | skipped. */
  runs: { day: string; outcome: "served" | "skipped" }[];
  /** Last day each kind of goods arrived. */
  lastServed: Partial<Record<"chilled" | "ambient", string>>;
  skippedDays: string[];
}

export async function outletHistory(
  tx: DBOrTx,
  outletIds: string[],
  beforeDay: string,
): Promise<Map<string, OutletHistory>> {
  const out = new Map<string, OutletHistory>();
  if (outletIds.length === 0) return out;
  const rows = await tx
    .select()
    .from(s.serviceLog)
    .where(inArray(s.serviceLog.outletId, outletIds));
  const byOutlet = new Map<string, (typeof rows)[number][]>();
  for (const r of rows) {
    if (r.day >= beforeDay) continue;
    const list = byOutlet.get(r.outletId) ?? [];
    list.push(r);
    byOutlet.set(r.outletId, list);
  }
  for (const id of outletIds) {
    const list = byOutlet.get(id) ?? [];
    const days = [...new Set(list.map((r) => r.day))].sort().reverse();
    const runs = days.map((day) => ({
      day,
      outcome: list.some((r) => r.day === day && r.outcome === "deferred")
        ? ("skipped" as const)
        : ("served" as const),
    }));
    let consecutiveSkips = 0;
    for (const r of runs) {
      if (r.outcome !== "skipped") break;
      consecutiveSkips++;
    }
    const lastServed: OutletHistory["lastServed"] = {};
    for (const r of list) {
      if (r.outcome !== "served") continue;
      const t = r.temp as "chilled" | "ambient";
      if (!lastServed[t] || r.day > (lastServed[t] as string))
        lastServed[t] = r.day;
    }
    out.set(id, {
      consecutiveSkips,
      runs,
      lastServed,
      skippedDays: runs
        .filter((r) => r.outcome === "skipped")
        .map((r) => r.day),
    });
  }
  return out;
}

export function daysSince(
  h: OutletHistory | undefined,
  temp: "chilled" | "ambient",
  day: string,
) {
  const last = h?.lastServed[temp];
  return last ? daysBetween(last, day) : 0;
}
