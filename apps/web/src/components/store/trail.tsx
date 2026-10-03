import {
  Check,
  CircleAlert,
  CloudOff,
  type LucideIcon,
  Truck,
} from "lucide-react";
import { cx } from "@/components/ui";
import type { TrailStage, TrailTone } from "@/server/queries/story";

/* Vertical handoff trail for one order, as the store sees it. */

const NODE: Record<TrailTone, string> = {
  done: "bg-success text-fg-inverse",
  warning: "bg-warning text-fg-inverse",
  offline: "bg-offline text-fg-inverse",
  live: "bg-accent text-fg-inverse",
  pending: "border-[1.5px] border-line-strong bg-surface",
};

/* The link below a node takes the colour of the stage it leads to. */
const LINK: Record<TrailTone, string> = {
  done: "bg-success",
  warning: "bg-success",
  offline: "bg-offline",
  live: "bg-accent",
  pending: "bg-line",
};

const ICON: Partial<Record<TrailTone, LucideIcon>> = {
  done: Check,
  warning: CircleAlert,
  offline: CloudOff,
  live: Truck,
};

const TIME: Record<TrailTone, string> = {
  done: "text-fg-3",
  warning: "text-warning-text",
  offline: "text-offline-text",
  live: "text-accent-text",
  pending: "text-fg-3",
};

export function HandoffTrail({ stages }: { stages: TrailStage[] }) {
  return (
    <ol className="flex flex-col">
      {stages.map((s, i) => {
        const Icon = ICON[s.tone];
        const next = stages[i + 1];
        return (
          <li key={s.label} className="flex gap-3">
            <div className="flex w-[18px] shrink-0 flex-col items-center">
              <span
                className={cx(
                  "inline-flex size-[18px] shrink-0 items-center justify-center rounded-full",
                  NODE[s.tone],
                )}
                aria-hidden
              >
                {Icon && <Icon size={11} strokeWidth={2.4} />}
              </span>
              {next && (
                <span
                  className={cx("min-h-[26px] w-0.5 flex-1", LINK[next.tone])}
                  aria-hidden
                />
              )}
            </div>
            <div
              className={cx(
                "flex min-w-0 flex-1 flex-col gap-px",
                next && "pb-2.5",
              )}
            >
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
                  <span className={cx("ml-auto t-mono-sm", TIME[s.tone])}>
                    {s.at}
                  </span>
                )}
              </div>
              {s.detail && (
                <p
                  className={cx(
                    "t-caption",
                    s.tone === "warning" ? "text-warning-text" : "text-fg-3",
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
