"use client";

import {
  Check,
  CircleAlert,
  CloudOff,
  type LucideIcon,
  Truck,
} from "lucide-react";
import { cx } from "@/components/ui";
import type { TrailStage, TrailTone } from "@/server/queries/story";

/* Vertical handoff trail for one order, used in the dispatcher's drawer. */

const NODE: Record<TrailTone, string> = {
  done: "bg-success text-fg-inverse",
  warning: "bg-warning text-fg-inverse",
  offline: "bg-offline text-fg-inverse",
  live: "bg-accent text-fg-inverse",
  pending: "border-[1.5px] border-line-strong bg-surface",
};

const ICON: Partial<Record<TrailTone, LucideIcon>> = {
  done: Check,
  warning: CircleAlert,
  offline: CloudOff,
  live: Truck,
};

export function Trail({ stages }: { stages: TrailStage[] }) {
  return (
    <ol className="flex flex-col">
      {stages.map((s, i) => {
        const last = i === stages.length - 1;
        const Icon = ICON[s.tone];
        return (
          <li key={s.label} className="flex gap-3">
            <div className="flex w-[18px] shrink-0 flex-col items-center">
              <span
                className={cx(
                  "flex size-[18px] shrink-0 items-center justify-center rounded-full",
                  NODE[s.tone],
                )}
                aria-hidden
              >
                {Icon && <Icon size={11} strokeWidth={2.4} />}
              </span>
              {!last && <span className="min-h-[18px] w-0.5 flex-1 bg-line" />}
            </div>
            <div className={cx("min-w-0 flex-1", !last && "pb-1.5")}>
              <div className="flex items-center gap-2">
                <p
                  className={cx(
                    "t-small-m",
                    s.tone === "pending" ? "text-fg-3" : "text-fg",
                  )}
                >
                  {s.label}
                  <span className="sr-only">
                    {s.tone === "pending" ? ", pending" : ", done"}
                  </span>
                </p>
                {s.at && (
                  <span className="ml-auto t-mono-sm text-fg-3">{s.at}</span>
                )}
              </div>
              {s.detail && (
                <p
                  className={cx(
                    "t-caption",
                    s.tone === "warning"
                      ? "text-warning-text"
                      : s.tone === "offline"
                        ? "text-offline-text"
                        : "text-fg-3",
                  )}
                >
                  {s.detail}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
