"use client";

import { ArrowLeftRight, KeyRound, LogOut } from "lucide-react";
import { useState, useTransition } from "react";
import { changePassword, logout } from "@/app/actions/auth";
import { Dialog, Menu, type MenuItem, toast } from "./interact";
import { Avatar, Button, cx } from "./ui";

export const initialsOf = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** The account menu in every shell: change password and sign out. */
export function AccountMenu({
  user,
  tone = "accent",
  compact,
  dark,
  align = "end",
  trigger,
}: {
  user: { name: string; title: string; email: string };
  tone?: "accent" | "success" | "warning" | "solidAccent";
  compact?: boolean;
  dark?: boolean;
  align?: "start" | "end";
  trigger?: "pill";
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items: MenuItem[] = [
    { heading: user.email } as MenuItem,
    {
      label: "Change password",
      icon: KeyRound,
      onSelect: () => {
        setError(null);
        setOpen(true);
      },
    },
    { label: "Sign out", icon: LogOut, onSelect: () => start(() => logout()) },
  ];

  return (
    <>
      <Menu
        align={align}
        width={248}
        items={items}
        trigger={(p) =>
          trigger === "pill" ? (
            <button
              type="button"
              {...p}
              className="flex h-9 items-center gap-2 rounded-full bg-white/12 py-1 pr-3 pl-1 t-small-m text-fg-inverse transition-colors hover:bg-white/20"
            >
              <Avatar
                initials={initialsOf(user.name)}
                size={28}
                tone={tone === "solidAccent" ? "solidAccent" : tone}
              />
              <span className="max-sm:hidden">{shortName(user.name)}</span>
              <ArrowLeftRight
                size={14}
                className="text-fg-inverse/60"
                aria-hidden
              />
            </button>
          ) : (
            <button
              type="button"
              {...p}
              aria-label={`${user.name}, account menu`}
              className={cx(
                "flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors",
                dark ? "hover:bg-white/10" : "hover:bg-muted/60",
              )}
            >
              <Avatar
                initials={initialsOf(user.name)}
                size={32}
                tone={tone === "solidAccent" ? "solidAccent" : tone}
              />
              <span className={cx("min-w-0", compact && "max-md:hidden")}>
                <span className="block truncate t-small-m">{user.name}</span>
                <span className="block truncate t-caption text-fg-3">
                  {user.title}
                </span>
              </span>
            </button>
          )
        }
      />
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Change password"
        width={400}
      >
        <form
          className="flex flex-col gap-3"
          action={(form) =>
            start(async () => {
              const res = await changePassword(
                String(form.get("current") ?? ""),
                String(form.get("next") ?? ""),
              );
              if (res.ok) {
                setOpen(false);
                toast("Password changed", { tone: "success" });
              } else setError(res.error);
            })
          }
        >
          <label className="flex flex-col gap-1.5">
            <span className="t-small-m">Current password</span>
            <input
              name="current"
              type="password"
              autoComplete="current-password"
              required
              className="h-10 rounded-lg border border-line-strong bg-surface px-3 t-body outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="t-small-m">New password</span>
            <input
              name="next"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              className="h-10 rounded-lg border border-line-strong bg-surface px-3 t-body outline-none focus:border-accent"
            />
            <span className="t-caption text-fg-3">At least 8 characters</span>
          </label>
          {error && <p className="t-small text-danger-text">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Saving" : "Save"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

function shortName(name: string) {
  const [a, b] = name.split(" ");
  return b ? `${a} ${b[0]}.` : a;
}
