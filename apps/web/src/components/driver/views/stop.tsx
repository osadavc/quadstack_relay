"use client";

import {
  DOCK_LABEL,
  hhmm,
  requiresRefrigeration,
  windowLabel,
} from "@relay/domain";
import {
  ArrowLeft,
  CircleCheck,
  Clock,
  ExternalLink,
  HandHelping,
  MapPin,
  Package,
  Phone,
  Snowflake,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { initialsOf } from "@/components/account-menu";
import {
  CallSheet,
  PhoneSheet,
  toast,
  useDisclosure,
} from "@/components/interact";
import { Avatar, cx } from "@/components/ui";
import { useNav } from "@/lib/driver/nav";
import { nowAt, useDriver, useOffline, useView } from "@/lib/driver/store";
import type { Stop } from "@/lib/driver/types";
import {
  ActionButton,
  casesWord,
  DriverScreen,
  ListHeader,
  OfflineBanner,
  orderKind,
  unitsLabel,
} from "../frame";
import { arrivalWord, useArrive } from "./run";

const PROBLEMS = [
  "Store closed",
  "Access blocked",
  "Delivery refused",
  "Something else",
];

export const mapsUrl = (stop: Pick<Stop, "outletName" | "district">) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${stop.outletName}, ${stop.district}, Sri Lanka`,
  )}`;

const dockWord = (stop: Stop) =>
  (DOCK_LABEL[stop.dockType] ?? stop.dockType).toLowerCase();

/** One stop: where it is, what to unload, and who receives it. */
export function StopView({ seq }: { seq: number }) {
  const { view } = useView();
  const record = useDriver((s) => s.record);
  const offline = useOffline();
  const go = useNav((s) => s.go);
  const call = useDisclosure();
  const problem = useDisclosure();
  const [reason, setReason] = useState(PROBLEMS[0]);
  const run = view.run;
  const stop = run?.stops.find((s) => s.seq === seq);
  const arrive = useArrive(run);

  if (!run || !stop) {
    return (
      <DriverScreen
        back={{ label: "Run", to: "/driver" }}
        footer={
          <ActionButton
            variant="secondary"
            icon={ArrowLeft}
            onClick={() => go("/driver")}
          >
            Back to the run
          </ActionButton>
        }
      >
        <h1 className="f-title">Stop not found</h1>
        <p className="t-body text-fg-2">
          It may have been removed from your trip.
        </p>
      </DriverScreen>
    );
  }

  const word = stop.arrivedAt ? arrivalWord(stop.arrivedAt, stop, run.day) : "";
  const late = word === "after the window";
  const departed = ["on_road", "completed"].includes(run.status);

  const report = () => {
    const at = nowAt();
    record("problem", {
      at,
      runId: run.id,
      seq: stop.seq,
      payload: { reason },
      title: `Not delivered · ${stop.outletId}`,
      detail: `${hhmm(at)} · ${reason}`,
    });
    problem.onClose();
    toast(offline ? "Saved on this phone" : "Reported to dispatch", {
      detail: offline ? `${reason} · sends when back online` : reason,
      tone: offline ? "warning" : "success",
    });
    go("/driver");
  };

  const receiver = stop.receiver ?? "Store manager";
  const contact = {
    name: receiver,
    role: `Store manager · ${stop.outletId} ${stop.outletName}`,
    phone: stop.phone,
  };

  return (
    <>
      <CallSheet open={call.open} onClose={call.onClose} contact={contact} />
      <PhoneSheet
        open={problem.open}
        onClose={problem.onClose}
        title="Can’t deliver here?"
        description="Choose a reason. The goods stay on the truck."
        actions={
          <ActionButton variant="danger" onClick={report}>
            Report to dispatch
          </ActionButton>
        }
      >
        <div className="flex flex-col gap-2">
          {PROBLEMS.map((p) => (
            // biome-ignore lint/a11y/useSemanticElements: large tap target styled as a card
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={reason === p}
              onClick={() => setReason(p)}
              className={cx(
                "flex h-12 items-center gap-3 rounded-xl border px-4 text-left f-label transition-colors md:h-10",
                reason === p
                  ? "border-danger bg-danger-tint text-danger-text"
                  : "border-line bg-surface",
              )}
            >
              <span
                className={cx(
                  "size-4 rounded-full border-[1.5px]",
                  reason === p
                    ? "border-danger bg-danger ring-2 ring-surface ring-inset"
                    : "border-line-strong",
                )}
                aria-hidden
              />
              {p}
            </button>
          ))}
        </div>
      </PhoneSheet>

      <DriverScreen
        gap="gap-3.5"
        back={{ label: "Run", to: "/driver" }}
        footer={
          stop.status === "completed" || stop.status === "failed" ? (
            <ActionButton
              variant="secondary"
              icon={ArrowLeft}
              onClick={() => go("/driver")}
            >
              Back to the run
            </ActionButton>
          ) : (
            <>
              {stop.arrivedAt ? (
                <ActionButton
                  variant="primary"
                  icon={HandHelping}
                  onClick={() => go(`/driver/handover/${stop.seq}`)}
                >
                  Start handover
                </ActionButton>
              ) : (
                <ActionButton
                  variant="primary"
                  icon={MapPin}
                  disabled={!departed}
                  onClick={() => arrive(stop)}
                >
                  <span className="truncate">
                    {departed
                      ? `Arrived at ${stop.outletName}`
                      : "Start the trip first"}
                  </span>
                </ActionButton>
              )}
              <button
                type="button"
                onClick={problem.onOpen}
                className="mx-auto rounded-md px-2 t-small-m text-danger-text hover:underline"
              >
                Can’t deliver here?
              </button>
            </>
          )
        }
      >
        {offline && <OfflineBanner />}

        <div className="flex flex-col gap-1">
          <p className="t-caption-m text-fg-3">
            Stop {stop.seq} of {run.stops.length}
          </p>
          <h1 className="f-title">
            {stop.outletId} · {stop.outletName}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="t-body text-fg-2">
              {stop.district} · {dockWord(stop)}
            </p>
            <a
              href={mapsUrl(stop)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 t-small-m text-accent-text hover:underline"
            >
              Open in maps
              <ExternalLink size={14} strokeWidth={1.7} aria-hidden />
            </a>
          </div>
        </div>

        {stop.status === "failed" ? (
          <div className="flex w-full items-center gap-3 rounded-2xl bg-danger-tint p-3.5">
            <TriangleAlert
              size={22}
              strokeWidth={1.7}
              className="shrink-0 text-danger-text"
              aria-hidden
            />
            <div className="flex min-w-0 flex-col">
              <p className="f-label text-danger-text">Not delivered</p>
              <p className="t-small text-fg-2">
                Reported to dispatch · goods return to {run.depot}
              </p>
            </div>
          </div>
        ) : stop.status === "completed" ? (
          <div className="flex w-full items-center gap-3 rounded-2xl bg-success-tint p-3.5">
            <CircleCheck
              size={22}
              strokeWidth={1.7}
              className="shrink-0 text-success-text"
              aria-hidden
            />
            <div className="flex min-w-0 flex-col">
              <p className="f-label text-success-text">
                Handed over {stop.completedAt ? hhmm(stop.completedAt) : ""}
              </p>
              <p className="t-small text-fg-2">
                Receiving window{" "}
                {windowLabel(stop.windowOpen, stop.windowClose)}
              </p>
            </div>
          </div>
        ) : stop.arrivedAt ? (
          <div
            className={cx(
              "flex w-full items-center gap-3 rounded-2xl p-3.5",
              late ? "bg-warning-tint" : "bg-success-tint",
            )}
          >
            <CircleCheck
              size={22}
              strokeWidth={1.7}
              className={cx(
                "shrink-0",
                late ? "text-warning-text" : "text-success-text",
              )}
              aria-hidden
            />
            <div className="flex min-w-0 flex-col">
              <p
                className={cx(
                  "f-label",
                  late ? "text-warning-text" : "text-success-text",
                )}
              >
                Arrived {hhmm(stop.arrivedAt)} · {word}
              </p>
              <p className="t-small text-fg-2">
                Receiving window{" "}
                {windowLabel(stop.windowOpen, stop.windowClose)}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex w-full items-center gap-3 rounded-2xl bg-subtle p-3.5">
            <Clock
              size={22}
              strokeWidth={1.7}
              className="shrink-0 text-fg-2"
              aria-hidden
            />
            <div className="flex min-w-0 flex-col">
              <p className="f-label">
                Expected {windowLabel(stop.band.from, stop.band.to)}
              </p>
              <p className="t-small text-fg-2">
                Receiving window{" "}
                {windowLabel(stop.windowOpen, stop.windowClose)}
              </p>
            </div>
          </div>
        )}

        <section className="w-full overflow-hidden rounded-2xl border border-line bg-surface">
          <ListHeader aside="doors side first">Unload</ListHeader>
          <ul>
            {stop.orders.map((o) => (
              <li
                key={o.id}
                className="flex items-center gap-3 border-t border-line p-3.5"
              >
                <span
                  className={cx(
                    "flex size-10 shrink-0 items-center justify-center rounded-xl",
                    requiresRefrigeration(o.temp)
                      ? "bg-chilled-tint text-chilled-text"
                      : "bg-subtle text-fg-2",
                  )}
                  aria-hidden
                >
                  {requiresRefrigeration(o.temp) ? (
                    <Snowflake size={20} strokeWidth={1.7} />
                  ) : (
                    <Package size={20} strokeWidth={1.7} />
                  )}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-px">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <p className="f-label">
                      {orderKind(o)} · {unitsLabel(o)}
                    </p>
                    <p className="t-mono text-fg-3">{o.id}</p>
                  </div>
                  <p className="t-small text-fg-2">
                    {o.shortfall
                      ? `${o.loaded} ${casesWord(o)} · ${o.shortfall.cases} short from the dock`
                      : `${o.loaded} ${casesWord(o)}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="flex w-full items-center gap-3 rounded-2xl bg-subtle p-3.5">
          <Avatar initials={initialsOf(receiver)} size={36} tone="success" />
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="truncate t-small-m">Receiver · {receiver}</p>
            <p className="truncate t-caption text-fg-3">
              {stop.phone ?? "No phone number on file"}
            </p>
          </div>
          {stop.phone && (
            <button
              type="button"
              aria-label={`Call ${receiver}`}
              onClick={call.onOpen}
              className="-m-2 flex size-10 shrink-0 items-center justify-center rounded-xl text-fg transition-colors hover:bg-muted"
            >
              <Phone size={18} strokeWidth={1.7} aria-hidden />
            </button>
          )}
        </div>
      </DriverScreen>
    </>
  );
}
