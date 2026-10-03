"use client";

import {
  ArrowLeftRight,
  Bell,
  Camera,
  Check,
  ChevronDown,
  Flag,
  type LucideIcon,
  MessageSquare,
  PackageMinus,
  PackageX,
  Thermometer,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { flagAction } from "@/app/actions/dock";
import { initialsOf } from "@/components/account-menu";
import { toast } from "@/components/interact";
import { Avatar, Button, cx, IconTile, Label, Stepper } from "@/components/ui";
import type { LoadSheetData } from "@/server/queries/dock";
import { plural } from "./format";
import { photoToDataUrl } from "./photo";

/*
 * L3: report a damaged, missing, substituted or warm unit before the truck
 * leaves. A dialog on the dock screen, a bottom sheet on a phone. Saving
 * notifies the driver, the store and dispatch and raises a credit.
 */

type Reason = "damaged" | "missing" | "wrong" | "warm";

const REASONS: {
  key: Reason;
  label: string;
  hint: string;
  icon: LucideIcon;
  noun: [string, string];
}[] = [
  {
    key: "damaged",
    label: "Damaged",
    hint: "crushed, leaking",
    icon: PackageX,
    noun: ["damaged unit", "damaged units"],
  },
  {
    key: "missing",
    label: "Missing",
    hint: "not in stock",
    icon: PackageMinus,
    noun: ["missing unit", "missing units"],
  },
  {
    key: "wrong",
    label: "Wrong item",
    hint: "substituted",
    icon: ArrowLeftRight,
    noun: ["substituted unit", "substituted units"],
  },
  {
    key: "warm",
    label: "Too warm",
    hint: "above 5 °C",
    icon: Thermometer,
    noun: ["warm unit", "warm units"],
  },
];

type Unit = LoadSheetData["sections"][number]["units"][number] & {
  outletId: string;
};

function useDraft(sheet: LoadSheetData, initialUnitId: string | null) {
  const units: Unit[] = sheet.sections.flatMap((s) =>
    s.units.map((u) => ({ ...u, outletId: s.outletId })),
  );
  const fallback = units.find((u) => u.status === "pending") ?? units[0];
  const [unitId, setUnitId] = useState(initialUnitId ?? fallback?.id ?? "");
  const unit = units.find((u) => u.id === unitId) ?? fallback;
  const existing = unit?.shortfall ?? null;
  const [reason, setReason] = useState<Reason>(
    (existing?.reason as Reason) ?? "damaged",
  );
  const [count, setCountRaw] = useState(existing?.cases ?? 1);
  const [note, setNote] = useState(existing?.note ?? "");
  const [photo, setPhoto] = useState<string | null>(null);

  // A different unit starts a fresh report, or reopens its saved one.
  const selectUnit = (id: string) => {
    const next = units.find((u) => u.id === id);
    setUnitId(id);
    if (!next) return;
    setReason((next.shortfall?.reason as Reason) ?? "damaged");
    setCountRaw(next.shortfall?.cases ?? 1);
    setNote(next.shortfall?.note ?? "");
    setPhoto(null);
  };

  const meta = REASONS.find((r) => r.key === reason) ?? REASONS[0];
  const store = unit ? sheet.contacts.stores[unit.outletId] : undefined;
  return {
    units,
    unit,
    unitId,
    setUnitId: selectUnit,
    existing,
    reason,
    setReason,
    count,
    setCount: (n: number) =>
      setCountRaw(Math.min(unit?.cases ?? 1, Math.max(1, n))),
    note,
    setNote,
    photo,
    setPhoto,
    cta: `Record ${plural(count, meta.noun[0], meta.noun[1])}`,
    told: [
      {
        name: sheet.contacts.driver,
        role: `Driver · ${sheet.vehicleId}`,
        tone: "solidAccent" as const,
      },
      {
        name: store?.name ?? "Store",
        role: `${unit?.outletId ?? ""} store`,
        tone: "success" as const,
      },
      {
        name: sheet.contacts.dispatcher,
        role: "Dispatch",
        tone: "inverse" as const,
      },
    ],
  };
}

type Draft = ReturnType<typeof useDraft>;

function ReasonTiles({
  value,
  onChange,
  compact,
}: {
  value: Reason;
  onChange: (r: Reason) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cx(
        "grid",
        compact ? "grid-cols-2 gap-2" : "grid-cols-4 gap-3",
      )}
    >
      {REASONS.map((r) => {
        const on = r.key === value;
        return (
          <button
            key={r.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(r.key)}
            className={cx(
              "flex flex-col items-start rounded-[14px] border text-left transition-colors",
              compact ? "gap-1 p-3" : "h-[104px] gap-2 p-4",
              on
                ? "border-warning bg-warning-tint ring-1 ring-warning"
                : "border-line bg-surface hover:bg-subtle",
            )}
          >
            <span className="flex w-full items-center">
              <r.icon
                size={compact ? 20 : 24}
                strokeWidth={1.7}
                className={on ? "text-warning-text" : "text-fg-2"}
                aria-hidden
              />
              {on && (
                <span className="ml-auto inline-flex size-6 items-center justify-center rounded-full bg-warning text-fg-inverse">
                  <Check size={14} strokeWidth={2.4} aria-hidden />
                </span>
              )}
            </span>
            <span>
              <span
                className={cx(
                  "block f-label",
                  on ? "text-warning-text" : "text-fg",
                )}
              >
                {r.label}
              </span>
              <span className="block t-small text-fg-3">{r.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PhotoTile({ draft, compact }: { draft: Draft; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setReading(true);
          try {
            draft.setPhoto(await photoToDataUrl(file));
          } catch (err) {
            toast(
              err instanceof Error ? err.message : "Couldn’t read that photo",
              { tone: "warning" },
            );
          } finally {
            setReading(false);
          }
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={cx(
          "flex w-full items-center gap-3 rounded-[14px] border border-line p-3 text-left transition-colors hover:bg-subtle",
          compact ? "h-[64px]" : "h-[88px]",
        )}
      >
        <span
          className={cx(
            "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] text-fg-3",
            compact ? "size-10" : "size-16",
            draft.photo
              ? "bg-muted"
              : "border border-dashed border-line-strong",
          )}
        >
          {draft.photo ? (
            // biome-ignore lint/performance/noImgElement: a local data URL preview, not a remote image
            <img src={draft.photo} alt="" className="size-full object-cover" />
          ) : (
            <Camera size={compact ? 18 : 22} strokeWidth={1.6} aria-hidden />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block f-label">
            {reading
              ? "Reading photo"
              : draft.photo
                ? "Photo added"
                : "Add a photo"}
          </span>
          <span className="block t-small text-fg-3">
            {draft.photo
              ? "Tap to retake"
              : draft.existing?.photo
                ? "Photo on record · tap to replace"
                : "Optional"}
          </span>
        </span>
        <Camera
          size={22}
          strokeWidth={1.6}
          className="shrink-0 text-fg-2"
          aria-hidden
        />
      </button>
    </>
  );
}

function UnitPicker({ draft, compact }: { draft: Draft; compact?: boolean }) {
  const unit = draft.unit;
  if (!unit) return null;
  return (
    <div
      className={cx(
        "flex items-center rounded-[14px] border border-line",
        compact ? "gap-3 py-2.5 pr-2.5 pl-3.5" : "gap-3.5 py-3 pr-3 pl-4",
      )}
    >
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">Unit</span>
        <select
          value={draft.unitId}
          onChange={(e) => draft.setUnitId(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {draft.units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.id} · {u.name} · {u.cases} units
            </option>
          ))}
        </select>
        <span className="flex items-center gap-1.5">
          <span className={cx("truncate", compact ? "f-label" : "f-body-m")}>
            {unit.name}
          </span>
          <ChevronDown size={15} className="shrink-0 text-fg-3" aria-hidden />
        </span>
        <span className="block truncate t-small text-fg-3">
          {unit.id} · {unit.cases} units
        </span>
      </label>
      <Stepper
        value={draft.count}
        onChange={draft.setCount}
        size="lg"
        min={1}
        max={unit.cases}
      />
    </div>
  );
}

function useSubmit(sheet: LoadSheetData, draft: Draft, onDone: () => void) {
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      if (!draft.unit) return;
      const meta = REASONS.find((r) => r.key === draft.reason);
      const res = await flagAction(sheet.id, {
        unitId: draft.unit.id,
        reason: draft.reason,
        cases: draft.count,
        note: draft.note.trim() || undefined,
        photo: draft.photo,
      });
      if (!res.ok) return toast(res.error, { tone: "warning" });
      toast(
        `Recorded ${plural(draft.count, meta?.noun[0] ?? "unit", meta?.noun[1])}`,
        {
          detail: `${listNames(draft.told.map((t) => t.name))} notified`,
          tone: "success",
        },
      );
      onDone();
    });
  return { pending, submit };
}

/** "Nimal, Yoshitha and Gayan" */
const listNames = (names: string[]) => {
  const first = names.map((n) => n.split(" ")[0]);
  return first.length > 1
    ? `${first.slice(0, -1).join(", ")} and ${first.at(-1)}`
    : (first[0] ?? "");
};

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

/* Dock screen. */
export function ShortfallDialog({
  sheet,
  unitId,
  onClose,
}: {
  sheet: LoadSheetData;
  unitId: string | null;
  onClose: () => void;
}) {
  const draft = useDraft(sheet, unitId);
  const { pending, submit } = useSubmit(sheet, draft, onClose);
  const ref = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  useEffect(() => ref.current?.focus(), []);
  const unit = draft.unit;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse/35 p-6">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortfall-title"
        tabIndex={-1}
        style={{ outline: "none" }}
        className="flex max-h-full w-full max-w-[680px] flex-col overflow-hidden rounded-[20px] bg-surface shadow-modal"
      >
        <header className="flex items-center gap-3 border-b border-line px-6 py-5">
          <IconTile icon={Flag} tone="warning" size={44} />
          <div className="min-w-0 flex-1">
            <h2 id="shortfall-title" className="f-heading">
              Report a problem before departure
            </h2>
            <p className="truncate t-body text-fg-3">
              {unit
                ? `${unit.id} · ${unit.name} · order ${unit.orderId} · ${unit.outletId}`
                : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-line text-fg transition-colors hover:bg-subtle"
          >
            <X size={18} strokeWidth={1.8} aria-hidden />
          </button>
        </header>

        <div className="scroll-thin flex min-h-0 flex-col gap-5 overflow-y-auto px-6 py-5">
          <section className="flex flex-col gap-2.5">
            <Label>What’s wrong?</Label>
            <ReasonTiles value={draft.reason} onChange={draft.setReason} />
          </section>
          <section className="flex flex-col gap-2.5">
            <Label>Which item, how many?</Label>
            <UnitPicker draft={draft} />
            {draft.existing && (
              <p className="t-small text-fg-3">
                Recorded at {draft.existing.at}. Saving updates it.
              </p>
            )}
          </section>
          <div className="grid grid-cols-2 gap-3">
            <PhotoTile draft={draft} />
            <label className="flex h-[88px] cursor-text items-center gap-3 rounded-[14px] border border-line px-4 py-3 transition-colors focus-within:border-accent focus-within:ring-1 focus-within:ring-accent">
              <MessageSquare
                size={22}
                strokeWidth={1.6}
                className="shrink-0 text-fg-3"
                aria-hidden
              />
              <span className="sr-only">Note</span>
              <input
                value={draft.note}
                onChange={(e) => draft.setNote(e.target.value)}
                placeholder="Add a note (optional)"
                style={{ outline: "none" }}
                className="min-w-0 flex-1 bg-transparent f-body-m placeholder:text-fg-3"
              />
            </label>
          </div>
          <section className="flex flex-col gap-2.5 rounded-[14px] bg-subtle p-4">
            <p className="flex items-center gap-2 f-label text-fg-2">
              <Bell size={16} strokeWidth={1.7} aria-hidden />
              Notified when you save
            </p>
            <ul className="flex flex-wrap gap-2">
              {draft.told.map((p) => (
                <li
                  key={p.role}
                  className="flex items-center gap-2 rounded-full bg-surface py-1 pr-3 pl-1"
                >
                  <Avatar
                    initials={initialsOf(p.name)}
                    size={28}
                    tone={p.tone}
                  />
                  <span>
                    <span className="block t-small-m">
                      {p.name.split(" ")[0]}
                    </span>
                    <span className="block t-caption text-fg-3">{p.role}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <footer className="flex gap-3 px-6 pt-4 pb-6">
          <Button
            variant="secondary"
            size="lg"
            onClick={onClose}
            className="w-[120px]"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            icon={Flag}
            onClick={submit}
            disabled={pending || !unit}
            className="flex-1"
          >
            {pending ? "Saving" : draft.cta}
          </Button>
        </footer>
      </div>
    </div>
  );
}

/* Phone. */
export function ShortfallSheet({
  sheet,
  unitId,
  onClose,
}: {
  sheet: LoadSheetData;
  unitId: string | null;
  onClose: () => void;
}) {
  const draft = useDraft(sheet, unitId);
  const { pending, submit } = useSubmit(sheet, draft, onClose);
  const ref = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  useEffect(() => ref.current?.focus(), []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-inverse/35"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="phone-flag-title"
        tabIndex={-1}
        style={{ outline: "none" }}
        className="relative flex max-h-[92dvh] flex-col rounded-t-[20px] bg-surface shadow-modal"
      >
        <div className="flex items-center gap-3 border-b border-line px-4 pt-4 pb-3">
          <IconTile icon={Flag} tone="warning" size={40} />
          <div className="min-w-0 flex-1">
            <h2 id="phone-flag-title" className="f-heading">
              Report a problem
            </h2>
            <p className="truncate t-small text-fg-3">
              {draft.unit ? `${draft.unit.id} · ${draft.unit.name}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-line transition-colors hover:bg-subtle"
          >
            <X size={18} strokeWidth={1.8} aria-hidden />
          </button>
        </div>

        <div className="scroll-thin flex min-h-0 flex-col gap-4 overflow-y-auto p-4">
          <div className="flex flex-col gap-2">
            <Label>What’s wrong?</Label>
            <ReasonTiles
              value={draft.reason}
              onChange={draft.setReason}
              compact
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Which item, how many?</Label>
            <UnitPicker draft={draft} compact />
            {draft.existing && (
              <p className="t-caption text-fg-3">
                Recorded at {draft.existing.at}. Saving updates it.
              </p>
            )}
          </div>
          <PhotoTile draft={draft} compact />
          <label className="flex h-12 items-center gap-2.5 rounded-[14px] border border-line px-3.5 focus-within:border-accent">
            <MessageSquare
              size={18}
              strokeWidth={1.6}
              className="shrink-0 text-fg-3"
              aria-hidden
            />
            <span className="sr-only">Note</span>
            <input
              value={draft.note}
              onChange={(e) => draft.setNote(e.target.value)}
              placeholder="Add a note (optional)"
              style={{ outline: "none" }}
              className="min-w-0 flex-1 bg-transparent f-label placeholder:text-fg-3"
            />
          </label>
          <p className="flex items-start gap-2 t-small text-fg-2">
            <Bell
              size={16}
              strokeWidth={1.7}
              className="mt-px shrink-0"
              aria-hidden
            />
            Notifies {listNames(draft.told.map((t) => t.name))}
          </p>
        </div>

        <div className="px-4 pt-1 pb-[max(16px,env(safe-area-inset-bottom))]">
          <Button
            variant="primary"
            size="xl"
            full
            icon={Flag}
            onClick={submit}
            disabled={pending || !draft.unit}
          >
            {pending ? "Saving" : draft.cta}
          </Button>
        </div>
      </div>
    </div>
  );
}
