import { db, schema as s } from "@relay/db";
import { plural } from "@relay/domain";
import { and, eq, inArray } from "drizzle-orm";
import type { User } from "./auth";
import { cutoffFor, now, orderingDay, touch } from "./clock";
import { compareCounts } from "./driver";
import { saveMedia } from "./media";
import { type OrderItem, saveOrders } from "./orders";
import { canReceive } from "./queries/store";
import { orderStories } from "./queries/story";
import { logEvent, notify } from "./record";

/*
 * The store manager: place the order before the cutoff, hear about any
 * deferral, count what arrives and report problems.
 */

export class StoreError extends Error {}

function outletOf(user: User) {
  if (!user.outletId) throw new StoreError("This account has no outlet");
  return user.outletId;
}

/** Orders placed at or before 16:00 the day before are on time. */
export { cutoffFor };

export async function placeOrder(user: User, items: OrderItem[]) {
  const outletId = outletOf(user);
  return db.transaction(async (tx) => {
    const day = await orderingDay(tx);
    const [outlet] = await tx
      .select()
      .from(s.outlets)
      .where(eq(s.outlets.id, outletId));
    const at = await touch(tx);
    const placed = await saveOrders(tx, {
      outlet,
      day,
      items,
      by: user,
      channel: "app",
      at,
    });
    return { placed, day };
  });
}

export async function acknowledge(user: User, notificationId: string) {
  const outletId = outletOf(user);
  await db.transaction(async (tx) => {
    const at = now();
    await tx
      .update(s.notifications)
      .set({ ackAt: at, readAt: at })
      .where(
        and(
          eq(s.notifications.id, notificationId),
          eq(s.notifications.audience, `outlet:${outletId}`),
        ),
      );
    await touch(tx);
  });
}

export async function markRead(audiences: string[]) {
  await db.transaction(async (tx) => {
    const at = now();
    await tx
      .update(s.notifications)
      .set({ readAt: at })
      .where(inArray(s.notifications.audience, audiences));
  });
}

export async function confirmReceipt(
  user: User,
  orderId: string,
  counts: Record<string, number>,
  note?: string,
  photo?: string | null,
) {
  const outletId = outletOf(user);
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(s.orders)
      .where(eq(s.orders.id, orderId));
    if (!order || order.outletId !== outletId)
      throw new StoreError("Not your order");
    const [done] = await tx
      .select()
      .from(s.receipts)
      .where(eq(s.receipts.orderId, orderId));
    if (done) return done.id;
    const story = (await orderStories([orderId])).get(orderId);
    if (!story || !canReceive(story))
      throw new StoreError("Nothing to confirm yet: the truck hasn’t left.");
    const lines = await tx
      .select()
      .from(s.orderLines)
      .where(eq(s.orderLines.orderId, orderId));
    const shorts = await tx
      .select()
      .from(s.shortfalls)
      .where(eq(s.shortfalls.orderId, orderId));
    const expectedOf = (lineId: number) =>
      (lines.find((l) => l.id === lineId)?.cases ?? 0) -
      shorts
        .filter((x) => x.orderLineId === lineId)
        .reduce((a, x) => a + x.cases, 0);
    const expected = lines.reduce((a, l) => a + expectedOf(l.id), 0);
    const clean: Record<string, number> = {};
    for (const l of lines)
      clean[String(l.id)] = Math.max(
        0,
        Math.round(counts[String(l.id)] ?? expectedOf(l.id)),
      );
    const received = Object.values(clean).reduce((a, b) => a + b, 0);

    const at = await touch(tx);
    const photoId = await saveMedia(tx, photo, "photo");
    const [row] = await tx
      .insert(s.receipts)
      .values({
        orderId,
        outletId,
        confirmedAt: at,
        confirmedBy: user.id,
        counts: clean,
        expected,
        received,
        note: note?.trim() || null,
        photoId,
      })
      .returning({ id: s.receipts.id });
    await tx
      .update(s.orders)
      .set({ status: "received" })
      .where(eq(s.orders.id, orderId));
    const gap = expected - received;
    await logEvent(tx, {
      at,
      kind: "store.received",
      actor: user,
      text:
        gap === 0
          ? `Confirmed all ${received} ${order.temp === "chilled" ? "chilled " : ""}units of ${orderId} received`
          : `Confirmed ${received} of ${expected} units of ${orderId} received${note?.trim() ? `: “${note.trim()}”` : ""}${photoId ? ". Photo added" : ""}`,
      orderId,
      outletId,
    });
    if (gap !== 0)
      await notify(tx, {
        audience: "role:dispatcher",
        kind: "receipt",
        title: `${outletId} counted ${plural(Math.abs(gap), "unit")} ${gap > 0 ? "fewer" : "more"}`,
        body: `${orderId}: ${received} of ${expected}${note?.trim() ? ` · ${note.trim()}` : ""}`,
        orderId,
        at,
      });
    await compareCounts(tx, orderId, at);
    return row.id;
  });
}

export const ISSUE_KINDS = [
  "Missing goods",
  "Damaged goods",
  "Late delivery",
  "Wrong item",
  "Something else",
];

export async function reportIssue(
  user: User,
  kind: string,
  note?: string,
  orderId?: string,
) {
  const outletId = outletOf(user);
  await db.transaction(async (tx) => {
    const at = await touch(tx);
    await tx.insert(s.issues).values({
      outletId,
      orderId: orderId ?? null,
      kind,
      note: note?.trim() || null,
      raisedAt: at,
      raisedBy: user.id,
    });
    await logEvent(tx, {
      at,
      kind: "store.issue",
      actor: user,
      text: `Reported an issue: ${kind}${note?.trim() ? `. “${note.trim()}”` : ""}`,
      orderId: orderId ?? null,
      outletId,
    });
    await notify(tx, {
      audience: "role:dispatcher",
      kind: "issue",
      title: `${outletId} reported: ${kind}`,
      body: note?.trim() || undefined,
      orderId,
      at,
    });
  });
}
