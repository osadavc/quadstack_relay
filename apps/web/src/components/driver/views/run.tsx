"use client";

import {
  clockOf,
  cmpOps,
  DOCK_LABEL,
  hhmm,
  m3,
  minutesOf,
  plural,
  requiresRefrigeration,
  windowLabel,
} from "@relay/domain";
import {
  Check,
  ChevronRight,
  CircleCheck,
  CircleX,
  Clock,
  GitCompare,
  MapPin,
  MessageSquare,
  Navigation,
  Package,
  PackageMinus,
  Phone,
  QrCode,
  ScanLine,
  Snowflake,
  Truck,
  Warehouse,
} from "lucide-react";
import { useState } from "react";
import { CallSheet, useDisclosure } from "@/components/interact";
import { Button, cx, IconTile, Pill } from "@/components/ui";
import { useNav } from "@/lib/driver/nav";
import { nowAt, useDriver, useOffline, useView } from "@/lib/driver/store";
import type { Run, Snapshot, Stop } from "@/lib/driver/types";
import {
  ActionButton,
  DriverScreen,
  OfflineBanner,
  unitsLabel,
} from "../frame";

const ACCEPTED = ["accepted", "on_road", "completed"];

export function nextStop(run: Run): Stop | undefined {
  return run.stops.find(
    (s) => s.status === "pending" || s.status === "arrived",
  );
}

/** "on time", "before the window", "after the window" for an arrival. */
export function arrivalWord(at: string, stop: Stop, day: string) {
  const m = minutesOf(at, day);
  if (m > stop.windowClose) return "after the window";
  if (m < stop.windowOpen) return "before the window";
  return "on time";
}

/** Record an arrival at a stop. */
export function useArrive(run: Run | null) {
  const record = useDriver((s) => s.record);
  return (stop: Stop) => {
    if (!run) return;
    const at = nowAt();
    record("arrive", {
      at,
      runId: run.id,
      seq: stop.seq,
      title: `Arrived · ${stop.outletId}`,
      detail: `${hhmm(at)} · ${arrivalWord(at, stop, run.day)}`,
    });
  };
}

