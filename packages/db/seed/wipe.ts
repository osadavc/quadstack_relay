import { db, sql } from "../src/client";
import { wipeAll } from "./wipe-all";

/* Empties every table: no accounts, no reference data, no records. `bun run db:wipe` */
console.log(`emptied ${await wipeAll(db)} tables`);
await sql.end();
