/* Print a session cookie for an account, for curl checks: bun scripts/session.ts gayan@waypoint.lk */
import { db, schema as s } from "@relay/db";
import { eq } from "drizzle-orm";
import { SignJWT } from "jose";

const email = process.argv[2] ?? "gayan@waypoint.lk";
const [u] = await db.select().from(s.users).where(eq(s.users.email, email));
if (!u) throw new Error(`no user ${email}`);
const token = await new SignJWT({
  sub: String(u.id),
  ca: u.createdAt.getTime(),
})
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("30d")
  .sign(
    new TextEncoder().encode(
      process.env.AUTH_SECRET ?? "relay-development-secret-change-me",
    ),
  );
console.log(`relay_session=${token}`);
process.exit(0);
