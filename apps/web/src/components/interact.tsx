"use client";

/*
 * Small interaction primitives so every control responds: menus and selects,
 * dialogs, phone bottom sheets and toasts. Popovers render in a portal with
 * fixed positioning so scrolling panels never clip them.
 */

import type { LucideIcon } from "lucide-react";
import { Check, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { cx } from "./ui";

/* ================= Toasts ================= */

type ToastTone = "default" | "success" | "warning";
type ToastItem = { id: number; text: string; detail?: string; tone: ToastTone };

const useToasts = create<{
  items: ToastItem[];
  push: (t: Omit<ToastItem, "id">) => void;
  remove: (id: number) => void;
}>((set, get) => ({
  items: [],
  push: (t) => {
    const id = Date.now() + Math.random();
    set({ items: [...get().items.slice(-2), { ...t, id }] });
    setTimeout(() => get().remove(id), 3200);
  },
  remove: (id) => set({ items: get().items.filter((i) => i.id !== id) }),
}));

/** Show a short confirmation, e.g. toast("Exported 85 orders", { tone: "success" }). */
export function toast(
  text: string,
  opts: { detail?: string; tone?: ToastTone } = {},
) {
  useToasts
    .getState()
    .push({ text, detail: opts.detail, tone: opts.tone ?? "default" });
}

const TOAST_ICON: Record<ToastTone, LucideIcon> = {
  default: Info,
  success: CircleCheck,
  warning: TriangleAlert,
};

export function Toaster() {
  const items = useToasts((s) => s.items);
  const remove = useToasts((s) => s.remove);
  return (
    <div
      aria-live="polite"
      data-proto
      className="pointer-events-none fixed inset-x-0 top-4 z-[70] flex flex-col items-center gap-2 px-4"
    >
      {items.map((t) => {
        const Icon = TOAST_ICON[t.tone];
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex max-w-[420px] items-start gap-2.5 rounded-xl bg-inverse py-2.5 pr-2.5 pl-3.5 text-fg-inverse shadow-modal"
          >
            <Icon
              size={16}
              strokeWidth={1.8}
              className={cx(
                "mt-0.5 shrink-0",
                t.tone === "success" && "text-[#8fd6ac]",
                t.tone === "warning" && "text-warning",
              )}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="t-small-m">{t.text}</p>
              {t.detail && (
                <p className="t-caption text-fg-inverse/65">{t.detail}</p>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => remove(t.id)}
              className="ml-1 rounded p-0.5 text-fg-inverse/50 hover:text-fg-inverse"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ================= Popover positioning ================= */

function useAnchoredPosition(
  open: boolean,
  anchor: React.RefObject<HTMLElement | null>,
  align: "start" | "end",
  width: number,
) {
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    up: boolean;
  } | null>(null);
  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = align === "end" ? r.right - width : r.left;
      left = Math.max(8, Math.min(left, vw - width - 8));
      const up = r.bottom + 260 > vh && r.top > 260;
      setPos({ top: up ? r.top - 6 : r.bottom + 6, left, up });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchor, align, width]);
  return pos;
}

function useDismiss(
  open: boolean,
  close: () => void,
  refs: React.RefObject<HTMLElement | null>[],
) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (refs.some((r) => r.current?.contains(t))) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, refs]);
}

/* ================= Menu / select ================= */

export type MenuItem =
  | {
      label: string;
      detail?: string;
      icon?: LucideIcon;
      checked?: boolean;
      danger?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    }
  | { divider: true }
  | { heading: string };

type TriggerProps = {
  onClick: () => void;
  "aria-expanded": boolean;
  "aria-haspopup": "menu";
  "aria-controls": string;
};

/**
 * A dropdown. Pass a render function for the trigger so any button style works:
 * <Menu items={...} trigger={(p) => <Button {...p} iconRight={ChevronDown}>District</Button>} />
 */
export function Menu({
  trigger,
  items,
  align = "start",
  width = 224,
  className,
}: {
  trigger: (p: TriggerProps) => ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
  width?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrap = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, [wrap, pop]);
  const pos = useAnchoredPosition(open, wrap, align, width);
  const selectable = items
    .map((it, i) => ("onSelect" in it && !it.disabled ? i : -1))
    .filter((i) => i >= 0);

  useEffect(() => {
    if (!open) return;
    setActive(-1);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => {
          const k = selectable.indexOf(a);
          const n = e.key === "ArrowDown" ? k + 1 : k - 1;
          return selectable[(n + selectable.length) % selectable.length] ?? -1;
        });
      }
      if (e.key === "Enter") {
        setActive((a) => {
          const it = items[a];
          if (it && "onSelect" in it) {
            it.onSelect();
            setOpen(false);
          }
          return a;
        });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, items, selectable]);

  return (
    <span ref={wrap} className={cx("relative inline-flex", className)}>
      {trigger({
        onClick: () => setOpen((o) => !o),
        "aria-expanded": open,
        "aria-haspopup": "menu",
        "aria-controls": id,
      })}
      {open &&
        pos &&
        createPortal(
          <div
            ref={pop}
            id={id}
            role="menu"
            className="fixed z-[60] max-h-[320px] overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-modal scroll-thin"
            style={{
              top: pos.up ? undefined : pos.top,
              bottom: pos.up ? window.innerHeight - pos.top : undefined,
              left: pos.left,
              width,
            }}
          >
            {items.map((it, i) => {
              if ("divider" in it)
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: dividers have no identity and the list is static
                  <div key={`d${i}`} className="my-1 h-px bg-line" />
                );
              if ("heading" in it)
                return (
                  <p
                    key={`h${it.heading}`}
                    className="px-2.5 pt-2 pb-1 t-caption-m text-fg-3"
                  >
                    {it.heading}
                  </p>
                );
              const Icon = it.icon;
              return (
                <button
                  key={`${it.label}-${i}`}
                  type="button"
                  role="menuitem"
                  disabled={it.disabled}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => {
                    it.onSelect();
                    setOpen(false);
                  }}
                  className={cx(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left t-small-m transition-colors disabled:opacity-45 max-xl:py-3",
                    active === i && "bg-subtle",
                    it.danger ? "text-danger-text" : "text-fg",
                  )}
                >
                  {Icon && (
                    <Icon
                      size={15}
                      strokeWidth={1.7}
                      className="shrink-0 text-fg-2"
                      aria-hidden
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{it.label}</span>
                    {it.detail && (
                      <span className="block truncate t-caption text-fg-3">
                        {it.detail}
                      </span>
                    )}
                  </span>
                  {it.checked && (
                    <Check
                      size={15}
                      strokeWidth={2}
                      className="shrink-0 text-accent-text"
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </span>
  );
}

/** Single-choice dropdown built on Menu. */
export function SelectMenu<T extends string>({
  value,
  options,
  onChange,
  trigger,
  heading,
  align,
  width,
}: {
  value: T;
  options: { value: T; label: string; detail?: string }[];
  onChange: (v: T) => void;
  trigger: (p: TriggerProps & { label: string }) => ReactNode;
  heading?: string;
  align?: "start" | "end";
  width?: number;
}) {
  const current = options.find((o) => o.value === value)?.label ?? "";
  return (
    <Menu
      align={align}
      width={width}
      items={[
        ...(heading ? [{ heading }] : []),
        ...options.map((o) => ({
          label: o.label,
          detail: o.detail,
          checked: o.value === value,
          onSelect: () => onChange(o.value),
        })),
      ]}
      trigger={(p) => trigger({ ...p, label: current })}
    />
  );
}

/* ================= Dialog (desktop) ================= */

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  actions,
  width = 440,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  actions?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-inverse/35"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-2xl bg-surface shadow-modal"
        style={{ maxWidth: width }}
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="t-heading">{title}</p>
            {description && (
              <p className="mt-0.5 t-small text-fg-2">{description}</p>
            )}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mr-1 rounded-lg p-1.5 text-fg-3 hover:bg-subtle hover:text-fg max-xl:p-2.5"
          >
            <X size={18} />
          </button>
        </div>
        {children && (
          <div className="scroll-thin overflow-y-auto px-5 py-4">
            {children}
          </div>
        )}
        {actions && (
          <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
            {actions}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ================= Sheet (phone) =================
 * Renders into the phone frame (#phone-portal from MobileShell) so it stays
 * inside the 390 px screen on desktop and covers the viewport on a phone.
 */

export function PhoneSheet({
  open,
  onClose,
  title,
  description,
  children,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHost(document.getElementById("phone-portal") ?? document.body);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open || !host) return null;
  const inFrame = host.id === "phone-portal";
  return createPortal(
    <div
      className={cx(
        inFrame ? "absolute" : "fixed",
        "pointer-events-auto inset-0 z-50 flex flex-col justify-end",
      )}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-inverse/35"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[85%] flex-col rounded-t-3xl bg-surface shadow-modal"
      >
        <div
          className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line-strong"
          aria-hidden
        />
        <div className="px-5 pt-3 pb-2">
          <p className="f-heading">{title}</p>
          {description && (
            <p className="mt-1 t-body text-fg-2">{description}</p>
          )}
        </div>
        {children && (
          <div className="scroll-thin overflow-y-auto px-5 pb-2">
            {children}
          </div>
        )}
        {actions && (
          <div className="flex flex-col gap-2 px-4 pt-2 pb-4">{actions}</div>
        )}
      </div>
    </div>,
    host,
  );
}

/* ================= Helpers ================= */

/** Real file download from rows of data. */
export function downloadCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Toggle helper for simple open/close state. */
export function useDisclosure(initial = false) {
  const [open, setOpen] = useState(initial);
  return {
    open,
    onOpen: useCallback(() => setOpen(true), []),
    onClose: useCallback(() => setOpen(false), []),
    toggle: useCallback(() => setOpen((o) => !o), []),
  };
}

/* ================= Call panel ================= */

export type Contact = { name: string; role: string; phone: string | null };

const dial = (phone: string) => `tel:${phone.replace(/\s/g, "")}`;

function CallBody({ c }: { c: Contact }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-subtle px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="t-body-m">{c.name}</p>
        <p className="t-caption text-fg-3">{c.role}</p>
      </div>
      <span className="t-mono text-fg-2">{c.phone ?? "No number on file"}</span>
    </div>
  );
}

const copy = (phone: string) => {
  navigator.clipboard?.writeText(phone).catch(() => {});
  toast("Number copied", { detail: phone, tone: "success" });
};

/** Desktop: a dialog with the number, copy and call. */
export function CallDialog({
  open,
  onClose,
  contact,
}: {
  open: boolean;
  onClose: () => void;
  contact: Contact;
}) {
  const phone = contact.phone;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Call ${contact.name.split(" ")[0]}`}
      width={400}
      actions={
        phone ? (
          <>
            <button
              type="button"
              onClick={() => copy(phone)}
              className="h-8 rounded-lg border border-line-strong bg-surface px-3 t-small-m shadow-card hover:bg-subtle"
            >
              Copy number
            </button>
            <a
              href={dial(phone)}
              onClick={onClose}
              className="flex h-8 items-center rounded-lg bg-inverse px-3 t-small-m text-fg-inverse hover:bg-[#35322e]"
            >
              Call
            </a>
          </>
        ) : undefined
      }
    >
      <CallBody c={contact} />
    </Dialog>
  );
}

/** Phone: a bottom sheet with call and text message. */
export function CallSheet({
  open,
  onClose,
  contact,
}: {
  open: boolean;
  onClose: () => void;
  contact: Contact;
}) {
  const phone = contact.phone;
  return (
    <PhoneSheet
      open={open}
      onClose={onClose}
      title={`Call ${contact.name.split(" ")[0]}`}
      actions={
        phone ? (
          <>
            <a
              href={dial(phone)}
              onClick={onClose}
              className="flex h-[46px] items-center justify-center rounded-xl bg-inverse f-label text-fg-inverse"
            >
              Call {phone}
            </a>
            <a
              href={`sms:${phone.replace(/\s/g, "")}`}
              onClick={onClose}
              className="flex h-[46px] items-center justify-center rounded-xl border border-line-strong bg-surface f-label"
            >
              Send a text instead
            </a>
          </>
        ) : undefined
      }
    >
      <CallBody c={contact} />
    </PhoneSheet>
  );
}
