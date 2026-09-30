import { addDays, dowOf } from "@relay/domain";
import { and, asc, eq, gt } from "drizzle-orm";
import type { DBOrTx } from "./client";
import * as s from "./schema";

/*
 * Operating days: from calendar.csv while it lasts, then Monday to Saturday.
 */

export async function isOperating(db: DBOrTx, day: string) {
  const [row] = await db
    .select()
    .from(s.calendar)
    .where(eq(s.calendar.day, day));
  return row ? row.isOperating : dowOf(day) !== 0;
}

export async function nextOperatingDay(db: DBOrTx, after: string) {
  const [row] = await db
    .select({ day: s.calendar.day })
    .from(s.calendar)
    .where(and(gt(s.calendar.day, after), eq(s.calendar.isOperating, true)))
    .orderBy(asc(s.calendar.day))
    .limit(1);
  if (row) return row.day;
  let d = addDays(after, 1);
  while (!(await isOperating(db, d))) d = addDays(d, 1);
  return d;
}

/** The operating days before `day`, most recent first. */
export async function previousOperatingDays(
  db: DBOrTx,
  day: string,
  n: number,
) {
  const out: string[] = [];
  let d = addDays(day, -1);
  while (out.length < n) {
    if (await isOperating(db, d)) out.push(d);
    d = addDays(d, -1);
  }
  return out;
}
