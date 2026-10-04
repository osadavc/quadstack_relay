import { type DBOrTx, schema as s } from "@relay/db";
import { dayLabel, lineName, orderIdFor, tempsFor } from "@relay/domain";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { User } from "./auth";
import { logEvent } from "./record";

/*
 * Saving an outlet's orders for a delivery day, from the store's form or
 * a call to dispatch. An order is either product lines (quantities of
 * products dispatch keeps, with weight and volume worked out per unit) or,
 * where no products exist for that brand and temperature, a count of units
 * with their total weight and volume. A temperature left out of the request
 * is untouched; zero units removes that order while it can still change.
 */

export class OrderError extends Error {}

export const orderItem = z.object({
  temp: z.enum(["chilled", "ambient", "frozen"]),
  units: z.number().int("Units are whole numbers").min(0).max(100_000),
  weightKg: z.number().min(0).max(100_000),
  volumeM3: z.number().min(0).max(1_000),
  /** Product quantities; when present, the totals above are worked out from them. */
  lines: z
    .array(
      z.object({
        productId: z.number().int(),
        qty: z.number().int("Quantities are whole numbers").min(0).max(100_000),
      }),
    )
    .optional(),
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

    const lines = await linesFor(tx, outlet.brand, temp, item);
    const units = lines.reduce((a, l) => a + l.cases, 0);
    if (units === 0) {
      if (existing) await tx.delete(s.orders).where(eq(s.orders.id, id));
      continue;
    }
    const weightKg = round(lines.reduce((a, l) => a + l.weightKg, 0));
    const volumeM3 = round(lines.reduce((a, l) => a + l.volumeM3, 0));
    if (weightKg <= 0 || volumeM3 <= 0)
      throw new OrderError(`Enter the weight and volume of the ${temp} order.`);
    const values = {
      id,
      deliveryDay: day,
      outletId: outlet.id,
      brand: outlet.brand,
      temp,
      units,
      weightKg,
      volumeM3,
      status: "confirmed" as const,
      placedAt: at,
      placedBy: by.id,
      channel,
    };
    if (existing)
      await tx.update(s.orders).set(values).where(eq(s.orders.id, id));
    else await tx.insert(s.orders).values(values);
    await tx.delete(s.orderLines).where(eq(s.orderLines.orderId, id));
    await tx
      .insert(s.orderLines)
      .values(lines.map((l, i) => ({ ...l, orderId: id, lineNo: i + 1 })));
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

type Line = Omit<typeof s.orderLines.$inferInsert, "orderId" | "lineNo">;

/** Totals worked out from per-unit figures, without floating-point tails. */
const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** The order's lines: one per product ordered, or one line of totals. */
async function linesFor(
  tx: DBOrTx,
  brand: string,
  temp: OrderItem["temp"],
  item: OrderItem,
): Promise<Line[]> {
  if (!item.lines) {
    if (item.units === 0) return [];
    return [
      {
        category: temp,
        name: lineName(temp),
        unitLabel: "Unit",
        cases: item.units,
        weightKg: item.weightKg,
        volumeM3: item.volumeM3,
      },
    ];
  }
  const wanted = item.lines.filter((l) => l.qty > 0);
  if (!wanted.length) return [];
  const ids = [...new Set(wanted.map((l) => l.productId))];
  const products = await tx
    .select()
    .from(s.products)
    .where(inArray(s.products.id, ids));
  const byId = new Map(products.map((p) => [p.id, p]));
  return wanted.map((l) => {
    const p = byId.get(l.productId);
    if (!p || !p.active)
      throw new OrderError("A product on this order is no longer available.");
    if (p.brand !== brand || p.temp !== temp)
      throw new OrderError(`${p.name} isn’t a ${brand} ${temp} product.`);
    return {
      productId: p.id,
      category: p.sku,
      name: p.name,
      unitLabel: p.unit,
      cases: l.qty,
      weightKg: round(p.weightKg * l.qty),
      volumeM3: round(p.volumeM3 * l.qty),
    };
  });
}
