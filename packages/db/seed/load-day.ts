import { db, sql } from "../src/client";
import { seedDeliveryDay } from "./delivery-day";

// Add the demo to an existing installation without wiping anything.
const args = process.argv.slice(2);
if (args.length > 1) throw new Error("Usage: bun run db:seed-day [YYYY-MM-DD]");
try {
  console.log(await seedDeliveryDay(db, args[0]));
} finally {
  await sql.end();
}
