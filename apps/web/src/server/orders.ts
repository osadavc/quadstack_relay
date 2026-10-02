import { type DBOrTx, schema as s } from "@relay/db";
import { dayLabel, lineName, orderIdFor, tempsFor } from "@relay/domain";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { User } from "./auth";
import { logEvent } from "./record";

/*
 * Saving an outlet's orders for a delivery day, from the store's form or
 * a call to dispatch. Each order is a temperature's units with their total
 * weight and volume. A temperature left out of the request is untouched;
 * zero units removes that order while it can still change.
 */

export class OrderError extends Error {}

export const orderItem = z.object({
  temp: z.enum(["chilled", "ambient"]),
  units: z.number().int("Units are whole numbers").min(0).max(100_000),
  weightKg: z.number().min(0).max(100_000),
  volumeM3: z.number().min(0).max(1_000),
});
export type OrderItem = z.infer<typeof orderItem>;

export async function saveOrders(
  tx: DBOrTx,
  input: {
    outlet: typeof s.outlets.$inferSelect;
    day: string;
    items: OrderItem[];
    by: User;
    channel: "app" | "phone";
    at: string;
  },
) {
  const { outlet, day, by, channel, at } = input;
  const items = z.array(orderItem).parse(input.items);
  const placed: string[] = [];
  for (const temp of tempsFor(outlet.brand)) {
    const item = items.find((x) => x.temp === temp);
    if (!item) continue;
    const id = orderIdFor(outlet.brand, day, outlet.id, temp);
    const [existing] = await tx
      .select()
      .from(s.orders)
      .where(eq(s.orders.id, id));
    if (existing && !["draft", "confirmed"].includes(existing.status))
      throw new OrderError(`${id} is already planned and can’t change now.`);
    if (item.units === 0) {
      if (existing) await tx.delete(s.orders).where(eq(s.orders.id, id));
      continue;
    }
    if (item.weightKg <= 0 || item.volumeM3 <= 0)
      throw new OrderError(`Enter the weight and volume of the ${temp} order.`);
    const values = {
      id,
      deliveryDay: day,
      outletId: outlet.id,
      brand: outlet.brand,
      temp,
      units: item.units,
      weightKg: item.weightKg,
      volumeM3: item.volumeM3,
      status: "confirmed" as const,
      placedAt: at,
      placedBy: by.id,
      channel,
    };
    if (existing)
      await tx.update(s.orders).set(values).where(eq(s.orders.id, id));
    else await tx.insert(s.orders).values(values);
    await tx.delete(s.orderLines).where(eq(s.orderLines.orderId, id));
    await tx.insert(s.orderLines).values({
      orderId: id,
      lineNo: 1,
      category: temp,
      name: lineName(temp),
      unitLabel: "Unit",
      cases: item.units,
      volumeM3: item.volumeM3,
      weightKg: item.weightKg,
    });
    placed.push(id);
    await logEvent(tx, {
      at,
      kind: "order.placed",
      actor: by,
      text:
        channel === "phone"
          ? `Entered phoned-in order ${id} for ${outlet.id}, ${dayLabel(day)}`
          : `Placed order ${id} for ${dayLabel(day)}`,
      orderId: id,
      outletId: outlet.id,
    });
  }
  return placed;
}
