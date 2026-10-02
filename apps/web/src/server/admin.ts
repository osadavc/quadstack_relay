import { db, hashPassword, schema as s } from "@relay/db";
import { dayLabel, type Role, tempsFor } from "@relay/domain";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { User } from "./auth";
import { orderingDay, touch } from "./clock";
import { type OrderItem, saveOrders } from "./orders";
import { logEvent } from "./record";

/* Accounts, and orders that stores phone in. */

export class AdminError extends Error {}

/** Everyone with an account, and what the add-person form can choose from. */
export async function peopleView() {
  const users = await db
    .select()
    .from(s.users)
    .orderBy(asc(s.users.role), asc(s.users.name));
  const depots = await db
    .select({ id: s.depots.id, name: s.depots.name })
    .from(s.depots)
    .orderBy(asc(s.depots.id));
  const vehicles = await db
    .select({
      id: s.vehicles.id,
      type: s.vehicles.type,
      temp: s.vehicles.temp,
      depot: s.vehicles.depot,
    })
    .from(s.vehicles)
    .orderBy(asc(s.vehicles.id));
  const outlets = await db
    .select({
      id: s.outlets.id,
      name: s.outlets.name,
      brand: s.outlets.brand,
      depot: s.outlets.depot,
    })
    .from(s.outlets)
    .orderBy(asc(s.outlets.id));
  return {
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      title: u.title,
      phone: u.phone,
      depot: u.depot,
      vehicleId: u.vehicleId,
      outletId: u.outletId,
      active: u.active,
    })),
    depots,
    vehicles,
    outlets,
  };
}

export type PeopleData = Awaited<ReturnType<typeof peopleView>>;

/** Outlets at a depot with the goods each can order, for entering a phoned-in order. */
export async function phoneOrderView(depot: string) {
  const outlets = await db
    .select()
    .from(s.outlets)
    .where(eq(s.outlets.depot, depot))
    .orderBy(asc(s.outlets.id));
  const day = await orderingDay();
  const products = await db
    .select()
    .from(s.products)
    .where(eq(s.products.active, true))
    .orderBy(asc(s.products.name));
  return {
    day,
    dayLabel: dayLabel(day),
    /** Active products by `${brand}|${temp}`. */
    products: products.reduce<
      Record<
        string,
        {
          id: number;
          sku: string;
          name: string;
          unit: string;
          weightKg: number;
          volumeM3: number;
        }[]
      >
    >((acc, p) => {
      const key = `${p.brand}|${p.temp}`;
      acc[key] = [
        ...(acc[key] ?? []),
        {
          id: p.id,
          sku: p.sku,
          name: p.name,
          unit: p.unit,
          weightKg: p.weightKg,
          volumeM3: p.volumeM3,
        },
      ];
      return acc;
    }, {}),
    outlets: outlets.map((o) => ({
      id: o.id,
      name: o.name,
      brand: o.brand,
      district: o.district,
      temps: tempsFor(o.brand),
    })),
  };
}

export type PhoneOrderData = Awaited<ReturnType<typeof phoneOrderView>>;

export const newUserSchema = z
  .object({
    name: z.string().trim().min(2, "Enter a name"),
    email: z.string().trim().toLowerCase().email("Enter a valid email"),
    role: z.enum(["dispatcher", "loader", "driver", "store"]),
    phone: z.string().trim().optional(),
    depot: z.string().optional(),
    vehicleId: z.string().optional(),
    outletId: z.string().optional(),
    password: z.string().min(8, "At least 8 characters"),
  })
  .refine((u) => u.role !== "driver" || u.vehicleId, {
    message: "Choose a vehicle",
    path: ["vehicleId"],
  })
  .refine((u) => u.role !== "store" || u.outletId, {
    message: "Choose an outlet",
    path: ["outletId"],
  })
  .refine((u) => u.role !== "loader" || u.depot, {
    message: "Choose a depot",
    path: ["depot"],
  });

export type NewUser = z.infer<typeof newUserSchema>;

const TITLE: Record<Role, string> = {
  dispatcher: "Dispatcher",
  loader: "Loader",
  driver: "Driver",
  store: "Store manager",
};

export async function createUser(by: User, input: NewUser) {
  const parsed = newUserSchema.safeParse(input);
  if (!parsed.success)
    throw new AdminError(parsed.error.issues[0]?.message ?? "Check the form");
  const u = parsed.data;
  const [taken] = await db
    .select({ id: s.users.id })
    .from(s.users)
    .where(eq(s.users.email, u.email));
  if (taken) throw new AdminError("An account with that email already exists");
  let depot = u.depot ?? null;
  if (u.role === "driver" && u.vehicleId) {
    const [v] = await db
      .select()
      .from(s.vehicles)
      .where(eq(s.vehicles.id, u.vehicleId));
    if (!v) throw new AdminError("Unknown vehicle");
    depot = v.depot;
  }
  if (u.role === "store" && u.outletId) {
    const [o] = await db
      .select()
      .from(s.outlets)
      .where(eq(s.outlets.id, u.outletId));
    if (!o) throw new AdminError("Unknown outlet");
    depot = null;
  }
  const where =
    u.role === "driver" ? u.vehicleId : u.role === "store" ? u.outletId : depot;
  await db.transaction(async (tx) => {
    await tx.insert(s.users).values({
      name: u.name,
      email: u.email,
      role: u.role,
      title: `${TITLE[u.role]} · ${where}`,
      phone: u.phone || null,
      depot,
      vehicleId: u.role === "driver" ? u.vehicleId : null,
      outletId: u.role === "store" ? u.outletId : null,
      passwordHash: hashPassword(u.password),
    });
    const at = await touch(tx);
    await logEvent(tx, {
      at,
      kind: "admin.user",
      actor: by,
      text: `Added ${u.name} as ${TITLE[u.role].toLowerCase()} (${where})`,
    });
  });
}

export async function setUserActive(by: User, id: number, active: boolean) {
  if (id === by.id)
    throw new AdminError("You can’t deactivate your own account");
  await db.update(s.users).set({ active }).where(eq(s.users.id, id));
  await touch(db);
}

export async function resetPassword(id: number, password: string) {
  if (password.length < 8) throw new AdminError("At least 8 characters");
  await db
    .update(s.users)
    .set({ passwordHash: hashPassword(password) })
    .where(eq(s.users.id, id));
}

/** An order a store phoned in, entered by dispatch for the next ordering day. */
export async function createPhoneOrder(
  by: User,
  outletId: string,
  items: OrderItem[],
) {
  return db.transaction(async (tx) => {
    const [outlet] = await tx
      .select()
      .from(s.outlets)
      .where(eq(s.outlets.id, outletId));
    if (!outlet) throw new AdminError("Unknown outlet");
    const day = await orderingDay(tx);
    const at = await touch(tx);
    const placed = await saveOrders(tx, {
      outlet,
      day,
      items,
      by,
      channel: "phone",
      at,
    });
    if (!placed.length)
      throw new AdminError(
        "Enter units, weight and volume for at least one order",
      );
    return { placed, day };
  });
}
