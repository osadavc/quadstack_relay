"use client";

import { useActionState } from "react";
import { login, setupFirstAccount } from "@/app/actions/auth";
import { Button } from "@/components/ui";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 shadow-pop max-sm:p-5"
    >
      <h1 className="t-title">Sign in</h1>
      {next && <input type="hidden" name="next" value={next} />}
      <label className="flex flex-col gap-1.5">
        <span className="t-small-m">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          className="h-10 rounded-[10px] border border-line-strong bg-surface px-3 t-body outline-none focus:border-accent max-md:h-[46px]"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="t-small-m">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-10 rounded-[10px] border border-line-strong bg-surface px-3 t-body outline-none focus:border-accent max-md:h-[46px]"
        />
      </label>
      {state?.error && (
        <p className="t-small text-danger-text">{state.error}</p>
      )}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={pending}
        className="max-md:h-[46px]"
      >
        {pending ? "Signing in" : "Sign in"}
      </Button>
      <p className="t-caption text-fg-3">
        No account? Ask your dispatcher to add you.
      </p>
    </form>
  );
}

const input =
  "h-10 rounded-[10px] border border-line-strong bg-surface px-3 t-body outline-none focus:border-accent max-md:h-[46px]";

/** Shown once, while the database has no accounts. */
export function SetupForm() {
  const [state, action, pending] = useActionState(setupFirstAccount, null);
  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 shadow-pop max-sm:p-5"
    >
      <div className="flex flex-col gap-1">
        <h1 className="t-title">Set up Relay</h1>
        <p className="t-small text-fg-2">
          Create the first dispatcher account. You add everyone else from
          People.
        </p>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="t-small-m">Name</span>
        <input name="name" autoComplete="name" required className={input} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="t-small-m">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="t-small-m">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className={input}
        />
        <span className="t-caption text-fg-3">At least 8 characters</span>
      </label>
      {state?.error && (
        <p className="t-small text-danger-text">{state.error}</p>
      )}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={pending}
        className="max-md:h-[46px]"
      >
        {pending ? "Creating account" : "Create account"}
      </Button>
    </form>
  );
}
