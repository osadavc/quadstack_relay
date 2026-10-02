"use client";

import type { LucideIcon } from "lucide-react";
import { GitCompare, ThermometerSnowflake, Truck } from "lucide-react";
import type { ReactNode } from "react";
import { cx, IconTile, Pill, Progress } from "@/components/ui";

const BRAND_DOT: Record<string, string> = {
  Fresh: "bg-fresh",
  Style: "bg-style",
  Tech: "bg-tech",
};

/* One vehicle on the dock queue (L1). */
export function VehicleCard({
  vehicleId,
  reefer,
  body,
  departs,
  eta,
  urgent,
  brand,
  route,
  tempPill,
  banner,
  status,
  progress,
  progressTone = "inverse",
  dock,
  action,
}: {
  vehicleId: string;
  reefer: boolean;
  body: string;
  departs: string;
  eta: string;
  urgent?: boolean;
  brand: string;
  route: string;
  tempPill?: ReactNode;
  banner?: string | null;
  status: string;
  progress: number;
  progressTone?: "inverse" | "success";
  dock: number;
  action: ReactNode;
}) {
  const icon: LucideIcon = reefer ? ThermometerSnowflake : Truck;
  return (
    <article
      className="flex min-w-0 flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-pop max-md:gap-3.5 max-md:p-4"
      aria-label={vehicleId}
    >
      <div className="flex items-center gap-3.5">
        <IconTile icon={icon} tone={reefer ? "chilled" : "neutral"} size={48} />
        <div className="min-w-0">
          <h2 className="f-title">{vehicleId}</h2>
          <p className="truncate t-body text-fg-3">{body}</p>
        </div>
        <div className="ml-auto flex shrink-0 flex-col items-end gap-0.5">
          <p className="f-mono">{departs}</p>
          <p
            className={cx(
              "t-caption whitespace-nowrap",
              urgent ? "text-warning-text" : "text-fg-3",
            )}
          >
            {eta}
          </p>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <span className="flex shrink-0 items-center gap-1.5 t-small-m text-fg-2">
          <span
            className={cx(
              "size-2 rounded-full",
              BRAND_DOT[brand] ?? "bg-fresh",
            )}
            aria-hidden
          />
          {brand}
        </span>
        <span className="t-small text-fg-3" aria-hidden>
          ·
        </span>
        <span className="min-w-0 truncate t-small-m text-fg-2">{route}</span>
        {tempPill && (
          <Pill tone="chilled" icon={ThermometerSnowflake} className="ml-auto">
            {tempPill}
          </Pill>
        )}
      </div>

      {banner && (
        <div className="flex items-center gap-2.5 rounded-[10px] bg-accent-tint px-3 py-2.5 t-small-m text-accent-text">
          <GitCompare
            size={16}
            strokeWidth={1.8}
            className="shrink-0"
            aria-hidden
          />
          <span className="min-w-0 flex-1">{banner}</span>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2">
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 truncate t-small-m text-fg-2">
            {status}
          </p>
          <span className="t-mono text-fg-3">
            {Math.round(progress * 100)}%
          </span>
        </div>
        <Progress value={progress} height={8} tone={progressTone} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="shrink-0 t-caption text-fg-3">Dock {dock}</span>
        {action}
      </div>
    </article>
  );
}
