"use client";

import { hhmm } from "@relay/domain";
import {
  ArrowLeft,
  ChevronRight,
  CloudCheck,
  CloudOff,
  GitCompare,
  type LucideIcon,
  MapPin,
  Navigation,
  QrCode,
  RadioTower,
  RefreshCw,
  Send,
  Signature,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui";
import { useNav } from "@/lib/driver/nav";
import {
  browserOnline,
  useDriver,
  useOffline,
  useView,
} from "@/lib/driver/store";
import type { RecordKind, Run, Stop } from "@/lib/driver/types";
import { ActionButton, DriverScreen, ListHeader, records } from "../frame";
import { NextStopCard, RowTile } from "../parts";
import { nextStop, useArrive } from "./run";

export const KIND_ICON: Record<RecordKind, LucideIcon> = {
  accept: QrCode,
  depart: Navigation,
  arrive: MapPin,
  complete: Signature,
  problem: TriangleAlert,
  signal: RadioTower,
  reconcile: GitCompare,
};

/** Footer action that moves the trip on: arrive at, or open, the next stop. */
export function useNextAction(run: Run | null) {
  const go = useNav((s) => s.go);
  const arrive = useArrive(run);
  const next = run ? nextStop(run) : undefined;
  if (!run || !next || !["on_road", "accepted"].includes(run.status))
    return null;
  if (next.status === "arrived")
    return {
      label: `Open stop ${next.seq}`,
      icon: MapPin,
      onClick: () => go(`/driver/stop/${next.seq}`),
    };
  if (run.status !== "on_road") return null;
  return {
    label: `Arrived at ${next.outletName}`,
    icon: MapPin,
    onClick: () => {
      arrive(next);
      go(`/driver/stop/${next.seq}`);
    },
  };
}

function nextNote(
  view: ReturnType<typeof useView>["view"],
  stop: Stop | undefined,
) {
  const msg = view.messages[0];
  if (msg)
    return `${msg.text} · from ${msg.from.split(" ")[0]} ${hhmm(msg.at)}`;
  return stop?.band.to && stop.band.to > stop.windowClose
    ? "Window closes before the end of your arrival time"
    : undefined;
}

/** Records waiting on this device, and what was last sent. */
export function OutboxView() {
  const { view } = useView();
  const offline = useOffline();
  const go = useNav((s) => s.go);
  const run = view.run;
  const action = useNextAction(run);
  const next = run ? nextStop(run) : undefined;
  return (
    <DriverScreen
      gap="gap-3"
      back={{ label: "Run", to: "/driver" }}
      footer={
        action ? (
          <ActionButton
            variant="primary"
            icon={action.icon}
            onClick={action.onClick}
          >
            <span className="truncate">{action.label}</span>
          </ActionButton>
        ) : (
          <ActionButton
            variant="secondary"
            icon={ArrowLeft}
            onClick={() => go("/driver")}
          >
            Back to the run
          </ActionButton>
        )
      }
    >
      {offline ? <OfflineState /> : <OnlineState />}
      <WaitingList />
      {next && run && (
        <NextStopCard
          stop={next}
          total={run.stops.length}
          note={nextNote(view, next)}
        />
      )}
    </DriverScreen>
  );
}

function WaitingList() {
  const outbox = useDriver((s) => s.outbox);
  const offline = useOffline();
  const n = outbox.length;
  if (n === 0 && !offline) return null;
  return (
    <section className="w-full overflow-hidden rounded-2xl border border-line bg-surface">
      <ListHeader
        aside={`${n} waiting`}
        asideClass={n ? "t-caption-m text-warning-text" : "t-caption text-fg-3"}
      >
        Waiting to send
      </ListHeader>
      {n === 0 ? (
        <p className="border-t border-line px-3.5 py-3 t-small text-fg-3">
          Nothing waiting
        </p>
      ) : (
        <ul>
          {outbox.map((o) => (
            <li
              key={o.clientId}
              className="flex items-center gap-3 border-t border-line px-3.5 py-3"
            >
              <RowTile icon={KIND_ICON[o.kind]} />
              <div className="flex min-w-0 flex-1 flex-col gap-px">
                <p className="truncate t-small-m">{o.title}</p>
                <p className="truncate t-caption text-fg-3">{o.detail}</p>
              </div>
              <span className="flex shrink-0 items-center gap-1 t-caption-m text-warning-text">
                <span
                  className="size-1.5 rounded-full bg-warning"
                  aria-hidden
                />
                Waiting
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OfflineState() {
  const n = useDriver((s) => s.outbox.length);
  const outage = useDriver((s) => s.outage);
  const lastSync = useDriver((s) => s.lastSync);
  const syncing = useDriver((s) => s.syncing);
  const sync = useDriver((s) => s.sync);
  const since = outage?.since ?? lastSync;
  return (
    <section className="flex w-full flex-col gap-3 rounded-[20px] bg-warning-tint p-[18px]">
      <div className="flex items-center gap-3">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-warning text-fg-inverse"
          aria-hidden
        >
          <CloudOff size={22} strokeWidth={1.8} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="f-heading">
            {n ? `Offline · ${records(n)} saved` : "Offline"}
          </h1>
          <p className="t-small text-fg-2">
            {since ? `No connection since ${hhmm(since)}` : "No connection"}
          </p>
        </div>
      </div>
      <Button
        icon={RefreshCw}
        onClick={() => void sync()}
        disabled={syncing || !browserOnline()}
        className="self-start"
      >
        Try again
      </Button>
    </section>
  );
}

function OnlineState() {
  const { view } = useView();
  const outbox = useDriver((s) => s.outbox);
  const sent = useDriver((s) => s.sent);
  const lastSync = useDriver((s) => s.lastSync);
  const syncing = useDriver((s) => s.syncing);
  const sync = useDriver((s) => s.sync);
  const go = useNav((s) => s.go);
  const open = view.reconciliations.find((r) => r.status === "open");
  const sending = outbox.length > 0;
  return (
    <>
      <section className="flex w-full flex-col gap-3 rounded-[20px] bg-success-tint p-[18px]">
        <div className="flex items-center gap-3">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-success text-fg-inverse"
            aria-hidden
          >
            {sending ? (
              <Send size={20} strokeWidth={1.8} />
            ) : (
              <CloudCheck size={22} strokeWidth={1.8} />
            )}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="f-heading">
              {sending
                ? `Sending ${records(outbox.length)}`
                : "All records sent"}
            </h1>
            <p className="t-small text-fg-2">
              {sent
                ? `${records(sent.count)} sent at ${hhmm(sent.at)} · synced ${lastSync ? hhmm(lastSync) : ""}`
                : `Synced ${lastSync ? hhmm(lastSync) : ""}`}
            </p>
          </div>
        </div>
        {sending && (
          <Button
            icon={RefreshCw}
            onClick={() => void sync()}
            disabled={syncing}
            className="self-start"
          >
            Send now
          </Button>
        )}
      </section>

      {open && (
        <section className="flex w-full flex-col gap-3 rounded-2xl bg-warning-tint p-3.5">
          <div className="flex items-start gap-2.5">
            <GitCompare
              size={18}
              strokeWidth={1.7}
              className="mt-px shrink-0 text-warning-text"
              aria-hidden
            />
            <div className="flex min-w-0 flex-col">
              <p className="t-small-m text-warning-text">
                Count difference on {open.orderId}
              </p>
              <p className="t-small text-fg-2">
                The store counted {open.storeCount}. You recorded{" "}
                {open.driverCount} at handover.
              </p>
            </div>
          </div>
          <Button
            size="lg"
            full
            iconRight={ChevronRight}
            onClick={() => go("/driver/reconcile")}
          >
            Review the difference
          </Button>
        </section>
      )}
    </>
  );
}
