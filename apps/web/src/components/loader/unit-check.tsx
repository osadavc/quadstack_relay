"use client";

import { Check } from "lucide-react";
import { cx } from "@/components/ui";

export type UnitStatus = "pending" | "loaded" | "flagged";

/*
 * Tick box for a load unit. Four looks: loaded (green), flagged (amber,
 * loaded short), next to load (sapphire outline) and pending. Flagged units
 * can't be unticked from here.
 */
export function UnitCheck({
  status,
  isNext,
  name,
  onToggle,
  disabled,
  size = "md",
}: {
  status: UnitStatus;
  isNext: boolean;
  name: string;
  onToggle: () => void;
  disabled?: boolean;
  size?: "md" | "lg";
}) {
  const box =
    size === "lg"
      ? "size-10 rounded-[10px] border-2"
      : "size-[26px] rounded-[7px] border-[1.5px]";
  const icon = size === "lg" ? 22 : 15;

  if (status === "flagged") {
    return (
      <span
        role="img"
        aria-label={`${name} loaded short, flagged`}
        className={cx(
          box,
          "inline-flex shrink-0 items-center justify-center border-warning bg-warning text-fg-inverse",
        )}
      >
        <Check size={icon} strokeWidth={2.4} aria-hidden />
      </span>
    );
  }

  const loaded = status === "loaded";
  return (
    // biome-ignore lint/a11y/useSemanticElements: a styled button keeps the large tap target on the dock screen and phone
    <button
      type="button"
      role="checkbox"
      aria-checked={loaded}
      aria-label={`${name} loaded`}
      onClick={onToggle}
      disabled={disabled}
      className={cx(
        box,
        "inline-flex shrink-0 items-center justify-center transition-colors disabled:cursor-default",
        loaded
          ? "border-success bg-success text-fg-inverse"
          : isNext
            ? "border-accent bg-surface hover:bg-accent-tint"
            : "border-line-strong bg-surface hover:border-fg-3",
      )}
    >
      {loaded && <Check size={icon} strokeWidth={2.4} aria-hidden />}
    </button>
  );
}
