"use client";

import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  ClockAlert,
  FileText,
  Inbox,
  Lock,
  type LucideIcon,
  Package,
  Phone,
  PhoneCall,
  Route,
  ShieldCheck,
  Store,
  User,
  Warehouse,
  X,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { runPlanAction } from "@/app/actions/dispatch";
import {
  BrandDot,
  SearchField,
  Segmented,
  Sheet,
  TempPill,
  tap,
} from "@/components/dispatcher/bits";
import {
  CallDialog,
  SelectMenu,
  toast,
  useDisclosure,
} from "@/components/interact";
import { Button, cx, IconTile, Pill } from "@/components/ui";
import type { PhoneOrderData } from "@/server/admin";
import type { orderDrawer, ordersQueue } from "@/server/queries/dispatch";
import { PhoneOrder } from "./phone-order";
import { Trail } from "./trail";

type Queue = Awaited<ReturnType<typeof ordersQueue>>;
type Row = Queue["rows"][number];
type Drawer = NonNullable<Awaited<ReturnType<typeof orderDrawer>>>;
type Filter = "all" | "chilled" | "flagged" | "next";

const COL = {
  check: "w-[26px] shrink-0",
  order: "w-[100px] shrink-0",
  outlet: "w-[172px] shrink-0",
  temp: "w-[86px] shrink-0",
  size: "w-[96px] shrink-0",
  window: "w-[92px] shrink-0",
  access: "w-[80px] shrink-0",
  runs: "w-[110px] shrink-0",
};

const flagged = (r: Row) => r.skips > 0 || r.access === "Van only";

