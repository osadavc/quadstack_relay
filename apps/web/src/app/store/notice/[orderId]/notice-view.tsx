"use client";

import { TEMP_LABEL } from "@relay/domain";

import {
  ArrowRight,
  CalendarCheck,
  CalendarX2,
  CircleCheck,
  ShieldCheck,
} from "lucide-react";
import { PhoneColumn, TempTag } from "@/components/store/bits";
import { Button, Pill } from "@/components/ui";
import type { noticeView } from "@/server/queries/store";
import { NoticeActions } from "./notice-actions";

const STATUS: Record<string, string> = {
  confirmed: "Waiting for the plan",
  planned: "Planned",
  loaded: "On the truck",
  delivered: "Delivered",
  received: "Received",
  failed: "Not delivered",
};

export function NoticeView({
  n,
}: {
  n: NonNullable<Awaited<ReturnType<typeof noticeView>>>;
}) {
  const kind =
    n.brand !== "Fresh"
      ? n.brand
      : n.temp === "ambient"
        ? "dry"
        : TEMP_LABEL[n.temp].toLowerCase();
  const next = n.nextRun ?? "the next run";

  if (!n.deferred) {
    return (
      <PhoneColumn
        footer={
          <Button
            variant="secondary"
            size="xl"
            className="md:h-10"
            full
            href="/store/today"
            iconRight={ArrowRight}
          >
            See delivery
          </Button>
        }
      >
        <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
          <Pill tone="success" icon={CircleCheck} className="self-start">
            Not moved
          </Pill>
          <h1 className="f-title">{n.orderId}</h1>
          <p className="t-small text-fg-2">On the {n.dayLabel} delivery</p>
        </section>
      </PhoneColumn>
    );
  }

  return (
    <PhoneColumn
      footer={
        n.dispatch.phone || n.noticeId ? (
          <NoticeActions
            noticeId={n.noticeId}
            acknowledged={n.acknowledged}
            contact={n.dispatch}
          />
        ) : undefined
      }
    >
      <div className="flex flex-col gap-1.5">
        <Pill tone="warning" icon={CalendarX2} className="self-start">
          Moved
        </Pill>
        <h1 className="f-title">
          Your {kind} order moves to {next}
        </h1>
        <p className="t-small text-fg-3">
          Order {n.orderId} · was for {n.dayLabel}
          {n.toldAt ? ` · sent ${n.toldAt}` : ""}
        </p>
      </div>

      {n.reason && (
        <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
          <h2 className="t-caption-m text-fg-3">
            {n.byDispatcher ? `Reason from ${n.dispatch.name}` : "Reason"}
          </h2>
          <p className="t-body">{n.reason}</p>
        </section>
      )}

      <div className="flex items-center gap-2.5 rounded-2xl bg-success-tint p-4">
        <ShieldCheck
          size={18}
          strokeWidth={1.7}
          className="shrink-0 text-success-text"
          aria-hidden
        />
        <p className="f-label text-success-text">Planned first on {next}</p>
      </div>

      <section
        aria-label="Your orders"
        className="overflow-hidden rounded-2xl border border-line bg-surface"
      >
        {n.stillComing.map((o) => (
          <div
            key={o.orderId}
            className="flex items-center gap-3 border-b border-line px-4 py-3"
          >
            <TempTag temp={o.temp} />
            <div className="min-w-0 flex-1">
              <p className="t-small-m">Still on {n.dayLabel}</p>
              <p className="truncate t-caption text-fg-3">
                {o.band
                  ? `Arrival ${o.band}${o.vehicleId ? ` · ${o.vehicleId}` : ""}`
                  : `${o.orderId} · ${STATUS[o.status] ?? o.status}`}
              </p>
            </div>
            <CircleCheck
              size={18}
              strokeWidth={1.7}
              className="shrink-0 text-success-text"
              aria-label="Still coming"
            />
          </div>
        ))}
        <div className="flex items-center gap-3 px-4 py-3">
          <TempTag temp={n.temp} />
          <div className="min-w-0 flex-1">
            <p className="t-small-m">Moves to {next}</p>
            <p className="truncate t-caption text-fg-3">{n.orderId}</p>
          </div>
          <CalendarCheck
            size={18}
            strokeWidth={1.7}
            className="shrink-0 text-accent-text"
            aria-label="Moved"
          />
        </div>
      </section>
    </PhoneColumn>
  );
}
