import { db, schema as s } from "@relay/db";
import { asc } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import type { User } from "./auth";

/* The depots in the database, and the one a dispatcher is looking at. */

export const DEPOT_COOKIE = "relay_depot";

export const depotList = cache(async () =>
  db
    .select({ id: s.depots.id, name: s.depots.name })
    .from(s.depots)
    .orderBy(asc(s.depots.id)),
);

/** The chosen depot if it exists, else the person's own, else the first; "" when there are none. */
export async function currentDepot(user: User): Promise<string> {
  const list = await depotList();
  const ids = new Set(list.map((d) => d.id));
  const chosen = (await cookies()).get(DEPOT_COOKIE)?.value;
  if (chosen && ids.has(chosen)) return chosen;
  if (user.depot && ids.has(user.depot)) return user.depot;
  return list[0]?.id ?? "";
}
