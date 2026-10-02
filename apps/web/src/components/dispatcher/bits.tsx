"use client";

import { Package, Search, Snowflake } from "lucide-react";
import { type ReactNode, useSyncExternalStore } from "react";
import { Dialog, PhoneSheet } from "@/components/interact";
import { cx, Pill } from "@/components/ui";

/* Small building blocks shared by the dispatcher screens. */

/* Below 1280 px the dispatcher screens switch to their phone and tablet layout. */
const WIDE = "(min-width: 1280px)";

/** Extra classes that grow a control to a 46 px tap target on a phone or tablet. */
export const tap =
  "max-xl:h-[46px] max-xl:rounded-[10px] max-xl:px-4 max-xl:t-body-m";

/** Text inputs: 16 px type on a phone so the browser doesn't zoom in. */
export const field =
  "h-8 rounded-lg border border-line-strong bg-surface px-2.5 t-small text-fg outline-none placeholder:text-fg-3 focus:border-accent max-xl:h-[46px] max-xl:rounded-[10px] max-xl:px-3 max-xl:text-[16px]";

function subscribe(cb: () => void) {
  const m = window.matchMedia(WIDE);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

/** True on a desktop-width screen. */
export function useWide() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}

/* A dialog on a desktop and a bottom sheet on a phone. */
export function Sheet({
  open,
  onClose,
  title,
  description,
  width,
  actions,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  width?: number;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const wide = useWide();
  return wide ? (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      width={width}
      actions={actions}
    >
      {children}
    </Dialog>
  ) : (
    <PhoneSheet
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      actions={actions}
    >
      {children}
    </PhoneSheet>
  );
}

export type Brand = "Fresh" | "Style" | "Tech";

const brandDot: Record<Brand, string> = {
  Fresh: "bg-fresh",
  Style: "bg-style",
  Tech: "bg-tech",
};

/* Brand line marker: a coloured dot and a label. */
export function BrandDot({
  brand,
  label,
  className,
}: {
  brand: Brand;
  label?: string;
  className?: string;
}) {
  return (
    <span className={cx("inline-flex items-center gap-1.5", className)}>
      <span
        className={cx("size-[7px] shrink-0 rounded-full", brandDot[brand])}
        aria-hidden
      />
      {label ?? brand}
    </span>
  );
}

/* Chilled or ambient load. */
export function TempPill({ temp }: { temp: "chilled" | "ambient" }) {
  return temp === "chilled" ? (
    <Pill tone="chilled" icon={Snowflake} size="sm">
      Chilled
    </Pill>
  ) : (
    <Pill tone="neutral" icon={Package} size="sm">
      Ambient
    </Pill>
  );
}

/* Segmented control, used for filters and view toggles. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
  className,
}: {
  options: { value: T; label: string; count?: string; countTone?: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <fieldset
      aria-label={label}
      className={cx(
        "flex shrink-0 items-start bg-muted p-[3px] max-xl:max-w-full max-xl:overflow-x-auto",
        size === "md" ? "rounded-[9px]" : "rounded-lg",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cx(
              "flex items-center justify-center gap-1.5 px-2.5 t-caption-m whitespace-nowrap transition-colors max-xl:flex-1 max-xl:px-2 max-xl:py-2.5 max-xl:t-small-m",
              size === "md" ? "rounded-[7px] py-1.5" : "rounded-md py-1",
              active
                ? "bg-surface text-fg shadow-card"
                : "text-fg-2 hover:text-fg",
            )}
          >
            {o.label}
            {o.count && (
              <span className={cx("t-mono-sm", o.countTone ?? "text-fg-3")}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </fieldset>
  );
}

/* Search field with a leading icon. */
export function SearchField({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <label
      className={cx(
        "flex h-8 shrink-0 items-center gap-2 rounded-lg border border-line-strong bg-surface px-2.5 focus-within:border-accent max-xl:h-[46px] max-xl:rounded-[10px] max-xl:px-3",
        className,
      )}
    >
      <Search
        size={14}
        strokeWidth={1.8}
        className="shrink-0 text-fg-3"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent t-small text-fg outline-none placeholder:text-fg-3 max-xl:text-[16px]"
      />
    </label>
  );
}
