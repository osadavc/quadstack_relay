import { db, schema as s } from "@relay/db";
import type { Role } from "@relay/domain";
import { eq } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

/*
 * Sessions are a signed cookie holding the user id and the account's
 * creation time. Each request reloads the user, so a changed role, a
 * switched-off account or a deleted one takes effect at once.
 */

export const SESSION_COOKIE = "relay_session";

const secret = () =>
  new TextEncoder().encode(
    process.env.AUTH_SECRET ?? "relay-development-secret-change-me",
  );

export type User = typeof s.users.$inferSelect;

export const HOME: Record<Role, string> = {
  dispatcher: "/dispatcher/orders",
  loader: "/loader",
  driver: "/driver",
  store: "/store/order",
};

/** A session names the account and when it was created, so a recreated id never inherits it. */
export async function signIn(user: Pick<User, "id" | "createdAt">) {
  const token = await new SignJWT({
    sub: String(user.id),
    ca: user.createdAt.getTime(),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
}

export const currentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const id = Number(payload.sub);
    if (!id) return null;
    const [user] = await db.select().from(s.users).where(eq(s.users.id, id));
    if (!user?.active || payload.ca !== user.createdAt.getTime()) return null;
    return user;
  } catch {
    return null;
  }
});

/** The signed-in user, or a redirect to sign in or to their own home. */
export async function requireUser(role?: Role | Role[]): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  const allowed = role ? (Array.isArray(role) ? role : [role]) : null;
  if (allowed && !allowed.includes(user.role)) redirect(HOME[user.role]);
  return user;
}

/** For route handlers and actions: the user or an error, never a redirect. */
export async function userOrThrow(role?: Role | Role[]): Promise<User> {
  const user = await currentUser();
  if (!user) throw new AuthError("Sign in again");
  const allowed = role ? (Array.isArray(role) ? role : [role]) : null;
  if (allowed && !allowed.includes(user.role))
    throw new AuthError("This account can’t do that");
  return user;
}

export class AuthError extends Error {}

export const firstName = (u: { name: string }) => u.name.split(" ")[0];
