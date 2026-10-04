"use client";

import {
  ArrowRight,
  Bell,
  CalendarCheck,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CornerDownRight,
  Inbox,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Snowflake,
  ThermometerSnowflake,
  Truck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  publishAction,
  releasePinAction,
  runPlanAction,
} from "@/app/actions/dispatch";
import { SelectMenu, toast } from "@/components/interact";
import { Button, cx, IconTile, Pill } from "@/components/ui";
import type { PlanBoardData } from "@/server/queries/dispatch";
import { type Brand, BrandDot, Segmented, TempPill, tap } from "./bits";
import { TripSheet } from "./trip-sheet";

type Board = PlanBoardData;
type Plan = NonNullable<Board["plan"]>;
type Lane = Extract<Board, { lanes: unknown }>["lanes"][number];
type Trip = Lane["trips"][number];
type Group = Extract<Board, { groups: unknown }>["groups"][number];

const POLICIES = [
  {
    value: "fairness",
    label: "Fairness first",
    detail: "Protect outlets skipped before",
  },
  {
    value: "fill",
    label: "Fill reefers first",
    detail: "Most refrigerated volume before 08:00",
  },
  {
    value: "routes",
    label: "Shortest routes",
    detail: "Least distance and fuel",
  },
] as const;
type PolicyValue = (typeof POLICIES)[number]["value"];