export function OrderQueue({
  q,
  depot,
  hasPlan,
  selectedId,
  auto,
  drawer,
  phone,
}: {
  q: Queue;
  depot: string;
  hasPlan: boolean;
  selectedId: string | null;
  /** The drawer was opened by default, not by a tap: desktop only. */
  auto: boolean;
  drawer: Drawer | null;
  phone: PhoneOrderData;
}) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [district, setDistrict] = useState("all");
  const [brand, setBrand] = useState("all");
  const [dismissed, setDismissed] = useState(false);
  const [opening, startOpening] = useTransition();
  const [pending, start] = useTransition();
  const confirm = useDisclosure();
  const newOrder = useDisclosure();

  const select = (id: string | null) => {
    setDismissed(id === null);
    const next = new URLSearchParams(params.toString());
    if (id) next.set("order", id);
    else next.delete("order");
    const qs = next.toString();
    startOpening(() =>
      router.replace(qs ? `${path}?${qs}` : path, { scroll: false }),
    );
  };

  const needle = query.trim().toLowerCase();
  const rows = q.rows.filter((r) => {
    if (filter === "chilled" && r.temp !== "chilled") return false;
    if (filter === "flagged" && !flagged(r)) return false;
    if (district !== "all" && r.district !== district) return false;
    if (brand !== "all" && r.brand !== brand) return false;
    if (!needle) return true;
    return [r.id, r.outletId, r.outlet, r.district, r.brand]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
  const current = dismissed
    ? null
    : (q.rows.find((r) => r.id === selectedId) ?? null);
  const districts = [...new Set(q.rows.map((r) => r.district))].sort();
  const queued = new Set(
    phone.day === q.day
      ? q.rows.map((r) => r.outletId)
      : q.upcoming.map((u) => u.outletId),
  );

  const plan = () =>
    start(async () => {
      if (hasPlan) {
        router.push("/dispatcher/plan");
        return;
      }
      const res = await runPlanAction(depot, "fairness");
      if (!res.ok) return toast(res.error, { tone: "warning" });
      toast(`Draft v${res.data.version} ready`, { tone: "success" });
      router.push("/dispatcher/plan");
    });

  const summary = [
    {
      label: "Fresh",
      value: String(q.summary.fresh),
      note: `${q.summary.freshAmbient} ambient · ${q.summary.freshChilled} chilled`,
    },
    {
      label: "Style",
      value: String(q.summary.style),
      note: "cartons, hanging",
    },
    { label: "Tech", value: String(q.summary.tech), note: "appliances" },
    {
      label: "Volume",
      value: `${q.summary.volume.toFixed(1)} m³`,
      note: `${Math.round(q.summary.weight).toLocaleString("en-GB")} kg`,
    },
    {
      label: "Chilled",
      value: `${q.summary.chilled.toFixed(1)} m³`,
      note: "needs a reefer",
    },
    {
      label: "Flags",
      value: String(q.summary.skipped + q.summary.vanOnly),
      note: `${q.summary.skipped} skipped · ${q.summary.vanOnly} van-only`,
    },
  ];
  const subtitle = [
    q.rows.length
      ? `${q.rows.length} ${q.rows.length === 1 ? "order" : "orders"} from ${q.outletCount} ${q.outletCount === 1 ? "outlet" : "outlets"}`
      : "",
    q.upcoming.length ? `${q.upcoming.length} in for ${q.nextDayLabel}` : "",
    q.drafts.length ? `${q.drafts.length} not placed yet` : "",
  ]
    .filter(Boolean)
    .join("  ·  ");
  const empty = q.rows.length === 0;

  return (
    <>
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3.5 max-xl:flex-col max-xl:items-stretch max-xl:px-4 max-xl:py-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2 max-xl:flex-wrap">
            <h1 className="t-title whitespace-nowrap">
              Orders · for {q.dayLabel}
            </h1>
            {q.closed ? (
              <Pill tone="success" icon={Lock} size="sm">
                Closed {q.closesAt}
              </Pill>
            ) : (
              <Pill tone="warning" icon={Clock} size="sm">
                Closes {q.closesAt}
                {q.minutesLeft <= 180 ? ` · ${q.minutesLeft} min left` : ""}
              </Pill>
            )}
          </div>
          {subtitle && (
            <p className="min-w-0 overflow-hidden t-small text-ellipsis whitespace-pre text-fg-3 max-xl:whitespace-normal">
              {subtitle}
            </p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-3 max-xl:ml-0 max-xl:gap-2 max-md:grid max-md:grid-cols-2">
          {!empty && (
            <Button
              variant="secondary"
              icon={FileText}
              href="/api/export/orders"
              className={tap}
            >
              Export
            </Button>
          )}
          <Button
            variant="secondary"
            icon={PhoneCall}
            onClick={newOrder.onOpen}
            className={cx(tap, empty && "max-md:col-span-2")}
          >
            New phone order
          </Button>
          {(!empty || hasPlan) && (
            <Button
              variant="primary"
              iconRight={ArrowRight}
              disabled={pending}
              onClick={() =>
                !hasPlan && (!q.closed || q.drafts.length)
                  ? confirm.onOpen()
                  : plan()
              }
              className={cx(tap, "max-xl:order-first max-md:col-span-2")}
            >
              {pending
                ? "Planning"
                : hasPlan
                  ? "Open the plan"
                  : `Plan these ${q.rows.length} orders`}
            </Button>
          )}
        </div>
      </header>

      <PhoneOrder
        data={phone}
        queued={queued}
        open={newOrder.open}
        onClose={newOrder.onClose}
      />

      <Sheet
        open={confirm.open}
        onClose={confirm.onClose}
        title={q.closed ? "Plan now?" : "Close orders and plan?"}
        description={
          q.drafts.length
            ? `${q.drafts.map((d) => `${d.outletId} ${d.outlet}`).join(", ")} ${q.drafts.length === 1 ? "hasn’t" : "haven’t"} placed an order yet. Anything placed after planning goes on ${q.nextDayLabel}.`
            : `Orders close at ${q.closesAt}. Anything placed after planning goes on ${q.nextDayLabel}.`
        }
        actions={
          <>
            <Button
              onClick={confirm.onClose}
              className={cx(tap, "max-xl:order-last")}
            >
              Wait
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                confirm.onClose();
                plan();
              }}
              className={tap}
            >
              Plan now
            </Button>
          </>
        }
      />

      {empty ? (
        <div className="flex flex-1 items-center justify-center p-6 max-xl:py-16">
          <div className="flex max-w-[360px] flex-col items-center gap-3 text-center">
            <IconTile icon={Inbox} size={40} />
            <p className="t-heading">No orders for {q.dayLabel} yet.</p>
            {q.upcoming.length > 0 && (
              <p className="t-small text-fg-3">
                {q.upcoming.length} in for {q.nextDayLabel}.
              </p>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="shrink-0 px-5 pt-4 max-xl:px-4">
            <dl className="flex overflow-hidden rounded-[10px] border border-line max-xl:grid max-xl:grid-cols-2">
              {summary.map((s) => (
                <div
                  key={s.label}
                  className="flex min-w-0 flex-1 flex-col gap-0.5 border-r border-line px-4 py-3 last:border-r-0 max-xl:border-b max-xl:px-3.5 max-xl:even:border-r-0 max-xl:[&:nth-last-child(-n+2)]:border-b-0"
                >
                  <dt className="t-caption-m text-fg-3">{s.label}</dt>
                  <dd className="flex items-baseline gap-1.5 whitespace-nowrap max-xl:flex-col max-xl:items-start max-xl:gap-0">
                    <span className="t-heading">{s.value}</span>
                    <span className="max-w-full truncate t-caption text-fg-3">
                      {s.note}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="flex min-h-0 flex-1 max-xl:block">
            <section
              aria-label="Order queue"
              className="flex min-w-0 flex-1 flex-col"
            >
              <div className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-2 px-5 pt-4 pb-3 max-xl:px-4">
                <Segmented
                  label="Filter orders"
                  value={filter}
                  onChange={setFilter}
                  className="max-md:w-full"
                  options={[
                    {
                      value: "all",
                      label: "All",
                      count: String(q.rows.length),
                    },
                    {
                      value: "chilled",
                      label: "Chilled",
                      count: String(
                        q.rows.filter((r) => r.temp === "chilled").length,
                      ),
                    },
                    {
                      value: "flagged",
                      label: "Flagged",
                      count: String(q.rows.filter(flagged).length),
                    },
                    {
                      value: "next",
                      label: "Next run",
                      count: String(q.upcoming.length),
                    },
                  ]}
                />
                <SearchField
                  value={query}
                  onChange={setQuery}
                  placeholder="Search outlet, order, district"
                  className="ml-auto w-[230px] max-xl:ml-0 max-xl:flex-1 max-md:w-full"
                />
                <div className="flex gap-2.5 max-xl:gap-2 max-md:grid max-md:w-full max-md:grid-cols-2">
                  <SelectMenu
                    value={district}
                    onChange={setDistrict}
                    heading="District"
                    options={[
                      { value: "all", label: "All districts" },
                      ...districts.map((d) => ({ value: d, label: d })),
                    ]}
                    trigger={({ label, ...p }) => (
                      <Button
                        {...p}
                        variant="secondary"
                        iconRight={ChevronDown}
                        className={cx(tap, "max-md:w-full")}
                      >
                        {district === "all" ? "District" : label}
                      </Button>
                    )}
                  />
                  <SelectMenu
                    value={brand}
                    onChange={setBrand}
                    heading="Brand"
                    options={[
                      { value: "all", label: "All brands" },
                      { value: "Fresh", label: "Fresh" },
                      { value: "Style", label: "Style" },
                      { value: "Tech", label: "Tech" },
                    ]}
                    trigger={({ label, ...p }) => (
                      <Button
                        {...p}
                        variant="secondary"
                        iconRight={ChevronDown}
                        className={cx(tap, "max-md:w-full")}
                      >
                        {brand === "all" ? "Brand" : label}
                      </Button>
                    )}
                  />
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto scroll-thin max-xl:overflow-visible">
                <div className="min-w-[800px] max-xl:min-w-0 max-xl:border-t max-xl:border-line">
                  <div className="sticky top-0 z-10 flex h-[34px] items-center border-y border-line bg-subtle px-3 t-caption-m text-fg-3 max-xl:hidden">
                    <span className={COL.check} />
                    <span className={cx(COL.order, "px-2")}>Order</span>
                    <span className={cx(COL.outlet, "px-2")}>Outlet</span>
                    <span className={cx(COL.temp, "px-2")}>Temp</span>
                    <span className={cx(COL.size, "px-2")}>Size</span>
                    <span className={cx(COL.window, "px-2")}>Window</span>
                    <span className={cx(COL.access, "px-2")}>Access</span>
                    <span className={cx(COL.runs, "px-2")}>Last 5 runs</span>
                    <span className="ml-auto">Placed</span>
                  </div>

                  {filter === "next"
                    ? q.upcoming.map((l) => (
                        <div
                          key={l.id}
                          className="flex min-h-[52px] items-center border-b border-line px-3 max-xl:flex-col max-xl:items-start max-xl:gap-0.5 max-xl:px-4 max-xl:py-3"
                        >
                          <span className="w-[26px] shrink-0 max-xl:hidden" />
                          <span className="w-[100px] shrink-0 px-2 t-mono text-fg-2 max-xl:order-last max-xl:w-auto max-xl:px-0 max-xl:t-mono-sm max-xl:text-fg-3">
                            {l.id}
                          </span>
                          <span className="px-2 t-small-m max-xl:px-0 max-xl:t-body-m">
                            {l.outletId} · {l.outlet}
                          </span>
                          <span className="ml-auto t-caption text-fg-3 max-xl:ml-0">
                            For {q.nextDayLabel}
                            {l.placed ? ` · placed ${l.placed}` : ""}
                          </span>
                        </div>
                      ))
                    : rows.map((r) => (
                        <OrderLine
                          key={r.id}
                          row={r}
                          selected={r.id === current?.id}
                          auto={auto}
                          opening={opening}
                          onSelect={() => select(r.id)}
                        />
                      ))}

                  {filter !== "next" && rows.length === 0 && (
                    <p className="px-5 py-10 text-center t-small text-fg-3">
                      No orders match these filters.
                    </p>
                  )}
                  {filter === "next" && q.upcoming.length === 0 && (
                    <p className="px-5 py-10 text-center t-small text-fg-3">
                      No orders in for {q.nextDayLabel} yet.
                    </p>
                  )}
                </div>
              </div>
            </section>

            {current && drawer && (
              <OrderDrawer
                key={current.id}
                row={current}
                drawer={drawer}
                auto={auto}
                onClose={() => select(null)}
                hasPlan={hasPlan}
              />
            )}
          </div>
        </>
      )}
    </>
  );
}

function OrderLine({
  row: r,
  selected,
  auto,
  opening,
  onSelect,
}: {
  row: Row;
  selected: boolean;
  auto: boolean;
  opening: boolean;
  onSelect: () => void;
}) {
  const tone = r.skips >= 2 ? "text-danger-text" : "text-warning-text";
  const runs = (
    <span className="flex items-center gap-[3px]">
      {r.runs.map((run, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed five-run history
          key={i}
          className={cx(
            "h-3.5 w-1.5 rounded-[2px]",
            run === "served"
              ? "bg-success/45"
              : run === "skipped"
                ? "bg-danger"
                : "bg-muted",
          )}
        />
      ))}
      <span className="sr-only">
        {r.runs.filter((x) => x === "skipped").length} of last 5 runs skipped
      </span>
    </span>
  );
  return (
    <>
      {/* Desktop: a table row */}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={cx(
          "flex h-[52px] w-full items-center border-b border-line px-3 text-left transition-colors max-xl:hidden",
          selected ? "bg-accent-tint/60" : "hover:bg-subtle/60",
        )}
      >
        <span className={COL.check}>
          {selected ? (
            <span className="flex size-3.5 items-center justify-center rounded-[4px] bg-accent text-fg-inverse">
              <Check size={10} strokeWidth={2.6} aria-hidden />
            </span>
          ) : (
            <span className="block size-3.5 rounded-[4px] border border-line-strong bg-surface" />
          )}
        </span>
        <span
          className={cx(COL.order, "px-2 t-mono whitespace-nowrap text-fg-2")}
        >
          {r.id}
        </span>
        <span className={cx(COL.outlet, "flex min-w-0 flex-col gap-px px-2")}>
          <span className="truncate t-small-m whitespace-nowrap">
            {r.outletId} · {r.outlet}
          </span>
          <BrandDot
            brand={r.brand}
            label={`${r.brand} · ${r.district}`}
            className="t-caption text-fg-3"
          />
        </span>
        <span className={cx(COL.temp, "px-2")}>
          <TempPill temp={r.temp} />
        </span>
        <span className={cx(COL.size, "flex flex-col px-2")}>
          <span className="t-mono">{r.volumeM3.toFixed(2)} m³</span>
          <span className="t-mono-sm text-fg-3">
            {Math.round(r.weightKg).toLocaleString("en-GB")} kg
          </span>
        </span>
        <span
          className={cx(COL.window, "px-2 t-mono whitespace-nowrap text-fg-2")}
        >
          {r.window}
        </span>
        <span className={cx(COL.access, "px-2")}>
          {r.access === "Van only" ? (
            <Pill tone="accent" size="sm">
              Van only
            </Pill>
          ) : (
            <span className="t-caption text-fg-3">{r.access}</span>
          )}
        </span>
        <span className={cx(COL.runs, "flex items-center gap-2 px-2")}>
          {runs}
          {r.unserved ? (
            <span className={cx("t-caption-m", tone)}>{r.unserved} days</span>
          ) : null}
        </span>
        <span className="ml-auto t-mono-sm text-fg-3">{r.placed}</span>
      </button>

      {/* Phone and tablet: a card */}
      <button
        type="button"
        onClick={onSelect}
        className={cx(
          "flex w-full flex-col gap-1.5 border-b border-line px-4 py-3 text-left transition-colors active:bg-subtle xl:hidden",
          selected && !auto && opening && "bg-subtle",
        )}
      >
        <span className="flex w-full items-center gap-2">
          <span className="min-w-0 flex-1 truncate t-body-m">
            {r.outletId} · {r.outlet}
          </span>
          <TempPill temp={r.temp} />
        </span>
        <span className="flex w-full flex-wrap items-center gap-x-1.5 t-caption text-fg-3">
          <BrandDot brand={r.brand} label={`${r.brand} · ${r.district}`} />
          <span aria-hidden>·</span>
          <span className="t-mono-sm">{r.window}</span>
          <span aria-hidden>·</span>
          <span className="t-mono-sm">{r.volumeM3.toFixed(2)} m³</span>
        </span>
        <span className="flex w-full items-center gap-2">
          <span className="t-mono-sm text-fg-3">{r.id}</span>
          {r.access === "Van only" && (
            <Pill tone="accent" size="sm">
              Van only
            </Pill>
          )}
          <span className="ml-auto flex items-center gap-2">
            {runs}
            {r.unserved ? (
              <span className={cx("t-caption-m", tone)}>{r.unserved} days</span>
            ) : null}
          </span>
        </span>
      </button>
    </>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-line py-2 max-xl:py-2.5">
      <Icon
        size={14}
        strokeWidth={1.7}
        className="shrink-0 text-fg-2"
        aria-hidden
      />
      <span className="shrink-0 t-small text-fg-2">{label}</span>
      <span className="ml-auto text-right t-small-m">{value}</span>
    </div>
  );
}

function OrderDrawer({
  row,
  drawer,
  auto,
  onClose,
  hasPlan,
}: {
  row: Row;
  drawer: Drawer;
  auto: boolean;
  onClose: () => void;
  hasPlan: boolean;
}) {
  const call = useDisclosure();
  const contact = drawer.contact;
  const phone = contact?.phone ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside
      aria-label={`Order ${row.id}`}
      className={cx(
        "flex w-[372px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-line px-5 py-4 scroll-thin",
        // Phone and tablet: full screen over the list, only after a tap.
        "max-xl:fixed max-xl:inset-0 max-xl:z-50 max-xl:bg-surface max-xl:px-4 max-xl:pt-2 max-xl:pb-4 max-xl:shadow-modal md:max-xl:left-auto md:max-xl:w-[420px] max-md:w-auto max-md:border-l-0",
        auto && "max-xl:hidden",
      )}
    >
      <div className="flex items-center gap-2">
        <p className="t-mono text-fg-3">{row.id}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close order"
          className="ml-auto -mr-1 inline-flex size-6 items-center justify-center rounded-md text-fg-2 transition-colors hover:bg-subtle hover:text-fg max-xl:-mr-2 max-xl:size-11 max-xl:rounded-[10px]"
        >
          <X size={16} strokeWidth={1.8} aria-hidden />
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <h2 className="t-heading">
          {row.outletId} · {row.outlet}
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <BrandDot brand={row.brand} className="t-caption-m text-fg-2" />
          <TempPill temp={row.temp} />
          {row.unserved ? (
            <Pill
              tone={row.skips >= 2 ? "danger" : "warning"}
              icon={ClockAlert}
              size="sm"
            >
              {row.unserved} days since{" "}
              {row.temp === "chilled" ? "chilled stock" : "a delivery"}
            </Pill>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-[10px] bg-subtle p-3.5">
        <p className="t-caption-m text-fg-3">Handoff trail</p>
        <Trail stages={drawer.trail} />
      </div>

      <div className="flex flex-col">
        <DetailRow icon={Package} label="Order" value={drawer.size} />
        <DetailRow icon={Clock} label="Window" value={drawer.window} />
        <DetailRow icon={Warehouse} label="Dock" value={row.dockDetail} />
        <DetailRow icon={Route} label="From depot" value={drawer.fromDepot} />
        <DetailRow icon={User} label="Placed by" value={row.placedBy} />
        {contact && (
          <DetailRow icon={Store} label="Store manager" value={contact.name} />
        )}
      </div>

      {row.guard && (
        <div
          className={cx(
            "flex flex-col gap-2 rounded-[10px] border p-3.5",
            row.guard.tone === "danger"
              ? "border-danger bg-danger-tint"
              : "border-warning bg-warning-tint",
          )}
        >
          <p
            className={cx(
              "flex items-center gap-2 t-small-m",
              row.guard.tone === "danger"
                ? "text-danger-text"
                : "text-warning-text",
            )}
          >
            <ShieldCheck size={15} strokeWidth={1.8} aria-hidden />
            {row.guard.title}
          </p>
          <p className="t-small text-fg">{row.guard.text}</p>
        </div>
      )}

      {(phone || hasPlan) && (
        <div className="mt-auto flex items-center gap-2 pt-4 max-xl:grid max-xl:grid-cols-1">
          {contact && phone && (
            <>
              <Button
                variant="secondary"
                icon={Phone}
                onClick={call.onOpen}
                className="max-xl:hidden"
              >
                Call store
              </Button>
              <a
                href={`tel:${phone.replace(/\s/g, "")}`}
                className="flex h-[46px] items-center justify-center gap-2 rounded-[10px] border border-line-strong bg-surface t-body-m shadow-card xl:hidden"
              >
                <Phone size={16} strokeWidth={1.8} aria-hidden />
                Call {contact.name.split(" ")[0]} · {phone}
              </a>
              <CallDialog
                open={call.open}
                onClose={call.onClose}
                contact={contact}
              />
            </>
          )}
          {hasPlan && (
            <Button
              variant="primary"
              iconRight={ArrowRight}
              href="/dispatcher/plan"
              className={cx(tap, "ml-auto max-xl:ml-0")}
            >
              Open in plan
            </Button>
          )}
        </div>
      )}
    </aside>
  );
}
