import { db, schema as s } from "@relay/db";
import { redirect } from "next/navigation";
import { RelayMark } from "@/components/brand";
import { currentUser, HOME } from "@/server/auth";
import { LoginForm, SetupForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const user = await currentUser();
  if (user) redirect(HOME[user.role]);
  const fresh = (await db.$count(s.users)) === 0;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="flex w-full max-w-[380px] flex-col gap-6">
        <div className="flex items-center gap-3">
          <RelayMark size={32} />
          <div>
            <p className="t-heading">Relay</p>
            <p className="t-small text-fg-3">Waypoint Group</p>
          </div>
        </div>
        {fresh ? (
          <SetupForm />
        ) : (
          <LoginForm next={typeof next === "string" ? next : undefined} />
        )}
      </div>
    </main>
  );
}