/** The trip: stops, windows and warnings, and the next thing to do. */
export function RunView() {
  const { view } = useView();
  const record = useDriver((s) => s.record);
  const offline = useOffline();
  const go = useNav((s) => s.go);
  const call = useDisclosure();
  const [code, setCode] = useState("");
  const run = view.run;
  const arrive = useArrive(run);

  if (!run) return <NoRun view={view} />;

  const accepted = ACCEPTED.includes(run.status);
  const released = run.status === "released";
  const next = nextStop(run);
  const done = run.status === "completed" || !next;
  const shortfalls = run.stops.flatMap((s) =>
    s.orders.filter((o) => o.shortfall).map((o) => ({ stop: s, order: o })),
  );
  const message = view.messages[0];
  const openRec = view.reconciliations.find((r) => r.status === "open");
  const recStop = openRec
    ? run.stops.find((s) => s.orders.some((o) => o.id === openRec.orderId))
    : undefined;
  const laterTrip = view.otherTrips.find(
    (t) => t.status !== "completed" && t.tripNo > run.tripNo,
  );
  const hasPhone = Boolean(view.dispatch.phone);

  const accept = () => {
    const at = nowAt();
    record("accept", {
      at,
      runId: run.id,
      payload: { code },
      title: "Load accepted",
      detail: `${hhmm(at)} · code ${code}`,
    });
    setCode("");
  };
  const depart = () => {
    const at = nowAt();
    record("depart", {
      at,
      runId: run.id,
      title: `Left ${run.depot}`,
      detail: `${hhmm(at)} · for ${run.district}`,
    });
  };

  const cta = done
    ? null
    : !accepted
      ? {
          label: "Start trip",
          icon: Navigation,
          disabled: true,
          onClick: () => {},
        }
      : run.status === "accepted"
        ? { label: "Start trip", icon: Navigation, onClick: depart }
        : next?.status === "arrived"
          ? {
              label: `Open stop ${next.seq}`,
              icon: MapPin,
              onClick: () => go(`/driver/stop/${next.seq}`),
            }
          : next
            ? {
                label: `Arrived at ${next.outletName}`,
                icon: MapPin,
                onClick: () => {
                  arrive(next);
                  go(`/driver/stop/${next.seq}`);
                },
              }
            : null;

  const delivered = run.stops.filter((s) => s.status === "completed").length;
  const failed = run.stops.filter((s) => s.status === "failed").length;
  const finished = run.stops
    .map((s) => s.completedAt)
    .filter((t): t is string => Boolean(t))
    .sort(cmpOps)
    .at(-1);

  const footer = cta ? (
    <div className="flex gap-2.5">
      {hasPhone && (
        <button
          type="button"
          aria-label="Call dispatch"
          onClick={call.onOpen}
          className="flex size-[46px] shrink-0 items-center justify-center rounded-xl bg-subtle text-fg transition-colors hover:bg-muted md:size-10 md:rounded-[10px]"
        >
          <Phone size={18} strokeWidth={1.7} aria-hidden />
        </button>
      )}
      <ActionButton
        variant="primary"
        icon={cta.icon}
        disabled={cta.disabled}
        onClick={cta.onClick}
        className="min-w-0 flex-1"
      >
        <span className="truncate">{cta.label}</span>
      </ActionButton>
    </div>
  ) : hasPhone ? (
    <ActionButton variant="secondary" icon={Phone} onClick={call.onOpen}>
      Call dispatch
    </ActionButton>
  ) : undefined;

  return (
    <>
      <CallSheet
        open={call.open}
        onClose={call.onClose}
        contact={view.dispatch}
      />
      <DriverScreen footer={footer}>
        {offline && <OfflineBanner />}

        <div className="flex flex-col gap-1">
          <p className="t-caption-m text-fg-3">
            {run.dayLabel} · trip {run.tripNo}
          </p>
          <h1 className="f-title">{run.district} run</h1>
          <p className="t-body text-fg-2">
            {plural(run.stops.length, "stop")} ·{" "}
            {plural(run.orderCount, "order")} · {m3(run.volumeM3)} · departs{" "}
            {clockOf(run.depart)}
          </p>
        </div>

        {done ? (
          <section className="flex w-full items-center gap-3 rounded-2xl bg-success-tint p-3.5">
            <CircleCheck
              size={22}
              strokeWidth={1.7}
              className="shrink-0 text-success-text"
              aria-hidden
            />
            <div className="flex min-w-0 flex-col">
              <p className="f-label text-success-text">
                Trip complete{finished ? ` · ${hhmm(finished)}` : ""}
              </p>
              <p className="t-small text-fg-2">
                {plural(delivered, "stop")} delivered
                {failed ? ` · ${failed} not delivered` : ""}
              </p>
            </div>
          </section>
        ) : accepted ? (
          <section className="flex w-full flex-col gap-2.5 rounded-2xl border border-line bg-surface p-3.5">
            <div className="flex items-center gap-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-success text-fg-inverse">
                <Check size={15} strokeWidth={2} aria-hidden />
              </span>
              <p className="t-small-m">
                Load accepted
                {run.loaderName ? ` from ${run.loaderName.split(" ")[0]}` : ""}
                {run.acceptedAt ? ` · ${hhmm(run.acceptedAt)}` : ""}
                {run.seal ? ` · seal ${run.seal}` : ""}
              </p>
            </div>
            {shortfalls.map(({ stop, order }) => (
              <div
                key={order.id}
                className="flex items-start gap-2.5 rounded-xl bg-warning-tint p-3"
              >
                <PackageMinus
                  size={18}
                  strokeWidth={1.7}
                  className="shrink-0 text-warning-text"
                  aria-hidden
                />
                <p className="t-small">
                  {plural(order.shortfall?.cases ?? 0, "unit")} of{" "}
                  {order.shortfall?.what} for {stop.outletId} short from the
                  dock. The store has been told.
                </p>
              </div>
            ))}
          </section>
        ) : released ? (
          <section className="flex w-full flex-col gap-3 rounded-2xl border border-line bg-surface p-3.5">
            <div className="flex items-center gap-3">
              <IconTile icon={QrCode} tone="accent" size={40} />
              <div className="min-w-0">
                <p className="f-label">
                  Accept the load
                  {run.loaderName
                    ? ` from ${run.loaderName.split(" ")[0]}`
                    : ""}
                </p>
                <p className="t-small text-fg-2">
                  Scan the dock’s QR code or enter its 4-digit code
                </p>
              </div>
            </div>
            <label className="flex h-[46px] items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 focus-within:border-accent md:h-10 md:rounded-[10px]">
              <span className="t-small text-fg-3">Code</span>
              <input
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="0000"
                aria-label="Handover code from the dock"
                className="min-w-0 flex-1 bg-transparent text-right f-mono tracking-[0.3em] outline-none placeholder:text-fg-3"
              />
            </label>
            <ActionButton
              variant="primary"
              icon={ScanLine}
              disabled={code.length !== 4}
              onClick={accept}
            >
              Accept load
            </ActionButton>
          </section>
        ) : (
          <section className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3.5">
            <IconTile icon={Warehouse} tone="neutral" size={40} />
            <div className="min-w-0">
              <p className="f-label">
                {run.status === "planned"
                  ? "Waiting for the dock"
                  : "Loading at the dock"}
              </p>
              <p className="t-small text-fg-2">
                You get the handover code at release · departs{" "}
                {clockOf(run.depart)}
              </p>
            </div>
          </section>
        )}

        {openRec && (
          <section className="flex w-full items-center gap-3 rounded-2xl bg-warning-tint p-3.5">
            <GitCompare
              size={18}
              strokeWidth={1.7}
              className="shrink-0 text-warning-text"
              aria-hidden
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="t-small-m text-warning-text">
                Count difference on {openRec.orderId}
              </p>
              <p className="t-small text-fg-2">
                {recStop?.outletId ?? "The store"} counted {openRec.storeCount},
                you handed over {openRec.driverCount}
              </p>
            </div>
            <Button
              iconRight={ChevronRight}
              onClick={() => go("/driver/reconcile")}
            >
              Review
            </Button>
          </section>
        )}

        {message && (
          <section className="flex w-full items-start gap-3 rounded-2xl bg-accent-tint p-3.5">
            <MessageSquare
              size={18}
              strokeWidth={1.7}
              className="mt-px shrink-0 text-accent-text"
              aria-hidden
            />
            <div className="min-w-0">
              <p className="t-small-m text-accent-text">{message.text}</p>
              <p className="t-caption text-fg-2">
                From {message.from.split(" ")[0]} · {hhmm(message.at)}
              </p>
            </div>
          </section>
        )}

        <section
          aria-label="Stops"
          className="flex w-full flex-col rounded-2xl border border-line bg-surface px-4 pt-4"
        >
          {run.stops.map((stop, i) => (
            <StopRow
              key={stop.id}
              stop={stop}
              last={i === run.stops.length - 1}
              day={run.day}
              onOpen={() => go(`/driver/stop/${stop.seq}`)}
            />
          ))}
        </section>

        {laterTrip && done && (
          <section className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3.5">
            <IconTile icon={GitCompare} tone="accent" size={40} />
            <div className="min-w-0">
              <p className="f-label">
                Next: trip {laterTrip.tripNo} to {laterTrip.district}
              </p>
              <p className="t-small text-fg-2">
                Reload at {run.depot} · departs {clockOf(laterTrip.depart)}
              </p>
            </div>
          </section>
        )}
      </DriverScreen>
    </>
  );
}

