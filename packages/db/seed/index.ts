import { db, sql } from "../src/client";
import * as s from "../src/schema";
import { seedDeliveryDay } from "./delivery-day";
import { seedReference, seedUsers } from "./reference";

/*
 * Loads General Data, seven accounts, demo products and one delivery day
 * into an empty database; adds only missing demo accounts to existing data.
 * Runs with every `docker compose up`.
 *   bun run db:setup
 */

const [depots, users] = await Promise.all([
  db.$count(s.depots),
  db.$count(s.users),
]);
if (depots > 0 || users > 0) {
  const added = await seedUsers(db);
  console.log(
    `the database already has data; added ${added.length} missing demo accounts. Run db:seed-day to add the delivery day without wiping it`,
  );
} else {
  await seedReference(db);
  const day = await seedDeliveryDay(db);
  console.log(
    `loaded the datasets, seven accounts and ${day.orders} orders for ${day.day}`,
  );
}
await sql.end();
