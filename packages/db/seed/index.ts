import { db, sql } from "../src/client";
import * as s from "../src/schema";
import { seedReference } from "./reference";

/*
 * Loads the General Data files the Hackathon uses and one account per role,
 * only into an empty database. Runs with every `docker compose up`.
 *   bun run db:setup
 */

const [depots, users] = await Promise.all([
  db.$count(s.depots),
  db.$count(s.users),
]);
if (depots > 0 || users > 0) {
  console.log("the database already has data; run db:wipe to start again");
} else {
  await seedReference(db);
  console.log("loaded the datasets and one account per role");
}
await sql.end();
