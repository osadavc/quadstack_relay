"use client";

import { requiresRefrigeration, TEMP_LABEL } from "@relay/domain";

import { Minus, Package, Plus, Snowflake } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { cx, Pill } from "@/components/ui";

/* Temperature tag used on order lines, notices and the delivery record. */
export function TempTag({ temp }: { temp: string }) {
  return requiresRefrigeration(temp) ? (
    <Pill tone="chilled" icon={Snowflake} size="sm">
      {TEMP_LABEL[temp]}
    </Pill>
  ) : (
    <Pill tone="neutral" icon={Package} size="sm">
      Ambient
    </Pill>
  );
}

/*
 * Segmented quantity control for the order form. The number can be typed as
 * well as stepped, as store managers often know the count already.
 */
export function QtyStepper({
  value,
  onChange,
  label,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  disabled?: boolean;
}) {
  const btn =
    "inline-flex size-9 items-center justify-center text-fg transition-colors hover:bg-subtle disabled:text-fg-3 disabled:hover:bg-transparent max-md:size-11";
  return (
    <div className="inline-flex shrink-0 items-center overflow-hidden rounded-[10px] border border-line-strong bg-surface">
      <button
        type="button"
        aria-label={`Fewer ${label}`}
        disabled={disabled || value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
        className={btn}
      >
        <Minus size={16} strokeWidth={1.8} aria-hidden />
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={`${label} units`}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
          onChange(digits ? Number(digits) : 0);
        }}
        onFocus={(e) => e.target.select()}
        className="h-9 w-[52px] border-x border-line bg-transparent text-center t-mono text-fg outline-none focus-visible:bg-accent-tint disabled:text-fg-2 max-md:h-11 max-md:w-12"
      />
      <button
        type="button"
        aria-label={`More ${label}`}
        disabled={disabled}
        onClick={() => onChange(value + 1)}
        className={btn}
      >
        <Plus size={16} strokeWidth={1.8} aria-hidden />
      </button>
    </div>
  );
}

/*
 * The phone-first store screens (notice, on the way, confirm): a single
 * column, centred on a desktop, with the main action pinned to the bottom
 * of a phone screen.
 */
export function PhoneColumn({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    // On a phone the column fills the screen below the store header, so the
    // action sits at the bottom even when the content is short.
    <div className="mx-auto flex w-full max-w-[460px] flex-col max-md:min-h-[calc(100dvh-102px)] md:px-0 md:py-8">
      <div className="flex flex-1 flex-col gap-3.5 px-5 py-4 md:px-0 md:py-0 [&>*]:shrink-0">
        {children}
      </div>
      {footer && (
        <div
          className={cx(
            "sticky bottom-0 flex flex-col gap-2.5 border-t border-line bg-canvas/95 px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] backdrop-blur-sm",
            "md:static md:mt-4 md:border-0 md:bg-transparent md:px-0 md:pt-0 md:pb-0 md:backdrop-blur-none",
          )}
        >
          {footer}
        </div>
      )}
    </div>
  );
}

/** True on phone-width screens; sheets there, dialogs on a desktop. */
export function useIsPhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 767px)");
    const sync = () => setPhone(m.matches);
    sync();
    m.addEventListener("change", sync);
    return () => m.removeEventListener("change", sync);
  }, []);
  return phone;
}
