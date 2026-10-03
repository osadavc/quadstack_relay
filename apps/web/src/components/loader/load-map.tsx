"use client";

import { ArrowUpRight, DoorOpen } from "lucide-react";
import { Card, cx } from "@/components/ui";
import { kindCount, m3, type Section } from "./format";

const HEIGHT = 380;

/* Nose to doors, the way the truck is filled. Heights follow the volume. */
export function LoadMap({
  sections,
  free,
  capM3,
  firstStopSeq = 1,
}: {
  sections: Section[];
  free: number;
  capM3: number;
  firstStopSeq?: number;
}) {
  const usable = HEIGHT - 8 - 4 * sections.length;
  const px = (v: number) =>
    Math.max(38, Math.round((v / Math.max(capM3, 0.1)) * usable));
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div>
        <p className="f-label">Load map</p>
        <p className="t-small text-fg-3">
          Last stop in first, first stop at the doors
        </p>
      </div>
      <div className="flex items-stretch gap-3">
        {/* Grows past the usual height when a long trip has many sections. */}
        <div
          className="flex w-[150px] shrink-0 flex-col gap-1 rounded-xl border-2 border-line-strong bg-surface p-1"
          style={{ minHeight: HEIGHT }}
        >
          {sections.map((z) => {
            const done = z.units.filter((u) => u.status !== "pending").length;
            const share = z.units.length ? done / z.units.length : 0;
            const full = share === 1;
            const fill =
              z.temp === "chilled"
                ? "bg-chilled-tint"
                : z.stopSeq === firstStopSeq
                  ? "bg-fresh-tint"
                  : "bg-muted";
            const mono =
              z.temp === "chilled"
                ? "text-chilled-text"
                : z.stopSeq === firstStopSeq
                  ? "text-fresh"
                  : "text-fg-2";
            return (
              <div
                key={`${z.stopSeq}-${z.temp}`}
                className={cx(
                  "relative shrink-0 overflow-hidden rounded-lg border",
                  full
                    ? "border-transparent"
                    : "border-dashed border-line-strong",
                )}
                style={{ height: px(z.volumeM3) }}
                title={`${done} of ${z.units.length} orders loaded`}
              >
                <div
                  className={cx(
                    "absolute inset-x-0 top-0 transition-[height] duration-300",
                    fill,
                  )}
                  style={{ height: `${share * 100}%` }}
                  aria-hidden
                />
                <div className="relative flex h-full flex-col justify-center px-2.5">
                  <p className="truncate t-caption-m">
                    {z.outletId} · {kindCount(z.units)}
                  </p>
                  <p className={cx("t-mono-sm", mono)}>{m3(z.volumeM3)}</p>
                </div>
              </div>
            );
          })}
          <div className="flex min-h-[38px] flex-1 flex-col justify-center rounded-lg border border-dashed border-line-strong px-2.5">
            <p className="t-caption-m">Free</p>
            <p className="t-mono-sm text-fg-3">{m3(free)}</p>
          </div>
        </div>
        <div className="flex flex-col justify-between py-3">
          <span className="flex items-center gap-1.5 t-caption-m text-fg-3">
            <ArrowUpRight size={14} strokeWidth={1.7} aria-hidden />
            Nose
          </span>
          <span className="flex items-center gap-1.5 t-caption-m text-fg-2">
            <DoorOpen size={14} strokeWidth={1.7} aria-hidden />
            Doors
          </span>
        </div>
      </div>
    </Card>
  );
}
