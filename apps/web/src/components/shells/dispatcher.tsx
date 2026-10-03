"use client";

import {
  CalendarX,
  Inbox,
  LayoutGrid,
  Menu as MenuIcon,
  Package,
  RadioTower,
  Store,
  Truck,
  Users,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState, useTransition } from "react";
import { setDepotAction, vehicleStatusAction } from "@/app/actions/dispatch";
import { AccountMenu } from "../account-menu";
import { RelayMark } from "../brand";
import { Sheet, tap } from "../dispatcher/bits";
import { toast, useDisclosure } from "../interact";
import { Button, cx, Dot, Pill } from "../ui";

type ShellUser = { name: string; title: string; email: string };

/* ================= Dispatcher =================
 * A sidebar on a desktop. On a phone or tablet it becomes a top bar with a
 * menu button that opens the same navigation in a drawer.
 */

export interface DispatchCounts {
  clock: string;
  dayLabel: string;
  orders: number;
  deferred: number;
  decisions: number;
  attention: number;
  offline: number;
  offlineVehicle: string | null;
}

export interface FleetRow {
  id: string;
  label: string;
  cap: string;
  temp: string;
  type: string;
  status: "available" | "workshop";
  note: string | null;
  trips: string[];
}

export interface OutletWatch {
  counts: { Fresh: number; Style: number; Tech: number };
  total: number;
  watch: { id: string; name: string; skips: number; note: string }[];
}

type NavItem = {
  label: string;
  icon: typeof Inbox;
  href: string;
  count: string | number | null;
  warn?: boolean;
};

export function DispatcherShell({
  user,
  depot,
  depots,
  counts,
  fleet,
  outlets,
  children,
}: {
  user: ShellUser;
  depot: string;
  depots: { id: string; name: string }[];
  counts: DispatchCounts;
  fleet: FleetRow[];
  outlets: OutletWatch;
  children: ReactNode;
}) {
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const fleetPanel = useDisclosure();
  const outletPanel = useDisclosure();
  const nav: NavItem[] = [
    {
      label: "Orders",
      icon: Inbox,
      href: "/dispatcher/orders",
      count: counts.orders || null,
    },
    {
      label: "Plan",
      icon: LayoutGrid,
      href: "/dispatcher/plan",
      count: counts.decisions ? `${counts.decisions} to decide` : null,
      warn: counts.decisions > 0,
    },
    {
      label: "Live",
      icon: RadioTower,
      href: "/dispatcher/live",
      count: counts.attention || null,
      warn: counts.attention > 0,
    },
    {
      label: "Deferrals",
      icon: CalendarX,
      href: "/dispatcher/deferrals",
      count: counts.deferred || null,
    },
  ];
  const title =
    nav.find((n) => path.startsWith(n.href))?.label ??
    (path.startsWith("/dispatcher/people")
      ? "People"
      : path.startsWith("/dispatcher/products")
        ? "Products"
        : "Relay");

  const body = (inDrawer: boolean) => (
    <SidebarBody
      nav={nav}
      path={path}
      depot={depot}
      depots={depots}
      counts={counts}
      fleet={fleet.length}
      outlets={outlets.total}
      onFleet={() => {
        setMenu(false);
        fleetPanel.onOpen();
      }}
      onOutlets={() => {
        setMenu(false);
        outletPanel.onOpen();
      }}
      onNavigate={() => setMenu(false)}
      onClose={inDrawer ? () => setMenu(false) : undefined}
      account={inDrawer ? null : <AccountMenu user={user} align="start" />}
    />
  );

  return (
    <div className="flex h-dvh min-h-[640px] bg-canvas max-xl:block max-xl:h-auto max-xl:min-h-dvh">
      <aside className="flex w-[232px] shrink-0 flex-col px-3 pt-4 pb-3 max-xl:hidden">
        {body(false)}
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-canvas pr-3 pl-1.5 xl:hidden">
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={menu}
          onClick={() => setMenu(true)}
          className="inline-flex size-11 items-center justify-center rounded-[10px] text-fg-2 transition-colors hover:bg-muted/60 hover:text-fg"
        >
          <MenuIcon size={20} strokeWidth={1.8} aria-hidden />
        </button>
        <RelayMark size={26} />
        <p className="min-w-0 flex-1 truncate t-subheading">{title}</p>
        <AccountMenu user={user} compact />
      </header>

      {menu && <Drawer onClose={() => setMenu(false)}>{body(true)}</Drawer>}

      <main className="my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card max-xl:m-0 max-xl:block max-xl:min-h-[calc(100dvh-56px)] max-xl:overflow-visible max-xl:rounded-none max-xl:border-0 max-xl:shadow-none">
        {children}
      </main>

      <FleetPanel
        open={fleetPanel.open}
        onClose={fleetPanel.onClose}
        fleet={fleet}
        depot={depot}
        dayLabel={counts.dayLabel}
      />
      <OutletPanel
        open={outletPanel.open}
        onClose={outletPanel.onClose}
        outlets={outlets}
        depot={depot}
      />
    </div>
  );
}

