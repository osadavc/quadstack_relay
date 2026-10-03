import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url =
  process.env.DATABASE_URL ?? "postgres://relay:relay@localhost:5432/relay";

// One pool per process; reused across hot reloads in development.
const g = globalThis as unknown as { __relaySql?: postgres.Sql };
export const sql =
  g.__relaySql ??
  postgres(url, {
    max: Number(process.env.DATABASE_POOL ?? 8),
    // Works behind transaction-mode poolers (Neon, PgBouncer).
    prepare: false,
    onnotice: () => {},
  });
if (process.env.NODE_ENV !== "production") g.__relaySql = sql;

export const db = drizzle(sql, { schema });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type DBOrTx = DB | Tx;
