"use server";

import { db, hashPassword, schema as s, verifyPassword } from "@relay/db";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { act } from "@/server/action";
import { AuthError, HOME, signIn, signOut, userOrThrow } from "@/server/auth";

export async function login(_: unknown, form: FormData) {
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(form.get("password") ?? "");
  const [user] = await db
    .select()
    .from(s.users)
    .where(eq(s.users.email, email));
  if (!user || !verifyPassword(password, user.passwordHash))
    return { error: "That email and password don’t match an account." };
  if (!user.active)
    return { error: "This account has been switched off. Ask dispatch." };
  await signIn(user);
  // Back to the page they opened, when it is in their own part of the app.
  const next = String(form.get("next") ?? "");
  const own = [
    HOME[user.role].split("/")[1],
    ...(user.role === "driver" ? ["h"] : []),
  ];
  const ok = /^\/(?![/\\])/.test(next) && own.includes(next.split("/")[1]);
  redirect(ok ? next : HOME[user.role]);
}

export async function logout() {
  await signOut();
  redirect("/login");
}

export async function changePassword(current: string, next: string) {
  return act(async () => {
    const user = await userOrThrow();
    if (!verifyPassword(current, user.passwordHash))
      throw new AuthError("The current password isn’t right.");
    if (next.length < 8) throw new AuthError("Use at least 8 characters.");
    await db
      .update(s.users)
      .set({ passwordHash: hashPassword(next) })
      .where(eq(s.users.id, user.id));
    return null;
  });
}

/** First run only: with no accounts at all, create the first dispatcher. */
export async function setupFirstAccount(_: unknown, form: FormData) {
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(form.get("password") ?? "");
  if (name.length < 2) return { error: "Enter your name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return { error: "Enter a valid email." };
  if (password.length < 8) return { error: "Use at least 8 characters." };
  const created = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(7101)`);
    if ((await tx.$count(s.users)) > 0) return null;
    const [u] = await tx
      .insert(s.users)
      .values({
        name,
        email,
        role: "dispatcher",
        title: "Dispatcher",
        passwordHash: hashPassword(password),
      })
      .returning({ id: s.users.id, createdAt: s.users.createdAt });
    return u;
  });
  if (!created) return { error: "Relay is already set up. Sign in instead." };
  await signIn(created);
  redirect(HOME.dispatcher);
}
