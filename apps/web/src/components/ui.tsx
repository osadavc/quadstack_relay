"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cx } from "@/lib/cx";

export { cx };

/* ---------- Button ---------- */

type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "accent"
  | "danger"
  | "onDark";
type ButtonSize = "sm" | "md" | "lg" | "xl";

const buttonVariant: Record<ButtonVariant, string> = {
  primary:
    "bg-inverse text-fg-inverse hover:bg-[#35322e] disabled:bg-muted disabled:text-fg-3",
  secondary:
    "bg-surface text-fg border border-line-strong shadow-card hover:bg-subtle disabled:text-fg-3 disabled:bg-subtle",
  ghost:
    "bg-transparent text-fg-2 hover:bg-subtle hover:text-fg disabled:text-fg-3",
  accent:
    "bg-accent text-fg-inverse hover:bg-accent-text disabled:bg-muted disabled:text-fg-3",
  danger:
    "bg-danger text-fg-inverse hover:bg-danger-text disabled:bg-muted disabled:text-fg-3",
  onDark: "bg-white/12 text-fg-inverse hover:bg-white/20",
};

const buttonSize: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 rounded-[7px] gap-1.5 t-small-m",
  md: "h-8 px-3 rounded-lg gap-1.5 t-small-m",
  lg: "h-10 px-4 rounded-[10px] gap-2 t-body-m",
  xl: "h-[46px] px-4 rounded-xl gap-2 f-label",
};

const iconSize: Record<ButtonSize, number> = { sm: 14, md: 15, lg: 16, xl: 18 };

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  full?: boolean;
  href?: string;
};

export function Button({
  variant = "secondary",
  size = "md",
  icon: Icon,
  iconRight: IconRight,
  full,
  href,
  className,
  children,
  ...rest
}: ButtonProps) {
  const cls = cx(
    "inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-colors select-none",
    buttonVariant[variant],
    buttonSize[size],
    full && "w-full",
    className,
  );
  const inner = (
    <>
      {Icon && <Icon size={iconSize[size]} strokeWidth={1.8} aria-hidden />}
      {children}
      {IconRight && (
        <IconRight size={iconSize[size]} strokeWidth={1.8} aria-hidden />
      )}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} {...rest}>
      {inner}
    </button>
  );
}

/* ---------- Pill ---------- */

export type Tone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "offline"
  | "chilled"
  | "fresh"
  | "inverse";

const toneClass: Record<Tone, string> = {
  neutral: "bg-subtle text-fg-2",
  accent: "bg-accent-tint text-accent-text",
  success: "bg-success-tint text-success-text",
  warning: "bg-warning-tint text-warning-text",
  danger: "bg-danger-tint text-danger-text",
  offline: "bg-offline-tint text-offline-text",
  chilled: "bg-chilled-tint text-chilled-text",
  fresh: "bg-fresh-tint text-success-text",
  inverse: "bg-inverse text-fg-inverse",
};

export function Pill({
  tone = "neutral",
  icon: Icon,
  children,
  className,
  size = "md",
}: {
  tone?: Tone;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-1 rounded-full whitespace-nowrap",
        size === "md"
          ? "h-[22px] pl-[7px] pr-2.5 t-caption-m"
          : "h-5 px-2 t-caption-m",
        !Icon && "pl-2.5",
        toneClass[tone],
        className,
      )}
    >
      {Icon && <Icon size={13} strokeWidth={1.8} aria-hidden />}
      {children}
    </span>
  );
}

/* Small status dot + label, used for sync and online states. */
export function Dot({
  tone = "success",
  pulse,
}: {
  tone?: "success" | "warning" | "danger" | "offline" | "accent";
  pulse?: boolean;
}) {
  const c = {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    offline: "bg-offline",
    accent: "bg-accent",
  }[tone];
  return (
    <span
      className={cx(
        "inline-block size-2 rounded-full",
        c,
        pulse && "animate-relay-pulse",
      )}
      aria-hidden
    />
  );
}

/* ---------- Card ---------- */

