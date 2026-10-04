import {
  addDays,
  colomboTime,
  dowOf,
  orderIdFor,
  type Temp,
} from "@relay/domain";
import { asc, eq, sql } from "drizzle-orm";
import {
  isOperating,
  nextOperatingDay,
  previousOperatingDays,
} from "../src/calendar";
import type { DB } from "../src/client";
import * as s from "../src/schema";
import { csv } from "./reference";

const SEED_KIND = "seed.delivery_day";
const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** Fictional demand, using the shared network and the user's demo catalogue. */
export function deliveryDayOrders(
  day: string,
  outlets: (typeof s.outlets.$inferSelect)[],
  products: (typeof s.products.$inferSelect)[],
) {
  const sorted = [...outlets].sort((a, b) => a.id.localeCompare(b.id));
  const fresh = sorted.filter((o) => o.brand === "Fresh");
  const style = sorted.filter((o) => o.brand === "Style");
  const tech = sorted.filter((o) => o.brand === "Tech");
  // Weekly Style cohorts (five of 25 stores). Tech orders at four stores.
  const styleCohort = (dowOf(day) + 5) % 5;
  const techCohort = Number(day.slice(8)) % 3;
  const techOrders = [
    ...tech.filter((o) => o.id === "OUT093"),
    ...tech.filter((o, i) => o.id !== "OUT093" && i % 3 === techCohort),
  ].slice(0, 4);
  const selected = [
    ...fresh,
    ...style.filter((_, i) => i % 5 === styleCohort),
    ...techOrders,
  ];
  return selected.flatMap((outlet) => {
    const index = fresh.findIndex((o) => o.id === outlet.id);
    const temps: Temp[] = ["ambient"];
    if (outlet.brand === "Fresh") {
      // Separate cold orders on this replenishment day; exactly half the stores.
      if (index % 2 === 1) temps.push("chilled");
      if (index % 10 === 4) temps.push("frozen");
    }
    return temps.map((temp) => {
      const pool = products
        .filter((p) => p.brand === outlet.brand && p.temp === temp && p.active)
        .sort((a, b) => a.sku.localeCompare(b.sku));
      if (!pool.length)
        throw new Error(`No active ${outlet.brand} ${temp} products`);
      const n = Number(outlet.id.slice(3));
      const count =
        outlet.brand === "Tech"
          ? 1
          : Math.min(pool.length, temp === "ambient" ? 6 : 4);
      const lines = Array.from({ length: count }, (_, i) => {
        const techIndex = tech.findIndex((o) => o.id === outlet.id) % 4;
        const appliance = [
          "DEMO-TE-A001",
          "DEMO-TE-A002",
          "DEMO-TE-A003",
          "DEMO-TE-A012",
        ][techIndex];
        const p =
          (outlet.brand === "Tech"
            ? pool.find((p) => p.sku === appliance)
            : undefined) ?? pool[(n * 3 + i) % pool.length];
        const baseQty =
          outlet.brand === "Tech"
            ? techIndex === 2
              ? 2
              : 1
            : outlet.brand === "Style"
              ? 8 + ((n * 3 + i * 7) % 13)
              : temp === "ambient"
                ? 10 + ((n * 7 + i * 3) % 13)
                : temp === "chilled"
                  ? 14 + ((n * 3 + i * 5) % 17)
                  : 4 + ((n + i * 3) % 7);
        // Restricted stores take smaller drops; each order fits an eligible van.
        const qty =
          outlet.parking === "van_only" && outlet.brand !== "Tech"
            ? Math.max(
                1,
                Math.floor(baseQty * (outlet.brand === "Style" ? 0.3 : 0.65)),
              )
            : baseQty;
        return {
          productId: p.id,
          category: p.sku,
          name: p.name,
          unitLabel: p.unit,
          cases: qty,
          volumeM3: round(p.volumeM3 * qty),
          weightKg: round(p.weightKg * qty),
        };
      });
      return {
        id: orderIdFor(outlet.brand, day, outlet.id, temp),
        outlet,
        temp,
        lines,
        units: lines.reduce((a, l) => a + l.cases, 0),
        weightKg: round(lines.reduce((a, l) => a + l.weightKg, 0)),
        volumeM3: round(lines.reduce((a, l) => a + l.volumeM3, 0)),
      };
    });
  });
}

