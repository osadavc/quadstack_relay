"use client";

import { Bell, Store } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { markReadAction, reportIssueAction } from "@/app/actions/store";
import { AccountMenu } from "../account-menu";
import { RelayMark } from "../brand";
import { Dialog, Menu, PhoneSheet, toast, useDisclosure } from "../interact";
import { useIsPhone } from "../store/bits";
import { Button, cx, Dot } from "../ui";

type ShellUser = { name: string; title: string; email: string };

/* ================= Store ================= */

export interface StoreHeaderData {
  outlet: { id: string; name: string; brand: string };
  notifications: {
    id: string;
    title: string;
    body: string | null;
    link: string | null;
    at: string;
    unread: boolean;
  }[];
  unread: number;
}

const STORE_NAV = [
  { label: "Order", href: "/store/order", tab: "order" },
  { label: "Deliveries", href: "/store/today", tab: "deliveries" },
  { label: "Receipts", href: "/store/receipts", tab: "receipts" },
];

export function StoreShell({
  user,
  header,
  children,
}: {
  user: ShellUser;
  header: StoreHeaderData;
  children: ReactNode;
}) {
  const path = usePathname();
  const issues = useDisclosure();
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      {/* Desktop and tablet */}
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-surface px-5 max-md:hidden">
        <div className="flex items-center gap-2">
          <RelayMark size={28} />
          <span className="t-subheading">Relay</span>
          <span className="t-subheading text-fg-3">Store</span>
        </div>
        <span className="flex h-8 items-center gap-2 rounded-lg bg-subtle px-3 t-small-m max-lg:hidden">
          <Dot tone="success" />
          {header.outlet.id} · {header.outlet.name}
        </span>
        <nav className="ml-2 flex items-center gap-1">
          {STORE_NAV.map((n) => (
            <Link
              key={n.label}
              href={n.href}
              className={cx(
                "flex h-8 items-center rounded-lg px-3 t-small-m",
                path.startsWith(n.href)
                  ? "bg-subtle text-fg"
                  : "text-fg-2 hover:text-fg",
              )}
            >
              {n.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={issues.onOpen}
            className="flex h-8 items-center rounded-lg px-3 t-small-m text-fg-2 transition-colors hover:text-fg"
          >
            Issues
          </button>
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <StoreBell header={header} />
          <AccountMenu user={user} tone="success" compact />
        </div>
      </header>

      {/* Phone: app header and the web tab row */}
      <header className="flex shrink-0 items-center gap-3 px-5 pt-3 pb-2.5 md:hidden">
        <span
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-fresh text-fg-inverse"
          aria-hidden
        >
          <Store size={20} strokeWidth={1.7} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate t-subheading">
            {header.outlet.id} · {header.outlet.name}
          </p>
          <p className="truncate t-caption text-fg-3">
            Waypoint {header.outlet.brand}
          </p>
        </div>
        <StoreBell header={header} phone />
        <AccountMenu user={user} tone="success" compact />
      </header>
      <nav
        aria-label="Store"
        className="flex shrink-0 items-start gap-6 overflow-x-auto border-b border-line px-5 md:hidden"
      >
        {STORE_NAV.map((t) => {
          const on = path.startsWith(t.href);
          return (
            <Link
              key={t.tab}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={cx(
                "flex shrink-0 flex-col gap-2 pt-2.5 t-small-m transition-colors",
                on ? "text-fg" : "text-fg-3 hover:text-fg-2",
              )}
            >
              <span>{t.label}</span>
              <span
                className={cx("h-0.5 w-full rounded-full", on && "bg-fg")}
                aria-hidden
              />
            </Link>
          );
        })}
        <button
          type="button"
          onClick={issues.onOpen}
          className="flex shrink-0 flex-col gap-2 pt-2.5 t-small-m text-fg-3 hover:text-fg-2"
        >
          <span>Issues</span>
          <span className="h-0.5 w-full rounded-full" aria-hidden />
        </button>
      </nav>

      <div className="flex-1">{children}</div>
      <IssueDialog open={issues.open} onClose={issues.onClose} />
    </div>
  );
}

function StoreBell({
  header,
  phone,
}: {
  header: StoreHeaderData;
  phone?: boolean;
}) {
  const router = useRouter();
  const [seen, setSeen] = useState(false);
  const unread = !seen && header.unread > 0;
  return (
    <Menu
      align="end"
      width={320}
      items={[
        { heading: "Notifications" },
        ...(header.notifications.length
          ? header.notifications.slice(0, 8).map((n) => ({
              label: n.title,
              detail: `${n.at}${n.body ? ` · ${n.body}` : ""}`,
              icon: Bell,
              onSelect: () => n.link && router.push(n.link),
            }))
          : [
              {
                label: "No notifications",
                onSelect: () => {},
                disabled: true,
              },
            ]),
      ]}
      trigger={(p) => (
        <button
          type="button"
          {...p}
          onClick={() => {
            p.onClick();
            if (unread) {
              setSeen(true);
              markReadAction();
            }
          }}
          aria-label={
            unread ? `Notifications, ${header.unread} unread` : "Notifications"
          }
          className={cx(
            "relative inline-flex items-center justify-center text-fg transition-colors",
            phone
              ? "size-10 rounded-xl border border-line bg-surface hover:bg-subtle"
              : "rounded-lg p-1.5 text-fg-2 hover:bg-subtle hover:text-fg",
          )}
        >
          <Bell size={phone ? 20 : 18} strokeWidth={1.7} aria-hidden />
          {unread && (
            <span
              className={cx(
                "absolute size-2 rounded-full border-[1.5px] border-surface bg-accent",
                phone ? "top-2 right-2.5" : "top-1 right-1",
              )}
              aria-hidden
            />
          )}
        </button>
      )}
    />
  );
}

const ISSUE_TYPES = [
  "Missing goods",
  "Damaged goods",
  "Late delivery",
  "Wrong item",
  "Something else",
];

function IssueDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [type, setType] = useState(ISSUE_TYPES[0]);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const send = () =>
    start(async () => {
      const res = await reportIssueAction(type, note);
      if (!res.ok) return toast(res.error, { tone: "warning" });
      onClose();
      setNote("");
      setType(ISSUE_TYPES[0]);
      toast("Issue sent to dispatch", { detail: type, tone: "success" });
    });
  const body = (
    <>
      <p className="mb-2 t-caption-m text-fg-3">What happened</p>
      <div className="flex flex-wrap gap-2">
        {ISSUE_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={type === t}
            onClick={() => setType(t)}
            className={cx(
              "h-9 rounded-lg border px-3 t-small-m transition-colors max-md:h-10",
              type === t
                ? "border-accent bg-accent-tint text-accent-text"
                : "border-line bg-surface text-fg-2 hover:bg-subtle",
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <label className="mt-4 block">
        <span className="mb-1.5 block t-caption-m text-fg-3">
          Details (optional)
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="What’s wrong, and how many units"
          className="w-full resize-none rounded-lg border border-line-strong bg-surface px-3 py-2 t-body outline-none focus:border-accent"
        />
      </label>
    </>
  );
  const phone = useIsPhone();
  return phone ? (
    <PhoneSheet
      open={open}
      onClose={onClose}
      title="Report an issue"
      actions={
        <Button
          variant="primary"
          size="xl"
          full
          disabled={pending}
          onClick={send}
        >
          Send to dispatch
        </Button>
      }
    >
      {body}
    </PhoneSheet>
  ) : (
    <div>
      <Dialog
        open={open}
        onClose={onClose}
        title="Report an issue"
        actions={
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={pending} onClick={send}>
              Send to dispatch
            </Button>
          </>
        }
      >
        {body}
      </Dialog>
    </div>
  );
}
