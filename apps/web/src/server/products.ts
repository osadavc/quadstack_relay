import { db, schema as s } from "@relay/db";
import { tempsFor } from "@relay/domain";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import type { User } from "./auth";
import { touch } from "./clock";
import { logEvent } from "./record";

/*
 * The product list stores order from, kept by dispatch. A product belongs to
 * one brand and one temperature, with its weight and volume per unit. A
 * product that has been ordered is switched off rather than deleted.
 */

export class ProductError extends Error {}

export type Product = typeof s.products.$inferSelect;

export const productInput = z
  .object({
    sku: z
      .string()
      .trim()
      .min(1, "Enter a product code")
      .max(40, "Keep the code under 40 characters"),
    name: z.string().trim().min(2, "Enter a name").max(80),
    brand: z.enum(["Fresh", "Style", "Tech"]),
    temp: z.enum(["chilled", "ambient", "frozen"]),
    unit: z.string().trim().min(1, "Say what one unit is").max(30),
    weightKg: z.number().positive("Weight per unit must be above 0").max(5000),
    volumeM3: z.number().positive("Volume per unit must be above 0").max(50),
  })
  .refine((p) => tempsFor(p.brand).includes(p.temp), {
    message: "This brand orders ambient goods only",
    path: ["temp"],
  });
export type ProductInput = z.infer<typeof productInput>;

const parse = (input: unknown) => {
  const r = productInput.safeParse(input);
  if (!r.success)
    throw new ProductError(r.error.issues[0]?.message ?? "Check the product");
  return r.data;
};

/** Every product, with how many order lines use it. */
export async function productsView() {
  const rows = await db
    .select()
    .from(s.products)
    .orderBy(asc(s.products.brand), asc(s.products.temp), asc(s.products.name));
  const used = rows.length
    ? await db
        .select({ productId: s.orderLines.productId })
        .from(s.orderLines)
        .where(
          inArray(
            s.orderLines.productId,
            rows.map((p) => p.id),
          ),
        )
    : [];
  const count = new Map<number, number>();
  for (const u of used)
    if (u.productId) count.set(u.productId, (count.get(u.productId) ?? 0) + 1);
  return rows.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    brand: p.brand,
    temp: p.temp,
    unit: p.unit,
    weightKg: p.weightKg,
    volumeM3: p.volumeM3,
    active: p.active,
    orderLines: count.get(p.id) ?? 0,
  }));
}

export type ProductRow = Awaited<ReturnType<typeof productsView>>[number];

/** Active products for a brand and temperature, for the order forms. */
export async function activeProducts(brand: string, temp: string) {
  return db
    .select()
    .from(s.products)
    .where(
      and(
        eq(s.products.brand, brand as Product["brand"]),
        eq(s.products.temp, temp as Product["temp"]),
        eq(s.products.active, true),
      ),
    )
    .orderBy(asc(s.products.name));
}

async function skuTaken(sku: string, except?: number) {
  const [row] = await db
    .select({ id: s.products.id })
    .from(s.products)
    .where(
      except
        ? and(eq(s.products.sku, sku), ne(s.products.id, except))
        : eq(s.products.sku, sku),
    );
  return Boolean(row);
}

export async function createProduct(by: User, input: ProductInput) {
  const p = parse(input);
  if (await skuTaken(p.sku))
    throw new ProductError(`${p.sku} is already a product code`);
  await db.transaction(async (tx) => {
    await tx.insert(s.products).values(p);
    const at = await touch(tx);
    await logEvent(tx, {
      at,
      kind: "product.added",
      actor: by,
      text: `Added product ${p.sku} ${p.name}`,
    });
  });
}

/** Changes apply to new orders; lines already ordered keep their figures. */
export async function updateProduct(by: User, id: number, input: ProductInput) {
  const p = parse(input);
  const [current] = await db
    .select()
    .from(s.products)
    .where(eq(s.products.id, id));
  if (!current) throw new ProductError("That product no longer exists");
  if (await skuTaken(p.sku, id))
    throw new ProductError(`${p.sku} is already a product code`);
  await db.transaction(async (tx) => {
    await tx.update(s.products).set(p).where(eq(s.products.id, id));
    const at = await touch(tx);
    await logEvent(tx, {
      at,
      kind: "product.changed",
      actor: by,
      text: `Changed product ${p.sku} ${p.name}`,
    });
  });
}

export async function setProductActive(by: User, id: number, active: boolean) {
  await db.transaction(async (tx) => {
    const [p] = await tx
      .update(s.products)
      .set({ active })
      .where(eq(s.products.id, id))
      .returning();
    if (!p) throw new ProductError("That product no longer exists");
    const at = await touch(tx);
    await logEvent(tx, {
      at,
      kind: "product.changed",
      actor: by,
      text: `${active ? "Switched on" : "Switched off"} product ${p.sku} ${p.name}`,
    });
  });
}

const HEADER = [
  "sku",
  "name",
  "brand",
  "temp",
  "unit",
  "weight_kg",
  "volume_m3",
];

/**
 * Adds or updates products from CSV text with the header
 * sku,name,brand,temp,unit,weight_kg,volume_m3. A row whose code exists
 * updates that product. Nothing is saved if any row is wrong.
 */
export async function importProducts(by: User, text: string) {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2)
    throw new ProductError("Add a header row and at least one product");
  const head = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const missing = HEADER.filter((h) => !head.includes(h));
  if (missing.length)
    throw new ProductError(`The header is missing ${missing.join(", ")}`);
  const col = (cells: string[], name: string) =>
    (cells[head.indexOf(name)] ?? "").trim();
  const rows: ProductInput[] = [];
  const seen = new Set<string>();
  for (const [i, line] of lines.slice(1).entries()) {
    const cells = line.split(",");
    const r = productInput.safeParse({
      sku: col(cells, "sku"),
      name: col(cells, "name"),
      brand: col(cells, "brand"),
      temp: col(cells, "temp").toLowerCase(),
      unit: col(cells, "unit"),
      weightKg: Number(col(cells, "weight_kg")),
      volumeM3: Number(col(cells, "volume_m3")),
    });
    if (!r.success)
      throw new ProductError(
        `Row ${i + 2}: ${r.error.issues[0]?.message ?? "check the values"}`,
      );
    if (seen.has(r.data.sku))
      throw new ProductError(`Row ${i + 2}: ${r.data.sku} appears twice`);
    seen.add(r.data.sku);
    rows.push(r.data);
  }
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: s.products.id, sku: s.products.sku })
      .from(s.products)
      .where(
        inArray(
          s.products.sku,
          rows.map((r) => r.sku),
        ),
      );
    const bySku = new Map(existing.map((e) => [e.sku, e.id]));
    let added = 0;
    let updated = 0;
    for (const r of rows) {
      const id = bySku.get(r.sku);
      if (id) {
        await tx.update(s.products).set(r).where(eq(s.products.id, id));
        updated++;
      } else {
        await tx.insert(s.products).values(r);
        added++;
      }
    }
    const at = await touch(tx);
    await logEvent(tx, {
      at,
      kind: "product.import",
      actor: by,
      text: `Imported products: ${added} added, ${updated} updated`,
    });
    return { added, updated };
  });
}