export function Card({
  children,
  className,
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  return (
    <As
      className={cx(
        "rounded-xl border border-line bg-surface shadow-card",
        className,
      )}
    >
      {children}
    </As>
  );
}

/* ---------- Avatar ---------- */

const avatarTone = {
  accent: "bg-accent-tint text-accent-text",
  warning: "bg-warning text-fg-inverse",
  success: "bg-success text-fg-inverse",
  inverse: "bg-inverse text-fg-inverse",
  solidAccent: "bg-accent text-fg-inverse",
  neutral: "bg-muted text-fg-2",
} as const;

export function Avatar({
  initials,
  size = 28,
  tone = "accent",
}: {
  initials: string;
  size?: number;
  tone?: keyof typeof avatarTone;
}) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-medium",
        avatarTone[tone],
      )}
      style={{ width: size, height: size, fontSize: size >= 36 ? 14 : 12 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/* ---------- Progress ---------- */

export function Progress({
  value,
  tone = "inverse",
  height = 6,
  className,
}: {
  value: number; // 0..1
  tone?:
    | "inverse"
    | "success"
    | "warning"
    | "danger"
    | "accent"
    | "chilled"
    | "fresh";
  height?: number;
  className?: string;
}) {
  const c = {
    inverse: "bg-inverse",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    accent: "bg-accent",
    chilled: "bg-chilled",
    fresh: "bg-fresh",
  }[tone];
  return (
    <div
      className={cx("w-full overflow-hidden rounded-full bg-muted", className)}
      style={{ height }}
    >
      <div
        className={cx("h-full rounded-full transition-[width] duration-300", c)}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  );
}

/* ---------- Icon tile (used sparingly, for vehicle type etc.) ---------- */

export function IconTile({
  icon: Icon,
  tone = "neutral",
  size = 28,
}: {
  icon: LucideIcon;
  tone?: "neutral" | "chilled" | "accent" | "warning" | "success" | "danger";
  size?: number;
}) {
  const c = {
    neutral: "bg-subtle text-fg-2",
    chilled: "bg-chilled-tint text-chilled-text",
    accent: "bg-accent-tint text-accent-text",
    warning: "bg-warning-tint text-warning-text",
    success: "bg-success-tint text-success-text",
    danger: "bg-danger-tint text-danger-text",
  }[tone];
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-lg",
        c,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Icon size={Math.round(size * 0.54)} strokeWidth={1.7} />
    </span>
  );
}

/* ---------- Stepper (+ / − counts) ---------- */

export function Stepper({
  value,
  onChange,
  size = "md",
  min = 0,
  max = Number.POSITIVE_INFINITY,
}: {
  value: number;
  onChange: (n: number) => void;
  size?: "md" | "lg";
  min?: number;
  max?: number;
}) {
  const b = size === "lg" ? "size-10 rounded-[10px]" : "size-8 rounded-lg";
  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        aria-label="Decrease"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={cx(
          b,
          "inline-flex items-center justify-center bg-subtle text-fg hover:bg-muted disabled:text-fg-3 disabled:opacity-50",
        )}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path
            d="M3 7h8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <span
        className={cx(
          "min-w-8 text-center tabular-nums",
          size === "lg" ? "f-heading" : "t-body-m",
        )}
      >
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className={cx(
          b,
          "inline-flex items-center justify-center bg-subtle text-fg hover:bg-muted disabled:text-fg-3 disabled:opacity-50",
        )}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path
            d="M3 7h8M7 3v8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

/* ---------- Checkbox (large tap target on dock and phone) ---------- */

export function CheckBox({
  checked,
  onChange,
  size = 22,
  label,
}: {
  checked: boolean;
  onChange?: () => void;
  size?: number;
  label: string;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a styled button keeps the large tap target on the dock screen
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-[7px] border-[1.5px] transition-colors",
        checked
          ? "border-success bg-success text-fg-inverse"
          : "border-line-strong bg-surface hover:border-fg-3",
      )}
      style={{ width: size, height: size }}
    >
      {checked && (
        <svg
          width={size * 0.6}
          height={size * 0.6}
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <path
            d="M3.5 8.5l3 3 6-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

/* ---------- Section label (sentence case, never all caps) ---------- */

export function Label({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={cx("t-caption-m text-fg-3", className)}>{children}</p>;
}