function StopRow({
  stop,
  last,
  day,
  onOpen,
}: {
  stop: Stop;
  last: boolean;
  day: string;
  onOpen: () => void;
}) {
  const tight = stop.band.to > stop.windowClose;
  const arrivedWord = stop.arrivedAt
    ? arrivalWord(stop.arrivedAt, stop, day)
    : "";
  return (
    <div className="flex gap-3.5">
      <div className="flex w-8 shrink-0 flex-col items-center">
        <span
          className={cx(
            "flex size-8 shrink-0 items-center justify-center rounded-full t-subheading text-fg-inverse transition-colors",
            stop.status === "completed"
              ? "bg-success"
              : stop.status === "failed"
                ? "bg-danger"
                : "bg-inverse",
          )}
        >
          {stop.status === "completed" ? (
            <>
              <Check size={16} strokeWidth={2} aria-hidden />
              <span className="sr-only">Stop {stop.seq} done</span>
            </>
          ) : stop.status === "failed" ? (
            <CircleX
              size={16}
              strokeWidth={2}
              aria-label={`Stop ${stop.seq} not delivered`}
            />
          ) : (
            stop.seq
          )}
        </span>
        {!last && <span className="w-0.5 flex-1 bg-line-strong" aria-hidden />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1 pb-4">
        <button
          type="button"
          onClick={onOpen}
          className="flex items-center gap-1 self-start text-left f-body-m transition-colors hover:text-accent-text"
        >
          {stop.outletId} · {stop.outletName}
          <ChevronRight
            size={16}
            strokeWidth={1.7}
            className="shrink-0 text-fg-3"
            aria-hidden
          />
        </button>
        {stop.status === "completed" ? (
          <p className="flex items-center gap-1.5 t-small-m text-success-text">
            <CircleCheck size={14} strokeWidth={1.8} aria-hidden />
            Handed over {stop.completedAt ? hhmm(stop.completedAt) : ""}
          </p>
        ) : stop.status === "failed" ? (
          <p className="flex items-center gap-1.5 t-small-m text-danger-text">
            <CircleX size={14} strokeWidth={1.8} aria-hidden />
            Not delivered
          </p>
        ) : stop.arrivedAt ? (
          <p
            className={cx(
              "flex items-center gap-1.5 t-small-m",
              arrivedWord === "after the window"
                ? "text-warning-text"
                : "text-success-text",
            )}
          >
            <CircleCheck size={14} strokeWidth={1.8} aria-hidden />
            Arrived {hhmm(stop.arrivedAt)} · {arrivedWord}
          </p>
        ) : (
          <p
            className={cx(
              "flex items-center gap-1.5 t-small-m",
              tight && "text-warning-text",
            )}
          >
            <Clock size={14} strokeWidth={1.8} aria-hidden />
            Arrive {windowLabel(stop.band.from, stop.band.to)}
          </p>
        )}
        <p className="t-caption text-fg-3">
          {stop.district} · window{" "}
          {windowLabel(stop.windowOpen, stop.windowClose)} ·{" "}
          {(DOCK_LABEL[stop.dockType] ?? stop.dockType).toLowerCase()}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {stop.orders.map((o) => (
            <Pill
              key={o.id}
              tone={requiresRefrigeration(o.temp) ? "chilled" : "neutral"}
              icon={requiresRefrigeration(o.temp) ? Snowflake : Package}
            >
              {unitsLabel(o)}
            </Pill>
          ))}
        </div>
      </div>
    </div>
  );
}

/** No trip on the vehicle yet. */
function NoRun({ view }: { view: Snapshot }) {
  const offline = useOffline();
  const call = useDisclosure();
  const vehicleId = view.driver.vehicleId;
  return (
    <>
      <CallSheet
        open={call.open}
        onClose={call.onClose}
        contact={view.dispatch}
      />
      <DriverScreen
        footer={
          view.dispatch.phone ? (
            <ActionButton
              variant="secondary"
              icon={Phone}
              onClick={call.onOpen}
            >
              Call dispatch
            </ActionButton>
          ) : undefined
        }
      >
        {offline && <OfflineBanner />}
        <div className="flex flex-col gap-1">
          <h1 className="f-title">
            {vehicleId ? "No trip assigned yet" : "No vehicle assigned"}
          </h1>
          <p className="t-body text-fg-2">
            {vehicleId
              ? `Stops show here when dispatch publishes a trip for ${vehicleId}.`
              : "Ask dispatch to add a vehicle to your account."}
          </p>
        </div>
        {vehicleId && (
          <section className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3.5">
            <IconTile icon={Truck} tone="neutral" size={40} />
            <div className="min-w-0">
              <p className="f-label">{vehicleId}</p>
              <p className="t-small text-fg-2">{view.driver.name}</p>
            </div>
          </section>
        )}
      </DriverScreen>
    </>
  );
}