/* The phone and tablet menu: the sidebar in a drawer from the left. */
function Drawer({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 xl:hidden">
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-inverse/35"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className="absolute inset-y-0 left-0 flex w-[296px] max-w-[85vw] flex-col overflow-y-auto bg-canvas px-3 pt-2.5 pb-4 shadow-modal"
      >
        {children}
      </div>
    </div>
  );
}

function SidebarBody({
  nav,
  path,
  depot,
  depots,
  counts,
  fleet,
  outlets,
  onFleet,
  onOutlets,
  onNavigate,
  onClose,
  account,
}: {
  nav: NavItem[];
  path: string;
  depot: string;
  depots: { id: string; name: string }[];
  counts: DispatchCounts;
  fleet: number;
  outlets: number;
  onFleet: () => void;
  onOutlets: () => void;
  onNavigate: () => void;
  onClose?: () => void;
  account: ReactNode;
}) {
  const item =
    "flex h-9 items-center gap-2.5 rounded-lg px-2 t-body-m transition-colors max-xl:h-11";
  const idle = "text-fg-2 hover:bg-muted/60 hover:text-fg";
  const on = "border border-line bg-surface text-fg shadow-card";
  return (
    <>
      <div className="flex items-center gap-2.5 px-1.5 py-1">
        <RelayMark size={28} />
        <span className="min-w-0 flex-1">
          <span className="block t-subheading leading-5">Relay</span>
          <span className="block t-caption text-fg-3">Waypoint Group</span>
        </span>
        {onClose && (
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="-mr-1 inline-flex size-11 items-center justify-center rounded-[10px] text-fg-2 hover:bg-muted/60 hover:text-fg"
          >
            <X size={20} strokeWidth={1.8} aria-hidden />
          </button>
        )}
      </div>

      {depots.length > 1 && <DepotSwitch depot={depot} depots={depots} />}

      <p className="mt-5 mb-1.5 px-2 t-caption-m text-fg-3">Dispatch</p>
      <nav className="flex flex-col gap-0.5">
        {nav.map((n) => (
          <Link
            key={n.label}
            href={n.href}
            onClick={onNavigate}
            aria-current={path.startsWith(n.href) ? "page" : undefined}
            className={cx(item, path.startsWith(n.href) ? on : idle)}
          >
            <n.icon size={16} strokeWidth={1.7} aria-hidden />
            <span className="flex-1">{n.label}</span>
            {n.count !== null && (
              <span
                className={cx(
                  "t-mono-sm",
                  n.warn ? "text-warning-text" : "text-fg-3",
                )}
              >
                {n.count}
              </span>
            )}
          </Link>
        ))}
      </nav>

      <p className="mt-5 mb-1.5 px-2 t-caption-m text-fg-3">Records</p>
      <nav className="flex flex-col gap-0.5">
        {[
          { label: "Fleet", icon: Truck, count: fleet, open: onFleet },
          { label: "Outlets", icon: Store, count: outlets, open: onOutlets },
        ].map((n) => (
          <button
            key={n.label}
            type="button"
            onClick={n.open}
            className={cx(item, idle, "text-left")}
          >
            <n.icon size={16} strokeWidth={1.7} aria-hidden />
            <span className="flex-1">{n.label}</span>
            <span className="t-mono-sm text-fg-3">{n.count}</span>
          </button>
        ))}
        {[
          { label: "Products", icon: Package, href: "/dispatcher/products" },
          { label: "People", icon: Users, href: "/dispatcher/people" },
        ].map((n) => (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            aria-current={path.startsWith(n.href) ? "page" : undefined}
            className={cx(item, path.startsWith(n.href) ? on : idle)}
          >
            <n.icon size={16} strokeWidth={1.7} aria-hidden />
            <span className="flex-1">{n.label}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-3 pt-5">
        <SyncStatus counts={counts} onNavigate={onNavigate} />
        {account}
      </div>
    </>
  );
}

function DepotSwitch({
  depot,
  depots,
}: {
  depot: string;
  depots: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <div
      role="tablist"
      aria-label="Depot"
      className="mt-4 grid auto-cols-fr grid-flow-col rounded-[10px] bg-muted p-0.5 t-small-m"
    >
      {depots.map((d) => (
        <button
          key={d.id}
          type="button"
          role="tab"
          aria-selected={depot === d.id}
          title={d.name}
          onClick={() =>
            start(async () => {
              await setDepotAction(d.id);
              router.refresh();
            })
          }
          className={cx(
            "truncate rounded-lg px-1 py-1.5 text-center transition-colors max-xl:py-2.5",
            depot === d.id
              ? "bg-surface text-fg shadow-card"
              : "text-fg-2 hover:text-fg",
          )}
        >
          {d.id}
        </button>
      ))}
    </div>
  );
}

function SyncStatus({
  counts,
  onNavigate,
}: {
  counts: DispatchCounts;
  onNavigate: () => void;
}) {
  const offline = counts.offline > 0;
  return (
    <Link
      href="/dispatcher/live"
      onClick={onNavigate}
      className="flex items-center gap-2 rounded-[10px] bg-muted/70 px-3 py-2.5 text-left t-small-m transition-colors hover:bg-muted max-xl:py-3"
    >
      <Dot tone={offline ? "warning" : "success"} />
      <span className="min-w-0 flex-1 truncate">
        {offline
          ? counts.offline === 1 && counts.offlineVehicle
            ? `${counts.offlineVehicle} offline`
            : `${counts.offline} vehicles offline`
          : "All roles in sync"}
      </span>
      <span className="t-mono-sm text-fg-3">{counts.clock}</span>
    </Link>
  );
}

/* ---------- Records: fleet and outlets ---------- */

function FleetPanel({
  open,
  onClose,
  fleet,
  depot,
  dayLabel,
}: {
  open: boolean;
  onClose: () => void;
  fleet: FleetRow[];
  depot: string;
  dayLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const available = fleet.filter((v) => v.status === "available");
  const groups = [
    {
      label: "Reefer trucks",
      n: available.filter((v) => v.temp === "reefer" && v.type === "truck")
        .length,
    },
    {
      label: "Reefer vans",
      n: available.filter((v) => v.temp === "reefer" && v.type === "van")
        .length,
    },
    {
      label: "Dry trucks",
      n: available.filter((v) => v.temp !== "reefer" && v.type === "truck")
        .length,
    },
    {
      label: "Dry vans",
      n: available.filter((v) => v.temp !== "reefer" && v.type === "van")
        .length,
    },
  ];
  const toggle = async (v: FleetRow) => {
    setBusy(v.id);
    const res = await vehicleStatusAction(
      v.id,
      v.status === "available" ? "workshop" : "available",
      v.status === "available" ? "Taken out by dispatch" : undefined,
    );
    setBusy(null);
    if (!res.ok) return toast(res.error, { tone: "warning" });
    toast(
      v.status === "available"
        ? `${v.id} taken out of service`
        : `${v.id} back in service`,
      { detail: "Re-run the plan to use the change." },
    );
    router.refresh();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={depot ? `Fleet · ${depot}` : "Fleet"}
      description={`${available.length} of ${fleet.length} in service on ${dayLabel}`}
      width={620}
      actions={
        <Button onClick={onClose} className={tap}>
          Close
        </Button>
      }
    >
      <div className="grid grid-cols-4 gap-2 max-sm:grid-cols-2">
        {groups.map((g) => (
          <div key={g.label} className="rounded-lg bg-subtle px-3 py-2">
            <p className="t-numeric">{g.n}</p>
            <p className="t-caption text-fg-3">{g.label}</p>
          </div>
        ))}
      </div>
      {fleet.length === 0 ? (
        <p className="mt-4 t-small text-fg-3">
          {depot ? `No vehicles at ${depot}.` : "No vehicles yet."}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
          {fleet.map((v) => (
            <li
              key={v.id}
              className="flex items-center gap-3 px-3 py-2 max-sm:flex-wrap max-sm:gap-x-2 max-sm:gap-y-1.5 max-sm:py-2.5"
            >
              <span className="w-14 t-mono">{v.id}</span>
              <span className="min-w-0 flex-1">
                <span className="block t-small-m">{v.label}</span>
                <span className="block t-caption text-fg-3">{v.cap}</span>
              </span>
              <span className="hidden min-w-0 max-w-[160px] truncate t-caption text-fg-2 sm:block">
                {v.status === "workshop"
                  ? (v.note ?? "Workshop")
                  : v.trips.length
                    ? v.trips.join(", then ")
                    : "No trips"}
              </span>
              {v.status === "workshop" ? (
                <Pill tone="offline" icon={Wrench} size="sm">
                  Workshop
                </Pill>
              ) : (
                <Pill tone="success" size="sm">
                  In service
                </Pill>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={busy === v.id}
                onClick={() => toggle(v)}
                className="max-sm:h-10 max-sm:w-full max-sm:border max-sm:border-line max-sm:t-small-m"
              >
                {v.status === "workshop" ? (
                  <>
                    Return<span className="sm:hidden"> to service</span>
                  </>
                ) : (
                  "Take out"
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

function OutletPanel({
  open,
  onClose,
  outlets,
  depot,
}: {
  open: boolean;
  onClose: () => void;
  outlets: OutletWatch;
  depot: string;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={depot ? `Outlets · ${depot}` : "Outlets"}
      description={`${outlets.total} outlets`}
      width={520}
      actions={
        <Button onClick={onClose} className={tap}>
          Close
        </Button>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["Fresh", "bg-fresh"],
            ["Style", "bg-style"],
            ["Tech", "bg-tech"],
          ] as const
        ).map(([b, c]) => (
          <div key={b} className="rounded-lg bg-subtle px-3 py-2">
            <p className="t-numeric">{outlets.counts[b]}</p>
            <p className="flex items-center gap-1.5 t-caption text-fg-3">
              <span className={cx("size-2 rounded-full", c)} /> {b}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-4 mb-1.5 t-caption-m text-fg-3">
        Skipped on the last run
      </p>
      {outlets.watch.length === 0 ? (
        <p className="t-small text-fg-3">None.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {outlets.watch.map((w) => (
            <li
              key={w.id}
              className="flex items-center gap-3 px-3 py-2 max-sm:py-2.5"
            >
              <span className="w-14 shrink-0 t-mono">{w.id}</span>
              <span className="flex min-w-0 flex-1 items-center gap-3 max-sm:flex-col max-sm:items-start max-sm:gap-1">
                <span className="min-w-0 max-w-full flex-1 truncate t-small-m">
                  {w.name}
                </span>
                <Pill tone={w.skips >= 2 ? "danger" : "warning"}>{w.note}</Pill>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