const clock = (m: number) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.round(m) % 60).padStart(2, "0")}`;

export function PlanBoard({
  board,
  inert: isInert,
}: {
  board: Board;
  inert?: boolean;
}) {
  const [view, setView] = useState<"timeline" | "table">("timeline");
  const [openTrip, setOpenTrip] = useState<{ lane: Lane; trip: Trip } | null>(
    null,
  );
  const [moveOrder, setMoveOrder] = useState<string | null>(null);

  if (!board.plan || !("lanes" in board)) return <EmptyPlan board={board} />;
  const plan = board.plan;
  const lanes = board.lanes;
  const busy = lanes.filter((l) => l.trips.length || l.spare);
  const idle = lanes.filter((l) => !l.trips.length && !l.spare);

  return (
    <>
      <PlanHeader board={board} plan={plan} />
      <Kpis board={board} plan={plan} />

      <div className="flex min-h-0 flex-1 max-xl:block">
        <section
          aria-label="Vehicles and trips"
          className="flex min-w-0 flex-1 flex-col"
        >
          <div className="flex shrink-0 flex-wrap items-center gap-2.5 px-5 pt-3 pb-2 max-xl:px-4">
            <h2 className="t-subheading">Vehicles &amp; trips</h2>
            <Pill tone="neutral" size="sm">
              {lanes.length} available
            </Pill>
            <div className="ml-auto flex items-center gap-3.5 t-caption-m text-fg-2 max-xl:hidden">
              <BrandDot brand="Fresh" />
              <BrandDot brand="Style" />
              <BrandDot brand="Tech" />
              <span className="inline-flex items-center gap-1">
                <Snowflake
                  size={12}
                  strokeWidth={1.8}
                  className="text-chilled-text"
                  aria-hidden
                />
                Chilled load
              </span>
            </div>
            <Segmented
              label="Plan view"
              size="sm"
              value={view}
              onChange={setView}
              className="max-xl:hidden"
              options={[
                { value: "timeline", label: "Timeline" },
                { value: "table", label: "Table" },
              ]}
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col max-xl:hidden">
            {view === "timeline" ? (
              <Timeline
                lanes={busy}
                onOpen={(lane, trip) => setOpenTrip({ lane, trip })}
              />
            ) : (
              <TripTable
                lanes={busy}
                onOpen={(lane, trip) => setOpenTrip({ lane, trip })}
              />
            )}
          </div>
          <LaneList
            lanes={busy}
            onOpen={(lane, trip) => setOpenTrip({ lane, trip })}
          />

          <p className="flex h-[30px] shrink-0 items-center border-t border-line px-5 t-caption whitespace-pre text-fg-2 max-xl:h-auto max-xl:border-t-0 max-xl:px-4 max-xl:pb-4 max-xl:whitespace-normal">
            {`${plan.vehiclesWithTrips} vehicles planned  ·  ${idle.length} idle${board.workshop.length ? `  ·  ${board.workshop.length} in the workshop` : ""}`}
          </p>
        </section>

        <DeferralLedger
          board={board}
          plan={plan}
          onFind={(id) => setMoveOrder(id)}
        />
      </div>

      {!isInert && (openTrip || moveOrder) && (
        <TripSheet
          planId={plan.id}
          draft={plan.status === "draft"}
          lane={openTrip?.lane ?? null}
          trip={openTrip?.trip ?? null}
          orderId={moveOrder}
          deferred={
            board.groups
              .flatMap((g) => g.items)
              .find((d) => d.orderId === moveOrder) ?? null
          }
          onClose={() => {
            setOpenTrip(null);
            setMoveOrder(null);
          }}
        />
      )}
    </>
  );
}

/* ---------- Empty: no plan yet ---------- */

function EmptyPlan({ board }: { board: Board }) {
  const router = useRouter();
  const [policy, setPolicy] = useState<PolicyValue>("fairness");
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      const res = await runPlanAction(board.depot, policy);
      if (!res.ok) return toast(res.error, { tone: "warning" });
      toast(`Draft v${res.data.version} ready`, { tone: "success" });
      router.refresh();
    });
  return (
    <>
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3.5 max-xl:px-4 max-xl:py-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2 max-xl:flex-wrap">
            <h1 className="t-title whitespace-nowrap">
              Plan · {board.dayLabel}
            </h1>
            <Pill tone="neutral" size="sm">
              No plan yet
            </Pill>
            {board.festival && board.festival.inDays <= 14 && (
              <Pill tone="accent" size="sm">
                {board.festival.name} in {board.festival.inDays} days
              </Pill>
            )}
          </div>
          <p className="t-small text-fg-3">
            {board.depot ? `${board.depot} · ` : ""}
            {board.orders} {board.orders === 1 ? "order" : "orders"} in the
            queue
          </p>
        </div>
      </header>
      {board.orders === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6 max-xl:py-16">
          <div className="flex max-w-[360px] flex-col items-center gap-3 text-center">
            <IconTile icon={Inbox} size={40} />
            <p className="t-heading">No orders for {board.dayLabel} yet.</p>
            <Button href="/dispatcher/orders" className={tap}>
              Open orders
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-6 max-md:block max-md:p-4">
          <div className="flex max-w-[460px] flex-col gap-4 rounded-2xl border border-line bg-surface p-6 shadow-pop max-md:max-w-none max-md:p-5">
            <IconTile icon={SlidersHorizontal} tone="accent" size={40} />
            <div className="flex flex-col gap-1">
              <h2 className="t-heading">
                Plan {board.orders} {board.orders === 1 ? "order" : "orders"}{" "}
                for {board.dayLabel}
              </h2>
              {board.workshop.length > 0 && (
                <p className="t-small text-fg-3">
                  {board.workshop.length} in the workshop:{" "}
                  {board.workshop.map((w) => w.id).join(", ")}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 max-md:grid max-md:grid-cols-1">
              <SelectMenu
                value={policy}
                width={260}
                heading="Planning policy"
                options={POLICIES.map((p) => ({ ...p }))}
                onChange={setPolicy}
                trigger={({ label, ...p }) => (
                  <Button
                    {...p}
                    variant="secondary"
                    icon={SlidersHorizontal}
                    iconRight={ChevronDown}
                    className={cx(tap, "max-md:w-full")}
                  >
                    {label}
                  </Button>
                )}
              />
              <Button
                variant="primary"
                icon={Play}
                disabled={pending}
                onClick={run}
                className={cx(tap, "ml-auto max-xl:ml-0")}
              >
                {pending ? "Planning" : "Run the planner"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Header ---------- */

function PlanHeader({ board, plan }: { board: Board; plan: Plan }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [running, setRunning] = useState(false);
  const pendingCount = "pending" in board ? board.pending.length : 0;
  const published = plan.status === "published";
  const blocked = !published && pendingCount > 0;

  const rerun = (policy: PolicyValue) => {
    setRunning(true);
    start(async () => {
      const res = await runPlanAction(board.depot, policy);
      setRunning(false);
      if (!res.ok) return toast(res.error, { tone: "warning" });
      toast(`Draft v${res.data.version}`, {
        detail: `${POLICIES.find((p) => p.value === policy)?.label}. Your decisions were kept.`,
      });
      router.refresh();
    });
  };
  const publish = () =>
    start(async () => {
      const res = await publishAction(plan.id);
      if (!res.ok) return toast(res.error, { tone: "warning" });
      toast(`Plan v${res.data.version} published`, {
        detail: `${res.data.vehicles} vehicles. ${res.data.told} store managers told why.`,
        tone: "success",
      });
      router.refresh();
    });

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3.5 max-xl:flex-col max-xl:items-stretch max-xl:px-4 max-xl:py-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-2 max-xl:flex-wrap">
          <h1 className="t-title whitespace-nowrap">Plan · {board.dayLabel}</h1>
          {published ? (
            <Pill tone="success" icon={Check} size="sm">
              Plan v{plan.version} published {plan.publishedAt}
            </Pill>
          ) : (
            <Pill tone="neutral" size="sm">
              Draft v{plan.version}
            </Pill>
          )}
          {!published && board.publishedVersion && (
            <Pill tone="warning" size="sm">
              v{board.publishedVersion} is live
            </Pill>
          )}
          {board.festival && board.festival.inDays <= 14 && (
            <Pill tone="accent" size="sm" className="max-xl:hidden">
              {board.festival.name} in {board.festival.inDays} days
            </Pill>
          )}
        </div>
        <p className="min-w-0 overflow-hidden t-small text-ellipsis whitespace-pre text-fg-3 max-xl:whitespace-normal">
          {`${board.depot}  ·  ${plan.kpis.orders} orders${board.workshop.length ? `  ·  ${board.workshop.length} vehicles in the workshop` : ""}`}
        </p>
      </div>

      <div className="ml-auto flex items-center gap-3 max-xl:ml-0 max-xl:gap-2 max-md:grid max-md:grid-cols-2">
        <div className="flex shrink-0 flex-col items-end whitespace-nowrap max-xl:hidden">
          <span className="t-caption text-fg-3">Saved {plan.createdAt}</span>
          {blocked && (
            <span id="publish-hint" className="t-caption-m text-warning-text">
              Resolve {pendingCount} decision{pendingCount === 1 ? "" : "s"}{" "}
              first
            </span>
          )}
        </div>
        <SelectMenu
          value={plan.policy as PolicyValue}
          width={260}
          heading="Planning policy"
          options={POLICIES.map((p) => ({ ...p }))}
          onChange={(v) => rerun(v)}
          trigger={({ label, ...p }) => (
            <Button
              {...p}
              variant="secondary"
              icon={SlidersHorizontal}
              iconRight={ChevronDown}
              className={cx(tap, "max-md:w-full")}
            >
              <span className="max-xl:hidden">Policy: </span>
              {label}
            </Button>
          )}
        />
        <Button
          variant="secondary"
          icon={RefreshCw}
          disabled={pending}
          className={cx(tap, running && "[&_svg]:animate-spin")}
          onClick={() => rerun(plan.policy as PolicyValue)}
        >
          {running ? "Re-running" : "Re-run"}
        </Button>
        {published ? (
          <span className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-success-tint px-3 t-small-m whitespace-nowrap text-success-text max-xl:order-first max-md:col-span-2 max-xl:h-[46px] max-xl:rounded-[10px] max-xl:t-body-m">
            <Check size={15} strokeWidth={1.8} aria-hidden />
            Published to {plan.vehiclesWithTrips} vehicles
          </span>
        ) : (
          <Button
            variant="primary"
            icon={Send}
            disabled={blocked || pending}
            aria-describedby={blocked ? "publish-hint" : undefined}
            onClick={publish}
            className={cx(tap, "max-xl:order-first max-md:col-span-2")}
          >
            {board.publishedVersion
              ? "Publish changes"
              : `Publish to ${plan.vehiclesWithTrips} vehicles`}
          </Button>
        )}
        {blocked && (
          <p className="col-span-2 t-caption-m text-warning-text xl:hidden">
            Resolve {pendingCount} decision{pendingCount === 1 ? "" : "s"} to
            publish
          </p>
        )}
      </div>
    </header>
  );
}

/* ---------- KPI cards ---------- */

function Kpis({ board, plan }: { board: Board; plan: Plan }) {
  const k = plan.kpis;
  const card =
    "flex flex-col gap-2 self-stretch rounded-[10px] border border-line bg-surface px-4 py-3.5";
  const demand = k.chilledDemandM3 || 1;
  const fuel = k.fuelPeak;
  return (
    <div className="flex shrink-0 items-start gap-3 px-5 py-4 max-xl:grid max-xl:grid-cols-2 max-xl:gap-2 max-xl:px-4">
      <div className={cx(card, "min-w-0 flex-1")}>
        <p className="t-caption-m text-fg-3">Orders</p>
        <p className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="t-numeric">{k.served}</span>
          <span className="t-small text-fg-3">of {k.orders} served</span>
        </p>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Pill tone={k.deferred ? "warning" : "success"} size="sm">
            {k.deferred} deferred
          </Pill>
        </div>
      </div>

      <div
        className={cx(
          card,
          "w-[388px] shrink-0 max-xl:order-first max-xl:col-span-2 max-xl:w-auto",
        )}
      >
        <div className="flex items-center gap-1.5">
          <Snowflake
            size={13}
            strokeWidth={1.8}
            className="text-chilled-text"
            aria-hidden
          />
          <p className="t-caption-m text-chilled-text">
            Cold chain before 08:00
          </p>
          {k.chilledPlannedM3 < k.chilledDemandM3 - 0.01 && (
            <Pill tone="warning" size="sm" className="ml-auto">
              Bottleneck
            </Pill>
          )}
        </div>
        <p className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="t-numeric">{k.chilledPlannedM3.toFixed(1)} m³</span>
          <span className="t-small text-fg-3">
            of {k.chilledDemandM3.toFixed(1)} m³ refrigerated demand
          </span>
        </p>
        <div
          className="relative h-3.5 w-full"
          role="img"
          aria-label={`${k.chilledPlannedM3.toFixed(1)} of ${k.chilledDemandM3.toFixed(1)} m³ refrigerated planned, best case ${plan.bestCase.toFixed(1)} m³`}
        >
          <span className="absolute top-[3px] left-0 h-2 w-full rounded-[4px] bg-muted" />
          <span
            className="absolute top-[3px] left-0 h-2 rounded-[4px] bg-chilled transition-[width] duration-300"
            style={{ width: `${(k.chilledPlannedM3 / demand) * 100}%` }}
          />
          <span
            className="absolute top-0 h-3.5 w-0.5 rounded-[1px] bg-fg"
            style={{
              left: `${Math.min(99.5, (plan.bestCase / demand) * 100)}%`,
            }}
          />
        </div>
        <div className="flex items-center gap-3 t-caption whitespace-nowrap max-xl:flex-wrap max-xl:gap-y-1">
          <span className="inline-flex items-center gap-[5px] text-fg-2">
            <span className="size-2 rounded-[2px] bg-chilled" aria-hidden />
            Planned
          </span>
          <span className="inline-flex items-center gap-[5px] text-fg-2">
            <span className="h-2.5 w-0.5 bg-fg" aria-hidden />
            Best case {plan.bestCase.toFixed(1)} m³
          </span>
          <span className="truncate text-fg-3">
            {k.reefersAtLimit === k.reefersAvailable
              ? `All ${k.reefersAvailable} reefers at their limit`
              : `${k.reefersAtLimit} of ${k.reefersAvailable} reefers at their limit`}
          </span>
        </div>
      </div>

      <div className={cx(card, "min-w-0 flex-1")}>
        <p className="t-caption-m text-fg-3">Fleet</p>
        <p className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="t-numeric">{k.vehiclesUsed}</span>
          <span className="t-small text-fg-3">
            of {k.vehiclesAvailable} in service
          </span>
        </p>
        <p className="t-caption text-fg-3">
          {`${k.dryIdle} dry trucks idle${k.spareHeld.length ? `  ·  ${k.spareHeld[0]} held as spare` : ""}${board.workshop.length ? `  ·  ${board.workshop.length} in the workshop` : ""}`}
        </p>
      </div>

      <div className={cx(card, "min-w-0 flex-1 max-xl:col-span-2")}>
        <p className="t-caption-m text-fg-3">Fuel quota · this week</p>
        <p className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="t-numeric">
            {k.fuelWithinQuota ? "All" : "Over"}
          </span>
          <span className="t-small text-fg-3">
            {k.fuelWithinQuota ? "within quota" : "quota"}
          </span>
        </p>
        <p className="t-caption text-fg-3">
          {fuel
            ? `Highest: ${fuel.vehicleId} at ${Math.round(fuel.share * 100)}% after ${fuel.district}`
            : "No trips yet"}
          {` · ${Math.round(k.liters)} L on this run`}
        </p>
      </div>
    </div>
  );
}

/* ---------- Timeline ---------- */

const barTone: Record<Brand, string> = {
  Fresh: "bg-fresh",
  Style: "bg-style",
  Tech: "bg-tech",
};

function axisFor(lanes: Lane[]) {
  const start = 3 * 60;
  const latest = Math.max(
    13 * 60,
    ...lanes.flatMap((l) => l.trips.map((t) => t.lastServiceEnd + 20)),
  );
  const end = Math.ceil(latest / 60) * 60;
  return {
    start,
    end,
    span: end - start,
    hours: Array.from(
      { length: (end - start) / 60 + 1 },
      (_, i) => start + i * 60,
    ),
  };
}

function LoadBar({
  trip,
  full,
  wide,
}: {
  trip: Trip;
  full?: boolean;
  wide?: boolean;
}) {
  return (
    <span
      className={cx(
        "block h-1 shrink-0 overflow-hidden rounded-[2px] bg-muted",
        full ? "w-full" : wide ? "w-10" : "w-7",
      )}
    >
      <span
        className={cx(
          "block h-full rounded-[2px] transition-[width] duration-300",
          barTone[trip.brand],
        )}
        style={{ width: `${Math.min(100, Math.round(trip.load * 100))}%` }}
      />
    </span>
  );
}

function Timeline({
  lanes,
  onOpen,
}: {
  lanes: Lane[];
  onOpen: (l: Lane, t: Trip) => void;
}) {
  const axis = axisFor(lanes);
  const pct = (m: number) => `${((m - axis.start) / axis.span) * 100}%`;
  const w = (a: number, b: number) =>
    `${(Math.max(0, b - a) / axis.span) * 100}%`;
  return (
    <>
      <div className="flex shrink-0">
        <p className="w-[220px] shrink-0 pt-2 pr-3.5 pl-5 t-caption text-fg-3 max-xl:w-[180px]">
          Fresh window ends
        </p>
        <div className="relative mr-1.5 h-7 flex-1 t-mono-sm text-fg-3">
          {axis.hours.map((h, i) =>
            // On a long day the end labels would collide with their neighbours.
            (i === 0 || i === axis.hours.length - 1) &&
            axis.hours.length > 11 ? null : (
              <span
                key={h}
                className={cx(
                  "absolute top-2",
                  i === 0
                    ? ""
                    : i === axis.hours.length - 1
                      ? "-translate-x-full"
                      : "-translate-x-1/2",
                )}
                style={{ left: pct(h) }}
              >
                {clock(h)}
              </span>
            ),
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
        <div className="flex border-t border-line">
          <div className="w-[220px] shrink-0 max-xl:w-[180px]">
            {lanes.map((lane) => (
              <div
                key={lane.id}
                className="flex h-12 items-center gap-2.5 border-b border-line pr-3.5 pl-5"
              >
                <IconTile
                  icon={lane.reefer ? ThermometerSnowflake : Truck}
                  tone={lane.reefer ? "chilled" : "neutral"}
                  size={28}
                />
                <div className="min-w-0">
                  <p className="t-mono">{lane.id}</p>
                  <p className="truncate t-caption whitespace-nowrap text-fg-3">
                    {lane.kind}
                  </p>
                </div>
                <span
                  className={cx(
                    "ml-auto t-mono-sm",
                    lane.freshTight ? "text-warning-text" : "text-fg-3",
                  )}
                >
                  {lane.spare ? "spare" : (lane.freshEnds ?? "")}
                </span>
              </div>
            ))}
          </div>

          <div className="relative mr-1.5 min-w-0 flex-1 overflow-hidden">
            <div
              className="absolute inset-y-0 bg-fresh-tint/55"
              style={{ left: pct(210), width: w(210, 480) }}
              aria-hidden
            />
            {axis.hours.map((h, i) => (
              <div
                key={h}
                className="absolute inset-y-0 w-px bg-line"
                style={{
                  left:
                    i === axis.hours.length - 1 ? "calc(100% - 1px)" : pct(h),
                }}
                aria-hidden
              />
            ))}
            <div
              className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-fg/45"
              style={{ left: pct(480) }}
              title="08:00 stores open"
              aria-hidden
            />

            {lanes.map((lane) => (
              <div key={lane.id} className="relative h-12 border-b border-line">
                {lane.trips.map((trip) => {
                  const meta = `${trip.stops.length} stop${trip.stops.length === 1 ? "" : "s"} · ${trip.volumeM3.toFixed(1)} m³`;
                  const narrow = trip.lastServiceEnd - trip.depart < 75;
                  return (
                    <div key={trip.id}>
                      <span
                        className="absolute top-[23px] h-px border-t border-dashed border-line-strong"
                        style={{
                          left: pct(trip.lastServiceEnd),
                          width: w(
                            trip.lastServiceEnd,
                            Math.min(trip.returnAt, axis.end),
                          ),
                        }}
                        aria-hidden
                      />
                      <button
                        type="button"
                        onClick={() => onOpen(lane, trip)}
                        title={`${lane.id} T${trip.tripNo} · ${trip.district} · leaves ${clock(trip.depart)}, last stop ${clock(trip.lastServiceEnd)}, back ${clock(trip.returnAt)} · ${Math.round(trip.load * 100)}% full`}
                        className={cx(
                          "absolute top-[3px] flex h-[42px] flex-col gap-0.5 overflow-hidden rounded-md border px-2 py-[5px] text-left shadow-card transition-colors",
                          trip.protects
                            ? "border-warning bg-warning-tint hover:bg-warning-tint/80"
                            : "border-line bg-surface hover:border-line-strong",
                        )}
                        style={{
                          left: pct(trip.depart),
                          width: w(trip.depart, trip.lastServiceEnd),
                        }}
                      >
                        <p className="flex min-w-0 items-center gap-1 t-caption-m whitespace-nowrap">
                          {trip.chilled && (
                            <Snowflake
                              size={11}
                              strokeWidth={2}
                              className="shrink-0 text-chilled-text"
                              aria-label="Refrigerated"
                            />
                          )}
                          <span className="truncate">
                            {trip.district}
                            {trip.protects
                              ? ` · protects ${trip.protects}`
                              : ""}
                          </span>
                        </p>
                        {narrow ? (
                          <LoadBar trip={trip} full />
                        ) : (
                          <div className="flex min-w-0 items-center gap-1.5">
                            <LoadBar trip={trip} wide={trip.stops.length > 4} />
                            <span className="truncate t-mono-sm whitespace-nowrap text-fg-2">
                              {meta}
                            </span>
                          </div>
                        )}
                      </button>
                    </div>
                  );
                })}
                {lane.spare && (
                  <div
                    className="absolute top-[5px] flex h-[38px] items-center gap-1.5 rounded-md border border-dashed border-line-strong px-2.5 t-caption whitespace-nowrap text-fg-3"
                    style={{ left: pct(211) }}
                  >
                    <Truck size={13} strokeWidth={1.7} aria-hidden />
                    Held as spare
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* Phone and tablet: one card per vehicle with its trips in order. */
function LaneList({
  lanes,
  onOpen,
}: {
  lanes: Lane[];
  onOpen: (l: Lane, t: Trip) => void;
}) {
  if (lanes.length === 0)
    return (
      <p className="px-4 py-6 t-small text-fg-3 xl:hidden">
        No trips on this plan.
      </p>
    );
  return (
    <ul className="flex flex-col gap-2 px-4 pt-1 pb-3 xl:hidden">
      {lanes.map((lane) => (
        <li
          key={lane.id}
          className="overflow-hidden rounded-xl border border-line bg-surface"
        >
          <div className="flex items-center gap-2.5 px-3.5 py-2.5">
            <IconTile
              icon={lane.reefer ? ThermometerSnowflake : Truck}
              tone={lane.reefer ? "chilled" : "neutral"}
              size={32}
            />
            <div className="min-w-0 flex-1">
              <p className="t-mono">{lane.id}</p>
              <p className="truncate t-caption text-fg-3">{lane.kind}</p>
            </div>
            {lane.freshEnds && (
              <span
                className={cx(
                  "t-caption",
                  lane.freshTight ? "text-warning-text" : "text-fg-3",
                )}
              >
                Fresh ends <span className="t-mono-sm">{lane.freshEnds}</span>
              </span>
            )}
          </div>
          {lane.trips.length === 0 && lane.spare && (
            <p className="flex items-center gap-1.5 border-t border-line px-3.5 py-3 t-small text-fg-3">
              <Truck size={14} strokeWidth={1.7} aria-hidden />
              Held as spare
            </p>
          )}
          {lane.trips.map((trip) => (
            <button
              key={trip.id}
              type="button"
              onClick={() => onOpen(lane, trip)}
              className={cx(
                "flex min-h-[60px] w-full items-center gap-3 border-t border-line px-3.5 py-3 text-left transition-colors active:bg-subtle",
                trip.protects && "bg-warning-tint/50",
              )}
            >
              <span className="w-6 shrink-0 t-mono-sm text-fg-3">
                T{trip.tripNo}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex min-w-0 items-center gap-1 t-small-m">
                  {trip.chilled && (
                    <Snowflake
                      size={12}
                      strokeWidth={2}
                      className="shrink-0 text-chilled-text"
                      aria-label="Refrigerated"
                    />
                  )}
                  <span className="truncate">
                    {trip.district}
                    {trip.protects ? ` · protects ${trip.protects}` : ""}
                  </span>
                </span>
                <span className="t-mono-sm text-fg-2">
                  {clock(trip.depart)}–{clock(trip.lastServiceEnd)} ·{" "}
                  {trip.stops.length} stop{trip.stops.length === 1 ? "" : "s"} ·{" "}
                  {Math.round(trip.load * 100)}%
                </span>
                <LoadBar trip={trip} full />
              </span>
              <ChevronRight
                size={16}
                strokeWidth={1.8}
                className="shrink-0 text-fg-3"
                aria-hidden
              />
            </button>
          ))}
        </li>
      ))}
    </ul>
  );
}

function TripTable({
  lanes,
  onOpen,
}: {
  lanes: Lane[];
  onOpen: (l: Lane, t: Trip) => void;
}) {
  const th = "px-2 py-2 text-left t-caption-m text-fg-3";
  return (
    <div className="min-h-0 flex-1 overflow-auto border-t border-line scroll-thin">
      <table className="w-full min-w-[720px] border-collapse">
        <thead className="sticky top-0 bg-subtle">
          <tr className="border-b border-line">
            <th className={cx(th, "pl-5")}>Vehicle</th>
            <th className={th}>Trip</th>
            <th className={th}>Area</th>
            <th className={th}>Temp</th>
            <th className={th}>Leaves · last stop · back</th>
            <th className={th}>Load</th>
            <th className={th}>Fuel</th>
            <th className={cx(th, "pr-5 text-right")}>Fresh ends</th>
          </tr>
        </thead>
        <tbody>
          {lanes.flatMap((lane) =>
            lane.trips.length === 0
              ? [
                  <tr key={lane.id} className="border-b border-line">
                    <td className="py-2.5 pr-2 pl-5 t-mono">{lane.id}</td>
                    <td className="px-2 t-small text-fg-3" colSpan={6}>
                      Held as spare
                    </td>
                    <td className="pr-5 text-right t-mono-sm text-fg-3">
                      spare
                    </td>
                  </tr>,
                ]
              : lane.trips.map((trip) => (
                  <tr
                    key={trip.id}
                    onClick={() => onOpen(lane, trip)}
                    className={cx(
                      "cursor-pointer border-b border-line hover:bg-subtle/60",
                      trip.protects && "bg-warning-tint/40",
                    )}
                  >
                    <td className="py-2.5 pr-2 pl-5">
                      <p className="t-mono">{lane.id}</p>
                      <p className="t-caption text-fg-3">{lane.kind}</p>
                    </td>
                    <td className="px-2 t-mono-sm text-fg-2">T{trip.tripNo}</td>
                    <td className="px-2 t-small-m">
                      {trip.district}
                      <span className="block t-mono-sm font-normal text-fg-3">
                        {trip.stops.length} stops ·{" "}
                        {trip.stops.map((s) => s.outletId).join(", ")}
                      </span>
                    </td>
                    <td className="px-2">
                      <div className="flex flex-wrap gap-1">
                        {(["chilled", "frozen", "ambient"] as const)
                          .filter((temp) =>
                            trip.stops.some((stop) =>
                              stop.temps.includes(temp),
                            ),
                          )
                          .map((temp) => (
                            <TempPill key={temp} temp={temp} />
                          ))}
                      </div>
                    </td>
                    <td className="px-2 t-mono-sm whitespace-nowrap text-fg-2">
                      {clock(trip.depart)} · {clock(trip.lastServiceEnd)} ·{" "}
                      {clock(trip.returnAt)}
                    </td>
                    <td className="px-2 t-mono-sm whitespace-nowrap text-fg-2">
                      {Math.round(trip.load * 100)}% ·{" "}
                      {Math.round(trip.weightShare * 100)}% kg
                    </td>
                    <td className="px-2 t-mono-sm text-fg-2">
                      {Math.round(trip.liters)} L
                    </td>
                    <td
                      className={cx(
                        "pr-5 text-right t-mono-sm",
                        lane.freshTight ? "text-warning-text" : "text-fg-3",
                      )}
                    >
                      {lane.freshEnds ?? ""}
                    </td>
                  </tr>
                )),
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Deferral ledger ---------- */

function DeferralLedger({
  board,
  plan,
  onFind,
}: {
  board: Board;
  plan: Plan;
  onFind: (orderId: string) => void;
}) {
  const groups = "groups" in board ? board.groups : [];
  const pending = "pending" in board ? board.pending : [];
  const published = plan.status === "published";
  const count = groups.reduce((a, g) => a + g.items.length, 0);
  const stores = new Set(groups.flatMap((g) => g.items.map((i) => i.outletId)))
    .size;
  return (
    <aside
      aria-label="Deferred orders"
      className="flex w-[372px] shrink-0 flex-col border-l border-line max-xl:w-auto max-xl:border-t max-xl:border-l-0"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scroll-thin max-xl:overflow-visible">
        <div className="flex flex-col gap-1 px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="t-subheading">Deferred</h2>
            <Pill tone={count ? "warning" : "success"} size="sm">
              {count}
            </Pill>
          </div>
          {count > 0 && (
            <p className="t-caption text-fg-3">
              {plan.deferredChilledM3.toFixed(1)} m³ refrigerated moves to{" "}
              {"nextRunLabel" in board ? board.nextRunLabel : "the next run"}
            </p>
          )}
        </div>

        <div className="px-4 pb-1">
          <FairnessGuard pending={pending} published={published} />
        </div>

        {plan.edits.length > 0 && (
          <div className="mx-4 mt-2 flex flex-col gap-1 rounded-[10px] bg-subtle px-3 py-2.5">
            <p className="t-caption-m text-fg-3">Your changes on this plan</p>
            {plan.edits.slice(-4).map((e) => (
              <p key={`${e.at}-${e.text}`} className="t-caption text-fg-2">
                {e.text}
              </p>
            ))}
          </div>
        )}

        {groups.map((g) => (
          <LedgerGroup
            key={g.key}
            group={g}
            planId={plan.id}
            draft={!published}
            onFind={onFind}
          />
        ))}
        {count === 0 && (
          <p className="px-4 py-6 t-small text-fg-3">
            Nothing deferred. Every order fits.
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-line bg-subtle px-4 py-[7px] t-caption text-fg-2">
        {published ? (
          <>
            <CircleCheck
              size={14}
              strokeWidth={1.8}
              className="shrink-0 text-success-text"
              aria-hidden
            />
            Published {plan.publishedAt} · {stores}{" "}
            {stores === 1 ? "store" : "stores"} told why
          </>
        ) : (
          <>
            <Bell
              size={14}
              strokeWidth={1.8}
              className="shrink-0"
              aria-hidden
            />
            {stores
              ? `On publish, ${stores} ${stores === 1 ? "store is" : "stores are"} told the reason and next run`
              : "Not published yet"}
          </>
        )}
      </div>
    </aside>
  );
}

function FairnessGuard({
  pending,
  published,
}: {
  pending: { id: string; outletId: string; outlet: string }[];
  published: boolean;
}) {
  if (pending.length === 0)
    return (
      <div className="flex items-center gap-2 rounded-[10px] border border-line bg-surface px-3.5 py-2.5">
        <ShieldCheck
          size={15}
          strokeWidth={1.8}
          className="text-success-text"
          aria-hidden
        />
        <p className="t-small-m text-fg">Fairness guard · nothing to decide</p>
        {!published && (
          <span className="ml-auto t-caption text-fg-3">ready to publish</span>
        )}
      </div>
    );
  const first = pending[0];
  return (
    <div className="flex flex-col gap-2.5 rounded-[10px] border border-warning bg-warning-tint px-3.5 py-3">
      <p className="flex items-center gap-2 t-small-m text-warning-text">
        <ShieldCheck size={16} strokeWidth={1.8} aria-hidden />
        Fairness guard · {pending.length} decision
        {pending.length === 1 ? "" : "s"}
      </p>
      <p className="t-small text-fg">
        {pending.map((p) => `${p.outletId} ${p.outlet}`).join(" and ")}{" "}
        {pending.length === 1 ? "was" : "were"} skipped on the last run.
      </p>
      <div className="flex items-start gap-2">
        <Button
          variant="primary"
          size="sm"
          href={`/dispatcher/plan/decision/${first.id}`}
          className={cx(tap, "max-md:w-full")}
        >
          Review decision
        </Button>
      </div>
    </div>
  );
}

function LedgerGroup({
  group,
  planId,
  draft,
  onFind,
}: {
  group: Group;
  planId: string;
  draft: boolean;
  onFind: (id: string) => void;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <>
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
        <p className="t-caption-m text-fg-3">{group.label}</p>
        <span className="ml-auto t-mono-sm text-fg-3">
          {group.items.length}
        </span>
      </div>
      {group.items.map((d) => (
        <div
          key={d.orderId}
          className={cx(
            "flex flex-col gap-1 border-b border-line px-4 py-2.5",
            d.decisionId && "bg-warning-tint/40",
          )}
        >
          <div className="flex items-center gap-2">
            <span className="t-mono">{d.outletId}</span>
            <span className="truncate t-small-m">{d.outlet}</span>
            <span className="ml-auto t-mono-sm text-fg-2">
              {d.volumeM3.toFixed(1)} m³
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <BrandDot brand={d.brand} className="t-caption-m text-fg-2" />
            <TempPill temp={d.temp} />
            <span
              className={cx(
                "truncate t-caption",
                d.statusTone === "warning" ? "text-warning-text" : "text-fg-3",
              )}
            >
              {d.status}
            </span>
          </div>
          <p className="flex items-start gap-1.5 t-caption text-fg-2">
            <CornerDownRight
              size={12}
              strokeWidth={1.8}
              className="mt-0.5 shrink-0 text-fg-3"
              aria-hidden
            />
            {d.reason}
          </p>
          <div className="flex items-center gap-2">
            {d.decisionId ? (
              <a
                href={`/dispatcher/plan/decision/${d.decisionId}`}
                className="flex items-center gap-1.5 t-caption-m text-warning-text hover:underline"
              >
                <CircleAlert
                  size={12}
                  strokeWidth={1.8}
                  className="shrink-0"
                  aria-hidden
                />
                {d.next.text}
                <ArrowRight size={12} aria-hidden />
              </a>
            ) : (
              <p className="flex items-center gap-1.5 t-caption-m text-success-text">
                <CalendarCheck
                  size={12}
                  strokeWidth={1.8}
                  className="shrink-0"
                  aria-hidden
                />
                {d.next.text}
              </p>
            )}
            {draft && !d.decisionId && (
              <span className="ml-auto flex gap-1">
                {d.pinned ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      start(async () => {
                        const res = await releasePinAction(planId, d.orderId);
                        if (!res.ok)
                          return toast(res.error, { tone: "warning" });
                        toast(
                          `Handed back to the planner · draft v${res.data.version}`,
                        );
                        router.refresh();
                      })
                    }
                    className="flex items-center gap-1 rounded-md px-1.5 py-0.5 t-caption-m text-fg-2 hover:bg-subtle hover:text-fg max-xl:h-10 max-xl:rounded-lg max-xl:border max-xl:border-line max-xl:px-3 max-xl:t-small-m"
                  >
                    <RotateCcw size={12} aria-hidden /> Undo
                  </button>
                ) : (
                  group.key !== "oversize" && (
                    <button
                      type="button"
                      onClick={() => onFind(d.orderId)}
                      className="rounded-md px-1.5 py-0.5 t-caption-m text-accent-text hover:bg-accent-tint max-xl:h-10 max-xl:rounded-lg max-xl:border max-xl:border-line max-xl:px-3 max-xl:t-small-m"
                    >
                      Find a slot
                    </button>
                  )
                )}
              </span>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