/** Add one planning-ready day atomically; never rewrite existing orders or products. */
export async function seedDeliveryDay(db: DB, requestedDay?: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(20261004)`);
    const markers = await tx
      .select()
      .from(s.events)
      .where(eq(s.events.kind, SEED_KIND))
      .orderBy(asc(s.events.id));
    const previous = markers.find(
      (e) =>
        !requestedDay ||
        (e.data as { day?: string } | null)?.day === requestedDay,
    );
    if (previous)
      return {
        ...(previous.data as { day: string; orders: number; outlets: number }),
        inserted: 0,
      };

    let day = requestedDay;
    if (!day) {
      const at = colomboTime();
      day = await nextOperatingDay(tx, at.slice(0, 10));
      if (at >= `${addDays(day, -1)} 16:00:00`)
        day = await nextOperatingDay(tx, day);
      // Do not append orders to the user's already closed/planned delivery day.
      while (
        (
          await tx
            .select({ id: s.plans.id })
            .from(s.plans)
            .where(eq(s.plans.day, day))
            .limit(1)
        ).length
      ) {
        day = await nextOperatingDay(tx, day);
      }
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day
    )
      throw new Error("Use a valid YYYY-MM-DD delivery day");
    if (!(await isOperating(tx, day)))
      throw new Error(`${day} is not an operating day`);
    if (
      (
        await tx
          .select({ id: s.plans.id })
          .from(s.plans)
          .where(eq(s.plans.day, day))
          .limit(1)
      ).length
    )
      throw new Error(`${day} already has a plan; choose an unplanned day`);

    await tx
      .insert(s.products)
      .values(
        csv("demo_products.csv").map((p) => ({
          sku: p.sku,
          name: p.name,
          brand: p.brand as "Fresh" | "Style" | "Tech",
          temp: p.temp as Temp,
          unit: p.unit,
          weightKg: Number(p.weight_kg),
          volumeM3: Number(p.volume_m3),
        })),
      )
      .onConflictDoNothing({ target: s.products.sku });

    const outlets = await tx.select().from(s.outlets);
    const products = await tx.select().from(s.products);
    const dataset = deliveryDayOrders(day, outlets, products);
    const placedDay = addDays(day, -1);
    let inserted = 0;
    for (const [i, o] of dataset.entries()) {
      const at = `${placedDay} ${String(9 + (i % 7)).padStart(2, "0")}:${String((i * 11) % 60).padStart(2, "0")}:00`;
      const [created] = await tx
        .insert(s.orders)
        .values({
          id: o.id,
          deliveryDay: day,
          outletId: o.outlet.id,
          brand: o.outlet.brand,
          temp: o.temp,
          units: o.units,
          weightKg: o.weightKg,
          volumeM3: o.volumeM3,
          status: "confirmed",
          placedAt: at,
          channel: i % 4 === 0 ? "phone" : "app",
        })
        .onConflictDoNothing()
        .returning({ id: s.orders.id });
      if (!created) continue;
      await tx
        .insert(s.orderLines)
        .values(
          o.lines.map((l, n) => ({ ...l, orderId: o.id, lineNo: n + 1 })),
        );
      await tx.insert(s.events).values({
        at,
        kind: "order.placed",
        actorName: "Demo seed",
        text: `Seeded confirmed ${o.temp} order ${o.id} for ${o.outlet.id}`,
        source: "system",
        orderId: o.id,
        outletId: o.outlet.id,
        data: { synthetic: true },
      });
      // Reserve the walkthrough outlet for the seeded driver before allocation.
      if (o.outlet.id === "OUT074") {
        await tx
          .insert(s.pins)
          .values({
            day,
            orderId: o.id,
            kind: "vehicle",
            vehicleId: "VEH007",
            reason:
              "Demo seed: reserve the walkthrough delivery for the seeded driver",
            decidedAt: `${placedDay} 15:58:00`,
          })
          .onConflictDoNothing();
      }
      inserted++;
    }

    // Two prior operating runs give the fairness guard context without fake receipts.
    const historyDays = await previousOperatingDays(tx, day, 2);
    for (const o of dataset) {
      for (const [i, historyDay] of historyDays.entries()) {
        // One prior skip at a van-only store; it must be considered during planning.
        const skipped =
          i === 0 && o.outlet.id === "OUT077" && o.temp === "chilled";
        await tx
          .insert(s.serviceLog)
          .values({
            outletId: o.outlet.id,
            temp: o.temp,
            day: historyDay,
            outcome: skipped ? "deferred" : "served",
            note: skipped
              ? "Demo history: refrigerated van capacity exhausted"
              : "Demo service history",
          })
          .onConflictDoNothing();
      }
    }
    const summary = {
      day,
      orders: dataset.length,
      outlets: new Set(dataset.map((o) => o.outlet.id)).size,
    };
    await tx.insert(s.events).values({
      at: `${placedDay} 15:59:00`,
      kind: SEED_KIND,
      actorName: "Demo seed",
      text: `Seeded realistic delivery day ${day}: ${inserted} new confirmed orders`,
      source: "system",
      data: { ...summary, synthetic: true },
    });
    await tx
      .insert(s.opsState)
      .values({ id: 1, revision: 1 })
      .onConflictDoUpdate({
        target: s.opsState.id,
        set: { revision: sql`${s.opsState.revision} + 1` },
      });
    return { ...summary, inserted };
  });
}
