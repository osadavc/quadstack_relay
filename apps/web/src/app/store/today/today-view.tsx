"use client";

import {
  ArrowRight,
  CalendarClock,
  CalendarX2,
  CircleCheck,
  CircleX,
  Clock,
  type LucideIcon,
  MapPin,
  Navigation,
  PackageCheck,
  RadioTower,
  Truck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { PhoneColumn, TempTag } from "@/components/store/bits";
import { HandoffTrail } from "@/components/store/trail";
import { Button, cx, Pill, type Tone } from "@/components/ui";
import type { DeliveryStatus, todayView } from "@/server/queries/store";

const PILL: Record<
  DeliveryStatus,
  { tone: Tone; icon: LucideIcon; label: string }
> = {
  none: { tone: "neutral", icon: Clock, label: "Placed" },
  planned: { tone: "neutral", icon: Clock, label: "Planned" },
  deferred: { tone: "warning", icon: CalendarX2, label: "Moved" },
  live: { tone: "accent", icon: Truck, label: "On the way" },
  degraded: { tone: "accent", icon: Truck, label: "On the way" },
  arrived: { tone: "accent", icon: MapPin, label: "Arrived" },
  delivered: { tone: "success", icon: PackageCheck, label: "Delivered" },
  received: { tone: "success", icon: PackageCheck, label: "Received" },
  failed: { tone: "danger", icon: CircleX, label: "Not delivered" },
};

const BOX: Record<
  DeliveryStatus,
  { cls: string; icon: string; title: string; Icon: LucideIcon }
> = {
  none: { cls: "bg-subtle", icon: "text-fg-2", title: "text-fg", Icon: Clock },
  planned: {
    cls: "bg-subtle",
    icon: "text-fg-2",
    title: "text-fg",
    Icon: Truck,
  },
  deferred: {
    cls: "bg-warning-tint",
    icon: "text-warning-text",
    title: "text-warning-text",
    Icon: CalendarX2,
  },
  live: {
    cls: "bg-accent-tint",
    icon: "text-accent-text",
    title: "text-accent-text",
    Icon: Navigation,
  },
  arrived: {
    cls: "bg-accent-tint",
    icon: "text-accent-text",
    title: "text-accent-text",
    Icon: MapPin,
  },
  degraded: {
    cls: "bg-offline-tint",
    icon: "text-offline-text",
    title: "text-offline-text",
    Icon: RadioTower,
  },
  delivered: {
    cls: "bg-success-tint",
    icon: "text-success-text",
    title: "text-success-text",
    Icon: PackageCheck,
  },
  received: {
    cls: "bg-success-tint",
    icon: "text-success-text",
    title: "text-success-text",
    Icon: CircleCheck,
  },
  failed: {
    cls: "bg-danger-tint",
    icon: "text-danger-text",
    title: "text-danger-text",
    Icon: CircleX,
  },
};

const DOCK: Record<string, string> = {
  rear_dock: "rear dock",
  street: "kerb",
  mall_bay: "mall bay",
};

export function TodayView({
  data,
}: {
  data: Awaited<ReturnType<typeof todayView>>;
}) {
  const [main, ...others] = data.items;

  if (!main) {
    return (
      <PhoneColumn>
        <section className="flex flex-col items-center gap-2 rounded-[20px] border border-line bg-surface px-[18px] py-10 text-center shadow-pop">
          <span className="mb-1 inline-flex size-12 items-center justify-center rounded-2xl bg-subtle text-fg-2">
            <Truck size={22} strokeWidth={1.7} aria-hidden />
          </span>
          <h1 className="f-heading">Nothing on the way</h1>
          <p className="max-w-[30ch] t-small text-fg-3">
            No orders for {data.dayLabel} yet.
          </p>
          <Button
            variant="secondary"
            href="/store/order"
            iconRight={ArrowRight}
            className="mt-2 max-md:h-[46px]"
          >
            Place an order
          </Button>
        </section>
      </PhoneColumn>
    );
  }

  const pill = PILL[main.status];
  const box = BOX[main.status];
  const from = main.band?.split(/\s*[–-]\s*/)[0];
  const showBox = !["none", "deferred"].includes(main.status);
  const footer = main.canConfirm ? (
    <Button
      variant={main.status === "degraded" ? "secondary" : "primary"}
      size="xl"
      className="md:h-10"
      full
      href={`/store/confirm/${main.orderId}`}
    >
      Confirm what arrived
    </Button>
  ) : main.status === "received" ? (
    <Button
      variant="secondary"
      size="xl"
      className="md:h-10"
      full
      href={`/store/record/${main.orderId}`}
      iconRight={ArrowRight}
    >
      Open the delivery record
    </Button>
  ) : main.status === "deferred" ? (
    <Button
      variant="secondary"
      size="xl"
      className="md:h-10"
      full
      href={`/store/notice/${main.orderId}`}
      iconRight={ArrowRight}
    >
      See why it moved
    </Button>
  ) : undefined;

  return (
    <PhoneColumn footer={footer}>
      <section className="flex flex-col gap-3.5 rounded-[20px] border border-line bg-surface p-[18px] shadow-pop">
        <div className="flex items-center gap-2">
          <p className="t-caption-m text-fg-3">{data.dayLabel} delivery</p>
          <Pill tone={pill.tone} icon={pill.icon} size="sm" className="ml-auto">
            {pill.label}
          </Pill>
        </div>
        <div className="flex flex-col gap-0.5">
          {main.status === "deferred" ? (
            <h1 className="f-title">{main.note.title}</h1>
          ) : main.band ? (
            <h1 className="f-hero tabular-nums">{main.band}</h1>
          ) : (
            <h1 className="f-title">Waiting for the plan</h1>
          )}
          {main.status === "deferred" ? (
            main.note.body && (
              <p className="t-small text-fg-3">{main.note.body}</p>
            )
          ) : main.band ? (
            <p className="t-small text-fg-3">
              {main.status === "received" || main.status === "delivered"
                ? "Planned arrival window"
                : "Expected arrival"}
            </p>
          ) : null}
        </div>
        {main.movedFrom && (
          <p className="flex items-center gap-2 t-small text-fg-2">
            <CalendarClock
              size={16}
              strokeWidth={1.7}
              className="shrink-0 text-fg-3"
              aria-hidden
            />
            Moved here from {main.movedFrom}
          </p>
        )}
        {showBox && (
          <div
            aria-live="polite"
            className={cx(
              "flex items-center gap-2.5 rounded-xl p-3 transition-colors",
              box.cls,
            )}
          >
            <box.Icon
              size={18}
              strokeWidth={1.7}
              className={cx("shrink-0", box.icon)}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className={cx("t-small-m", box.title)}>{main.note.title}</p>
              {main.note.body && (
                <p className="t-caption text-fg-2">{main.note.body}</p>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="flex items-center gap-2 t-caption-m text-fg-3">
          {main.temp === "chilled"
            ? "Chilled order"
            : main.brand === "Fresh"
              ? "Dry order"
              : "Order"}{" "}
          · {main.orderId}
        </h2>
        <HandoffTrail stages={main.trail} />
      </section>

      {others.length > 0 && (
        <section
          aria-label="Other orders on this delivery"
          className="overflow-hidden rounded-2xl border border-line bg-surface"
        >
          <p className="px-4 pt-3 pb-1 t-caption-m text-fg-3">
            Also on this delivery
          </p>
          <ul>
            {others.map((o) => (
              <li
                key={o.orderId}
                className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0"
              >
                <TempTag temp={o.temp} />
                <div className="min-w-0 flex-1">
                  <p className="truncate t-small-m">{o.orderId}</p>
                  <p className="truncate t-caption text-fg-3">
                    {o.status === "deferred"
                      ? o.note.title
                      : PILL[o.status].label}
                    {o.receipt
                      ? ` · ${o.receipt.received} of ${o.receipt.expected} received`
                      : o.status !== "deferred" && o.band
                        ? ` · ${o.band}`
                        : ""}
                    {o.movedFrom ? ` · moved from ${o.movedFrom}` : ""}
                  </p>
                </div>
                {o.canConfirm ? (
                  <Button
                    href={`/store/confirm/${o.orderId}`}
                    className="max-md:h-10"
                  >
                    Confirm
                  </Button>
                ) : o.status === "deferred" ? (
                  <Link
                    href={`/store/notice/${o.orderId}`}
                    className="-mr-2 inline-flex h-8 shrink-0 items-center rounded-lg px-2 t-small-m text-accent-text transition-colors hover:bg-accent-tint max-md:h-10"
                  >
                    Details
                  </Link>
                ) : (
                  <Link
                    href={`/store/record/${o.orderId}`}
                    className="-mr-2 inline-flex h-8 shrink-0 items-center rounded-lg px-2 t-small-m text-accent-text transition-colors hover:bg-accent-tint max-md:h-10"
                  >
                    Record
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {from &&
        ["planned", "live", "degraded", "none"].includes(main.status) && (
          <div className="flex items-start gap-2 rounded-xl bg-subtle p-3.5">
            <Users
              size={18}
              strokeWidth={1.7}
              className="mt-px shrink-0 text-fg-2"
              aria-hidden
            />
            <p className="f-label text-fg-2">
              Have someone at the {DOCK[data.outlet.dock] ?? "dock"} from {from}
              .
            </p>
          </div>
        )}
    </PhoneColumn>
  );
}
