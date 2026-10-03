import { sql as raw } from "drizzle-orm";
import type { DB } from "../src/client";

/** Empties every table: no accounts, no reference data, no records. */
export async function wipeAll(db: DB) {
  const tables = await db.execute<{ tablename: string }>(
    raw`select tablename from pg_tables where schemaname = 'public'`,
  );
  const names = tables.map((t) => `"${t.tablename}"`);
  if (names.length)
    await db.execute(
      raw.raw(`TRUNCATE TABLE ${names.join(", ")} RESTART IDENTITY CASCADE`),
    );
  return names.length;
}
