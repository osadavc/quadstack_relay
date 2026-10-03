import { join } from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "./client";

/* Applies the SQL migrations in /migrations. Safe to run on every start. */
await migrate(db, { migrationsFolder: join(import.meta.dir, "../migrations") });
console.log("migrations applied");
await sql.end();
