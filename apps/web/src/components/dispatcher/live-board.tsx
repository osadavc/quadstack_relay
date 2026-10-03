"use client";

import {
  Bell,
  CalendarX,
  Check,
  CircleCheck,
  CircleX,
  Clock,
  ClockAlert,
  CloudOff,
  ExternalLink,
  GitCompare,
  Inbox,
  type LucideIcon,
  MapPin,
  MessageSquare,
  PackageCheck,
  PackageX,
  Send,
  ShieldCheck,
  ThermometerSnowflake,
  TriangleAlert,
  Truck,
  UserPlus,
  Warehouse,
  Wrench,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { messageDriverAction, warnStoresAction } from "@/app/actions/dispatch";
import {
  SearchField,
  Segmented,
  Sheet,
  tap,
} from "@/components/dispatcher/bits";
import { toast } from "@/components/interact";
import { Button, cx, IconTile, Pill, type Tone } from "@/components/ui";
import type { LiveData, LiveStatus } from "@/server/queries/dispatch";

type Row = LiveData["rows"][number];
type FeedItem = LiveData["feed"][number];

const STATUS: Record<
  LiveStatus,
  { label: string; tone: Tone; icon?: LucideIcon }
> = {
  dock: { label: "At dock", tone: "neutral", icon: Warehouse },
  loading: { label: "Loading", tone: "neutral", icon: Warehouse },
  on_time: { label: "On time", tone: "success" },
  delivered: { label: "Delivered", tone: "success", icon: PackageCheck },
  at_risk: { label: "At risk", tone: "warning", icon: ClockAlert },
  late: { label: "Late", tone: "danger", icon: CircleX },
  offline: { label: "Out of contact", tone: "offline", icon: CloudOff },
  done: { label: "Trip done", tone: "neutral", icon: Check },
  problem: { label: "Not delivered", tone: "danger", icon: TriangleAlert },
};

const ATTENTION: LiveStatus[] = ["offline", "at_risk", "late", "problem"];

/* When the driver's phone last reported; nothing while the truck is at the dock. */
const heardLabel = (r: Row) =>
  r.heard === "now"
    ? "Heard now"
    : r.heard
      ? `Heard ${r.heard} ago`
      : ["dock", "loading"].includes(r.status)
        ? null
        : "Not heard yet";

export function LiveBoard({ live }: { live: LiveData }) {
  const router = useRouter();
  const [view, setView] = useState<"all" | "attention">("all");
  const [pane, setPane] = useState<"vehicles" | "feed">("vehicles");
  const [query, setQuery] = useState("");
  const [notified, setNotified] = useState(false);
  const [open, setOpen] = useState<Row | null>(null);
  const [pending, start] = useTransition();

  if (!live.version || live.rows.length === 0)
    return (
      <>
        <header className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3.5 max-xl:px-4 max-xl:py-4">
          <h1 className="t-title">Live · {live.dayLabel}</h1>
          <Pill tone="accent" icon={Clock} size="sm">
            {live.clock}
          </Pill>
        </header>
        <div className="flex flex-1 items-center justify-center p-6 max-xl:py-16">
          <div className="flex max-w-[360px] flex-col items-center gap-3 text-center">
            <IconTile icon={Truck} size={40} />
            <p className="t-heading">No trips on the road.</p>
            <Button variant="primary" href="/dispatcher/plan" className={tap}>
              Open the plan
            </Button>
          </div>
        </div>
      </>
    );

  const needle = query.trim().toLowerCase();
  const rows = live.rows.filter((r) => {
    if (view === "attention" && !ATTENTION.includes(r.status)) return false;
    if (!needle) return true;
    return [r.vehicleId, r.district, r.next, r.sub, r.driver ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
  const attention = live.rows.filter((r) =>
    ATTENTION.includes(r.status),
  ).length;
  const atRisk = live.rows.flatMap((r) =>
    r.atRisk.map((x) => ({
      outletId: x.outletId,
      vehicleId: r.vehicleId,
      expected: x.expected,
    })),
  );

  const notify = () =>
    start(async () => {
      const res = await warnStoresAction(atRisk);
      if (!res.ok) return toast(res.error, { tone: "warning" });
      setNotified(true);
      toast(`${atRisk.length} store${atRisk.length === 1 ? "" : "s"} told`, {
        detail: atRisk.map((x) => x.outletId).join(", "),
        tone: "success",
      });
      router.refresh();
    });

  return (
    <>
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3.5 max-xl:flex-col max-xl:items-stretch max-xl:px-4 max-xl:py-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2 max-xl:flex-wrap">
            <h1 className="t-title whitespace-nowrap">
              Live · {live.dayLabel}
            </h1>
            <Pill tone="accent" icon={Clock} size="sm">
              {live.clock}
            </Pill>
            <Pill tone="neutral" size="sm">
              Plan v{live.version} published {live.publishedAt}
            </Pill>
          </div>
          <p className="min-w-0 overflow-hidden t-small text-ellipsis whitespace-pre text-fg-3 max-xl:whitespace-normal">
            {`${live.counts.out} ${live.counts.out === 1 ? "trip" : "trips"} out  ·  ${live.counts.stopsDone} of ${live.counts.stops} stops done`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3 max-xl:ml-0 max-xl:gap-2 max-md:flex-col max-md:items-stretch">
          <Segmented
            label="Show vehicles"
            size="sm"
            value={view}
            onChange={setView}
            className="max-md:w-full"
            options={[
              { value: "all", label: "All vehicles" },
              {
                value: "attention",
                label: "Needs attention",
                count: String(attention),
                countTone: attention ? "text-danger-text" : undefined,
              },
            ]}
          />
          {notified || atRisk.length === 0 ? (
            <span className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-success-tint px-3 t-small-m whitespace-nowrap text-success-text max-xl:h-[46px] max-xl:rounded-[10px]">
              <Check size={15} strokeWidth={1.8} aria-hidden />
              {notified ? "Stores notified" : "No store at risk"}
            </span>
          ) : (
            <Button
              variant="secondary"
              icon={Bell}
              disabled={pending}
              onClick={notify}
              className={tap}
            >
              Notify {atRisk.length} affected store
              {atRisk.length === 1 ? "" : "s"}
            </Button>
          )}
        </div>
      </header>

      <div className="shrink-0 px-5 pt-4 pb-2 xl:hidden max-xl:px-4">
        <Segmented
          label="Show"
          value={pane}
          onChange={setPane}
          className="w-full"
          options={[
            {
              value: "vehicles",
              label: "Vehicles",
              count: String(live.rows.length),
            },
            { value: "feed", label: "Handoffs" },
          ]}
        />
      </div>

      <div className="flex min-h-0 flex-1 max-xl:block">
        <section
          aria-label="Vehicles"
          className={cx(
            "flex min-w-0 flex-1 flex-col",
            pane === "feed" && "max-xl:hidden",
          )}
        >
          <div className="shrink-0 px-5 pt-4 pb-2 max-xl:px-4 max-xl:pt-2">
            <div className="flex overflow-hidden rounded-[10px] border border-line max-xl:grid max-xl:grid-cols-2">
              <Stat
                icon={CircleCheck}
                tone="success"
                value={live.counts.onTime}
                label="on time"
                note="inside window"
              />
              <Stat
                icon={ClockAlert}
                tone="warning"
                value={live.counts.atRisk}
                label="at risk"
                note="ETA after close"
              />
              <Stat
                icon={CircleX}
                tone="danger"
                value={live.counts.late}
                label="late"
                note={live.counts.lateNote}
              />
              <Stat
                icon={CloudOff}
                tone="offline"
                value={live.counts.offline}
                label="out of contact"
                note={
                  live.counts.offlineNote
                    ? `${live.counts.offlineNote.vehicleId} · ${live.counts.offlineNote.sub}`
                    : "all in contact"
                }
              />
            </div>
          </div>

          <div className="flex h-[52px] shrink-0 items-center gap-2 px-5 max-xl:h-auto max-xl:flex-wrap max-xl:px-4 max-xl:py-2">
            <h2 className="t-subheading">Vehicles</h2>
            <span className="t-caption text-fg-3">sorted by attention</span>
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="Vehicle, outlet, driver"
              className="ml-auto h-[30px] w-[200px] max-md:ml-0 max-md:w-full md:max-xl:w-[280px]"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-auto scroll-thin max-xl:overflow-visible">
            <div className="min-w-[700px] max-xl:min-w-0 max-xl:border-t max-xl:border-line">
              <div className="sticky top-0 z-10 flex h-[34px] items-center gap-3 border-y border-line bg-subtle px-5 t-caption-m text-fg-3 max-xl:hidden">
                <span className="w-9 shrink-0" />
                <span className="w-[112px] shrink-0">Vehicle</span>
                <span className="w-[136px] shrink-0">Driver</span>
                <span className="w-[104px] shrink-0">Progress</span>
                <span className="min-w-0 flex-1">Next stop · ETA</span>
                <span className="w-[112px] shrink-0 text-right">Status</span>
              </div>
              {rows.map((r) => (
                <VehicleRow key={r.id} row={r} onOpen={() => setOpen(r)} />
              ))}
              {rows.length === 0 && (
                <p className="px-5 py-10 text-center t-small text-fg-3">
                  {view === "attention" && !needle
                    ? "Nothing needs attention."
                    : "No vehicles match."}
                </p>
              )}
            </div>
          </div>
        </section>

        <Feed
          items={live.feed}
          className={cx(pane === "vehicles" && "max-xl:hidden")}
        />
      </div>

      {open && <VehicleDialog row={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function Stat({
  icon: Icon,
  tone,
  value,
  label,
  note,
}: {
  icon: LucideIcon;
  tone: "success" | "warning" | "danger" | "offline";
  value: number;
  label: string;
  note: string;
}) {
  const tile = {
    success: "bg-success-tint text-success-text",
    warning: "bg-warning-tint text-warning-text",
    danger: "bg-danger-tint text-danger-text",
    offline: "bg-offline-tint text-offline-text",
  }[tone];
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5 border-r border-line px-4 py-3 last:border-r-0 max-xl:border-b max-xl:px-3.5 max-xl:even:border-r-0 max-xl:[&:nth-last-child(-n+2)]:border-b-0">
      <span
        className={cx(
          "hidden size-8 shrink-0 items-center justify-center rounded-lg min-[1360px]:inline-flex",
          tile,
        )}
        aria-hidden
      >
        <Icon size={16} strokeWidth={1.8} />
      </span>
      <div className="min-w-0">
        <p className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="t-heading">{value}</span>
          <span className="truncate t-small-m text-fg-2">{label}</span>
        </p>
        <p className="truncate t-caption text-fg-3">{note}</p>
      </div>
    </div>
  );
}

function MapLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="pointer-events-auto relative z-10 inline-flex shrink-0 items-center gap-0.5 rounded t-caption-m text-accent-text hover:underline max-xl:-my-2 max-xl:px-1 max-xl:py-2"
    >
      Map
      <ExternalLink size={11} strokeWidth={1.8} aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

function Dots({ row: r }: { row: Row }) {
  return (
    <span
      className="flex flex-wrap items-center gap-[5px]"
      role="img"
      aria-label={`${r.done} of ${r.total} stops done`}
    >
      {r.dots.map((d, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: stops are positional
          key={i}
          className={cx(
            "size-2.5 rounded-full",
            d === "done" && "bg-success",
            d === "current" && "bg-accent",
            d === "offline" && "bg-offline",
            d === "failed" && "bg-danger",
            d === "pending" && "border-[1.5px] border-line-strong",
          )}
        />
      ))}
    </span>
  );
}

/*
 * A vehicle row. The whole row opens the vehicle; it is a button laid under
 * the content so the map link can sit inside the row without nesting.
 */
function VehicleRow({ row: r, onOpen }: { row: Row; onOpen: () => void }) {
  const st = STATUS[r.status];
  const offline = r.status === "offline";
  const subTone =
    r.status === "at_risk" || r.status === "late"
      ? "text-warning-text"
      : "text-fg-3";
  const stops = `${r.done} of ${r.total} ${r.total === 1 ? "stop" : "stops"}`;
  const heard = heardLabel(r);
  return (
    <div
      className={cx(
        "relative border-b border-line transition-colors hover:bg-subtle/60",
        offline && "bg-offline-tint/50",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${r.vehicleId} trip ${r.tripNo}, ${st.label}`}
        className="absolute inset-0 cursor-pointer"
      />

      {/* Desktop */}
      <div className="pointer-events-none relative flex h-16 items-center gap-3 px-5 max-xl:hidden">
        <IconTile
          icon={r.reefer ? ThermometerSnowflake : Truck}
          tone={r.reefer ? "chilled" : "neutral"}
          size={36}
        />
        <div className="flex w-[112px] shrink-0 flex-col gap-0.5">
          <p className="flex items-center gap-1.5">
            <span className="t-mono">{r.vehicleId}</span>
            <span className="t-caption text-fg-3">T{r.tripNo}</span>
          </p>
          <p className="truncate t-small-m">
            {r.district}
            {r.van ? " · van" : ""}
          </p>
        </div>
        <div className="flex w-[136px] shrink-0 flex-col gap-0.5">
          <p
            className={cx(
              "truncate t-small-m",
              r.driver ? "text-fg" : "text-fg-3",
            )}
          >
            {r.driver ?? "No driver yet"}
          </p>
          <p
            className={cx(
              "flex min-w-0 items-center gap-1.5 t-caption",
              offline ? "text-offline-text" : "text-fg-3",
            )}
          >
            {heard && <span className="truncate">{heard}</span>}
            {r.map && <MapLink href={r.map} />}
          </p>
        </div>
        <div className="flex w-[104px] shrink-0 flex-col gap-1.5">
          <Dots row={r} />
          <p className="t-caption text-fg-3">{stops}</p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p
            className={cx(
              "truncate t-small-m",
              offline ? "text-offline-text" : "text-fg",
            )}
          >
            {r.next}
          </p>
          <p className={cx("truncate t-caption", subTone)}>{r.sub}</p>
        </div>
        <div className="flex w-[112px] shrink-0 justify-end">
          <Pill tone={st.tone} icon={st.icon} size="sm">
            {st.label}
          </Pill>
        </div>
      </div>

      {/* Phone and tablet */}
      <div className="pointer-events-none relative flex gap-3 px-4 py-3 xl:hidden">
        <IconTile
          icon={r.reefer ? ThermometerSnowflake : Truck}
          tone={r.reefer ? "chilled" : "neutral"}
          size={36}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="t-mono">{r.vehicleId}</span>
            <span className="t-caption text-fg-3">T{r.tripNo}</span>
            <span className="min-w-0 flex-1 truncate t-small-m">
              {r.district}
              {r.van ? " · van" : ""}
            </span>
            <Pill tone={st.tone} icon={st.icon} size="sm">
              {st.label}
            </Pill>
          </div>
          <p
            className={cx(
              "flex flex-wrap items-center gap-x-1.5 t-caption",
              offline ? "text-offline-text" : "text-fg-3",
            )}
          >
            <span className={r.driver ? "text-fg-2" : undefined}>
              {r.driver ?? "No driver yet"}
            </span>
            {heard && (
              <>
                <span aria-hidden>·</span>
                <span>{heard}</span>
              </>
            )}
            {r.map && (
              <>
                <span aria-hidden>·</span>
                <MapLink href={r.map} />
              </>
            )}
          </p>
          <div className="flex items-center gap-2 pt-0.5">
            <Dots row={r} />
            <span className="t-caption text-fg-3">{stops}</span>
          </div>
          <p
            className={cx(
              "truncate t-small-m",
              offline ? "text-offline-text" : "text-fg",
            )}
          >
            {r.next}
          </p>
          <p className={cx("t-caption", subTone)}>{r.sub}</p>
        </div>
      </div>
    </div>
  );
}

function VehicleDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const send = () =>
    start(async () => {
      const res = await messageDriverAction(row.id, text);
      if (!res.ok) return toast(res.error, { tone: "warning" });
      toast(`Sent to ${row.vehicleId}`, {
        detail:
          row.status === "offline"
            ? "Arrives on the phone when signal returns."
            : text,
        tone: "success",
      });
      setText("");
      onClose();
      router.refresh();
    });
  return (
    <Sheet
      open
      onClose={onClose}
      title={`${row.vehicleId} · T${row.tripNo} · ${row.district}`}
      description={`${row.driver ?? "No driver yet"} · ${STATUS[row.status].label} · ${row.sub}`}
      width={480}
      actions={
        <>
          <Button onClick={onClose} className={cx(tap, "max-xl:order-last")}>
            Close
          </Button>
          <Button
            variant="primary"
            icon={Send}
            disabled={pending || !text.trim()}
            onClick={send}
            className={tap}
          >
            Send to driver
          </Button>
        </>
      }
    >
      {row.map && (
        <a
          href={row.map}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-3 flex items-center gap-2 rounded-[10px] bg-subtle px-3 py-2.5 t-small-m text-fg transition-colors hover:bg-muted max-xl:min-h-[46px]"
        >
          <MapPin size={15} strokeWidth={1.8} aria-hidden />
          Last position on the map
          <ExternalLink
            size={13}
            strokeWidth={1.8}
            className="ml-auto text-fg-3"
            aria-hidden
          />
        </a>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="t-caption-m text-fg-3">Message the driver</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Write a message"
          className="resize-none rounded-lg border border-line-strong bg-surface px-3 py-2 t-body outline-none focus:border-accent max-xl:text-[16px]"
        />
      </label>
      {row.status === "offline" && (
        <p className="mt-2 t-caption text-offline-text">
          Out of contact. The message shows when the phone reconnects.
        </p>
      )}
    </Sheet>
  );
}

/* ---------- Handoffs & exceptions ---------- */

type FeedTone = "offline" | "warning" | "success" | "neutral" | "accent";

const KIND: Record<string, { icon: LucideIcon; tone: FeedTone }> = {
  "driver.offline": { icon: CloudOff, tone: "offline" },
  "driver.delivered": { icon: PackageCheck, tone: "success" },
  "store.received": { icon: PackageCheck, tone: "success" },
  "dock.shortfall": { icon: PackageX, tone: "warning" },
  "dock.released": { icon: Truck, tone: "neutral" },
  "dock.loading": { icon: Warehouse, tone: "neutral" },
  "dock.change_acked": { icon: Check, tone: "neutral" },
  "driver.accepted": { icon: Truck, tone: "neutral" },
  "driver.departed": { icon: Truck, tone: "neutral" },
  "driver.arrived": { icon: MapPin, tone: "neutral" },
  "driver.problem": { icon: CircleX, tone: "warning" },
  "driver.reconciled": { icon: GitCompare, tone: "success" },
  "store.issue": { icon: TriangleAlert, tone: "warning" },
  "plan.published": { icon: Send, tone: "neutral" },
  "plan.decision": { icon: ShieldCheck, tone: "neutral" },
  "order.deferred": { icon: CalendarX, tone: "neutral" },
  "order.placed": { icon: Inbox, tone: "neutral" },
  "dispatch.message": { icon: MessageSquare, tone: "accent" },
  "dispatch.warned": { icon: Bell, tone: "neutral" },
  "fleet.status": { icon: Wrench, tone: "neutral" },
  "admin.user": { icon: UserPlus, tone: "neutral" },
};

const tileTone: Record<FeedTone, string> = {
  offline: "bg-offline-tint text-offline-text",
  warning: "bg-warning-tint text-warning-text",
  success: "bg-success-tint text-success-text",
  neutral: "bg-subtle text-fg-2",
  accent: "bg-accent-tint text-accent-text",
};

const ROLE: Record<string, string> = {
  dispatcher: "Dispatch",
  loader: "Dock",
  driver: "Driver",
  store: "Store",
};

function Feed({ items, className }: { items: FeedItem[]; className?: string }) {
  const [shown, setShown] = useState(25);
  return (
    <aside
      aria-label="Handoffs and exceptions"
      className={cx(
        "flex w-[364px] shrink-0 flex-col border-l border-line max-xl:w-auto max-xl:border-l-0",
        className,
      )}
    >
      <div className="flex shrink-0 items-baseline gap-3 px-[18px] pt-4 pb-3 max-xl:px-4 max-xl:pt-2">
        <h2 className="flex-1 t-subheading">Handoffs &amp; exceptions</h2>
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto scroll-thin max-xl:overflow-visible max-xl:border-t max-xl:border-line">
        {items.slice(0, shown).map((it) => {
          const k = KIND[it.kind] ?? { icon: Check, tone: "neutral" as const };
          const offline = it.kind === "driver.offline";
          return (
            <li
              key={it.key}
              className={cx(
                "flex gap-3 border-b border-line px-[18px] py-3.5 max-xl:px-4",
                offline && "bg-offline-tint/50",
              )}
            >
              <span
                className={cx(
                  "inline-flex size-[30px] shrink-0 items-center justify-center rounded-full",
                  tileTone[k.tone],
                )}
                aria-hidden
              >
                <k.icon size={15} strokeWidth={1.8} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-baseline gap-3">
                  <p className="min-w-0 flex-1 truncate t-small-m">
                    {it.actor}
                    {it.role ? (
                      <span className="font-normal text-fg-3">
                        {" "}
                        · {ROLE[it.role] ?? it.role}
                      </span>
                    ) : null}
                    {it.source === "offline" ? (
                      <span className="font-normal text-offline-text">
                        {" "}
                        · recorded offline
                      </span>
                    ) : null}
                  </p>
                  <span className="t-mono-sm text-fg-3">{it.time}</span>
                </div>
                <p className="t-small text-fg-2">{it.text}</p>
              </div>
            </li>
          );
        })}
        {items.length > shown && (
          <li className="px-[18px] py-3 max-xl:px-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShown((n) => n + 25)}
              className="max-xl:h-10 max-xl:w-full max-xl:border max-xl:border-line"
            >
              Show earlier
            </Button>
          </li>
        )}
        {items.length === 0 && (
          <li className="px-[18px] py-6 t-small text-fg-3 max-xl:px-4">
            No handoffs yet.
          </li>
        )}
      </ol>
    </aside>
  );
}
