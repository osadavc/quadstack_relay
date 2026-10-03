"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/components/ui";
import type { Stop } from "@/lib/driver/types";

/* "Next · Stop 2 of 2" card used on the outbox and after reconciling. */
export function NextStopCard({
  stop,
  total,
  note,
}: {
  stop: Stop;
  total: number;
  note?: ReactNode;
}) {
  const tight = stop.band.to > stop.windowClose;
  return (
    <div className="flex w-full shrink-0 flex-col gap-1 rounded-2xl border border-line bg-surface p-3.5">
      <p className="t-caption-m text-fg-3">
        Next · Stop {stop.seq} of {total}
      </p>
      <div className="flex items-center gap-3">
        <p className="min-w-0 truncate f-body-m">
          {stop.outletId} · {stop.outletName}
        </p>
        <span className="flex-1" />
        <p
          className={cx(
            "shrink-0 t-mono",
            tight ? "text-warning-text" : "text-fg-2",
          )}
        >
          {stop.band.label.replace(" – ", "–")}
        </p>
      </div>
      {note && <p className="t-caption text-fg-2">{note}</p>}
    </div>
  );
}

const tileTone = {
  neutral: "bg-subtle text-fg-2",
  accent: "bg-accent-tint text-accent-text",
  success: "bg-success-tint text-success-text",
  warning: "bg-warning-tint text-warning-text",
} as const;

/* Square icon tile used in the outbox and feed rows. */
export function RowTile({
  icon: Icon,
  tone = "neutral",
}: {
  icon: LucideIcon;
  tone?: keyof typeof tileTone;
}) {
  return (
    <span
      className={cx(
        "flex size-9 shrink-0 items-center justify-center rounded-[10px]",
        tileTone[tone],
      )}
      aria-hidden
    >
      <Icon size={18} strokeWidth={1.7} />
    </span>
  );
}

/* One row in the "Latest updates" feed. */
export function FeedRow({
  icon,
  tone,
  title,
  time,
  detail,
}: {
  icon: LucideIcon;
  tone: keyof typeof tileTone;
  title: string;
  time: string;
  detail: string;
}) {
  return (
    <li className="flex items-start gap-3 border-t border-line px-3.5 py-3">
      <RowTile icon={icon} tone={tone} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <p className="min-w-0 t-small-m">{title}</p>
          <span className="flex-1" />
          <p className="t-mono-sm text-fg-3">{time}</p>
        </div>
        <p className="t-caption text-fg-2">{detail}</p>
      </div>
    </li>
  );
}
