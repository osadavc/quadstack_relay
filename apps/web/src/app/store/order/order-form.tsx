"use client";

import {
  ArrowRight,
  CalendarClock,
  Check,
  CircleCheck,
  Clock,
  RotateCcw,
  Send,
  ShieldCheck,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { placeOrderAction } from "@/app/actions/store";
import { toast } from "@/components/interact";
import { QtyStepper, TempTag } from "@/components/store/bits";
import { Button, Card, cx, Pill } from "@/components/ui";
import type { orderForm } from "@/server/queries/store";

type Data = Awaited<ReturnType<typeof orderForm>>;
type Section = Data["sections"][number];

/* Once a plan takes an order, its quantities are fixed. */
const PLANNED = new Set([
  "planned",
  "loaded",
  "delivered",
  "received",
  "failed",
]);

const STATUS: Record<string, string> = {
  confirmed: "Placed",
  planned: "Planned",
  loaded: "On the truck",
  delivered: "Delivered",
  received: "Received",
  failed: "Not delivered",
};

const FULL_DAY: Record<string, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

/** "45 min left", "18 h 30 min left", "2 d 4 h left" */
function timeLeft(min: number) {
  if (min <= 0) return "closing now";
  if (min < 60) return `${min} min left`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ${min % 60} min left`;
  return `${Math.floor(min / 1440)} d ${Math.floor((min % 1440) / 60)} h left`;
}

type Draft = Record<
  string,
  {
    units: string;
    weightKg: string;
    volumeM3: string;
    /** Product quantities by product id, when the section lists products. */
    qty: Record<number, number>;
  }
>;

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
};
const show = (n: number) => (n ? String(Math.round(n * 1000) / 1000) : "");
const round = (n: number) => Math.round(n * 1000) / 1000;

export function OrderForm({ data }: { data: Data }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const brand = data.outlet.brand;

  const initial: Draft = Object.fromEntries(
    data.sections.map((s) => [
      s.temp,
      {
        units: show(s.units),
        weightKg: show(s.weightKg),
        volumeM3: show(s.volumeM3),
        qty: Object.fromEntries(s.products.map((p) => [p.id, p.qty])),
      },
    ]),
  );
  const initialKey = JSON.stringify(initial);
  const [draft, setDraft] = useState(initial);
  const [seen, setSeen] = useState(initialKey);
  // New figures from the server (another tab, a placed order) replace the draft.
  if (seen !== initialKey) {
    setSeen(initialKey);
    setDraft(initial);
  }

  const placed = data.placed.length > 0;
  const locked = data.sections.some((s) => s.status && PLANNED.has(s.status));
  // The least advanced order on the delivery sets the header status.
  const ORDER = ["planned", "loaded", "delivered", "received", "failed"];
  const lockedStatus = data.sections
    .map((s) => s.status)
    .filter((x): x is NonNullable<typeof x> => Boolean(x && PLANNED.has(x)))
    .sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))[0];
  const readOnly = locked;
  const changed = JSON.stringify(draft) !== initialKey;
  const hasLast = data.sections.some((s) => s.last !== null);
  const lastDay = data.sections.find((s) => s.last)?.last?.day ?? null;

  /** A section's totals: from its products, or as entered. */
  const totals = (s: Section) => {
    const d = draft[s.temp];
    if (s.mode === "products")
      return s.products.reduce(
        (a, p) => {
          const q = d.qty[p.id] ?? 0;
          return {
            units: a.units + q,
            weightKg: a.weightKg + q * p.weightKg,
            volumeM3: a.volumeM3 + q * p.volumeM3,
          };
        },
        { units: 0, weightKg: 0, volumeM3: 0 },
      );
    return {
      units: num(d.units || "0") || 0,
      weightKg: num(d.weightKg || "0") || 0,
      volumeM3: num(d.volumeM3 || "0") || 0,
    };
  };
  const total = data.sections.reduce((a, s) => a + totals(s).units, 0);
  // Entered totals need whole units, and a weight and volume with them.
  const invalid = data.sections.find((s) => {
    if (s.mode === "products") return false;
    const d = draft[s.temp];
    const u = num(d.units || "0");
    if (Number.isNaN(u) || !Number.isInteger(u)) return true;
    if (u === 0) return false;
    return !(num(d.weightKg) > 0) || !(num(d.volumeM3) > 0);
  });
  const kindOf = (temp: string) =>
    temp === "chilled" ? "Chilled" : brand === "Fresh" ? "Ambient" : brand;

  const copyLast = () =>
    setDraft((d) => {
      const next = { ...d };
      for (const s of data.sections) {
        if (s.mode === "products") {
          const qty = { ...next[s.temp].qty };
          for (const p of s.products) if (p.last !== null) qty[p.id] = p.last;
          next[s.temp] = { ...next[s.temp], qty };
        } else if (s.last)
          next[s.temp] = {
            ...next[s.temp],
            units: show(s.last.units),
            weightKg: show(s.last.weightKg),
            volumeM3: show(s.last.volumeM3),
          };
      }
      return next;
    });

  const submit = () =>
    start(async () => {
      const res = await placeOrderAction(
        data.sections.map((s) =>
          s.mode === "products"
            ? {
                temp: s.temp,
                units: 0,
                weightKg: 0,
                volumeM3: 0,
                lines: s.products.map((p) => ({
                  productId: p.id,
                  qty: draft[s.temp].qty[p.id] ?? 0,
                })),
              }
            : {
                temp: s.temp,
                units: num(draft[s.temp].units || "0"),
                weightKg: num(draft[s.temp].weightKg || "0"),
                volumeM3: num(draft[s.temp].volumeM3 || "0"),
              },
        ),
      );
      if (!res.ok) return toast(res.error, { tone: "warning" });
      toast(placed ? "Order updated" : "Order placed", {
        detail: res.data.placed.join(", "),
        tone: "success",
      });
      router.refresh();
    });

  const submitLabel = pending
    ? "Saving"
    : placed
      ? "Update order"
      : "Place order";
  const canSubmit = !readOnly && (changed || !placed);
  const blocked = pending || total === 0 || Boolean(invalid);

  return (
    <div
      className={cx(
        "mx-auto flex w-full max-w-[1248px] flex-col gap-5 px-6 py-7 max-md:gap-4 max-md:px-4 max-md:py-4",
        canSubmit && "max-lg:pb-28",
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="t-display max-md:f-title">
            Order for {data.dayLabel}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Pill
              tone={data.minutesLeft < 120 ? "warning" : "neutral"}
              icon={Clock}
              size="sm"
            >
              Closes {data.closesLabel} · {timeLeft(data.minutesLeft)}
            </Pill>
            {locked ? (
              <Pill tone="accent" icon={Truck} size="sm">
                {STATUS[lockedStatus ?? "planned"] ?? "Planned"}
              </Pill>
            ) : placed ? (
              <Pill tone="success" icon={Check} size="sm">
                Placed
              </Pill>
            ) : null}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2 max-md:ml-0 max-md:w-full">
          {hasLast && !readOnly && (
            <Button
              variant="secondary"
              icon={RotateCcw}
              onClick={copyLast}
              className="max-md:h-11 max-md:flex-1"
            >
              {lastDay
                ? `Copy last ${FULL_DAY[lastDay.split(" ")[0]] ?? lastDay}’s order`
                : "Copy the last order"}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start max-md:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {data.carried.length > 0 && (
            <Card as="section" className="overflow-hidden">
              <div className="flex items-center gap-2.5 bg-subtle px-[18px] py-3 max-md:px-4">
                <CalendarClock
                  size={16}
                  strokeWidth={1.7}
                  className="shrink-0 text-fg-2"
                  aria-hidden
                />
                <h2 className="t-small-m">Also on this delivery</h2>
              </div>
              <ul>
                {data.carried.map((o) => (
                  <li key={o.id} className="border-t border-line">
                    <Link
                      href={`/store/notice/${o.id}`}
                      className="flex min-h-[56px] items-center gap-3 px-[18px] py-2.5 transition-colors hover:bg-subtle/60 max-md:px-4"
                    >
                      <TempTag temp={o.temp} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate t-body-m">
                          Moved here from {o.from}
                        </p>
                        <p className="truncate t-caption text-fg-3">
                          <span className="t-mono-sm">{o.id}</span> · {o.units}{" "}
                          units
                        </p>
                      </div>
                      <ArrowRight
                        size={15}
                        className="shrink-0 text-fg-3"
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {data.sections.map((sec) => (
            <OrderSection
              key={sec.temp}
              sec={sec}
              readOnly={readOnly}
              disabled={pending}
              value={draft[sec.temp]}
              onChange={(field, v) =>
                setDraft((d) => ({
                  ...d,
                  [sec.temp]: { ...d[sec.temp], [field]: v },
                }))
              }
              onQty={(id, n) =>
                setDraft((d) => ({
                  ...d,
                  [sec.temp]: {
                    ...d[sec.temp],
                    qty: { ...d[sec.temp].qty, [id]: n },
                  },
                }))
              }
            />
          ))}
        </div>

        <aside className="flex w-full flex-col gap-4 lg:w-[380px] lg:shrink-0">
          {data.earlier && (
            <section className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-4">
              <h2 className="t-caption-m text-fg-3">
                {data.earlier.dayLabel} delivery
              </h2>
              <ul className="flex flex-col gap-2">
                {data.earlier.orders.map((o) => (
                  <li key={o.id} className="flex items-center gap-2">
                    <TempTag temp={o.temp} />
                    <span className="min-w-0 truncate t-mono text-fg-2">
                      {o.id}
                    </span>
                    <span
                      className={cx(
                        "ml-auto shrink-0 t-caption",
                        o.movedTo ? "text-warning-text" : "text-fg-3",
                      )}
                    >
                      {o.movedTo
                        ? `Moved to ${o.movedTo}`
                        : (STATUS[o.status] ?? o.status)}
                    </span>
                  </li>
                ))}
              </ul>
              {data.earlier.band && (
                <p className="t-small-m">
                  Arrival {data.earlier.band}
                  {data.earlier.vehicleId ? ` · ${data.earlier.vehicleId}` : ""}
                </p>
              )}
              <Button
                variant="secondary"
                href="/store/today"
                iconRight={ArrowRight}
                className="mt-0.5 self-start max-md:h-10"
              >
                See delivery
              </Button>
            </section>
          )}

          <section className="flex flex-col gap-3.5 rounded-2xl border border-line bg-surface p-5 shadow-pop max-md:p-4">
            <h2 className="t-heading">Your order</h2>
            {data.sections.map((sec) => (
              <div key={sec.temp} className="flex items-center gap-2">
                <span className="flex-1 t-body text-fg-2">
                  {kindOf(sec.temp)}
                </span>
                <div className="text-right">
                  <p className="t-body-m tabular-nums">
                    {totals(sec).units} units
                  </p>
                  <p className="t-caption text-fg-3 tabular-nums">
                    {round(totals(sec).weightKg)} kg ·{" "}
                    {round(totals(sec).volumeM3)} m³
                  </p>
                </div>
              </div>
            ))}
            <div className="h-px bg-line" />
            <div className="flex items-center gap-2.5">
              <CalendarClock
                size={18}
                strokeWidth={1.7}
                className="shrink-0 text-fg-2"
                aria-hidden
              />
              <div>
                <p className="t-body-m">Delivery {data.dayLabel}</p>
                <p className="t-caption text-fg-3">
                  Receiving window {data.outlet.window}
                </p>
              </div>
            </div>
            {data.protection && (
              <div className="flex items-start gap-2.5 rounded-xl bg-success-tint p-3">
                <ShieldCheck
                  size={18}
                  strokeWidth={1.7}
                  className="shrink-0 text-success-text"
                  aria-hidden
                />
                <p className="t-small">{data.protection}</p>
              </div>
            )}

            {placed && (
              <div
                aria-live="polite"
                className="flex flex-col gap-2 rounded-xl border border-line bg-subtle p-3.5"
              >
                {data.placed.map((o) => (
                  <div key={o.id} className="flex items-center gap-2">
                    <CircleCheck
                      size={16}
                      strokeWidth={1.7}
                      className="shrink-0 text-success-text"
                      aria-hidden
                    />
                    <span className="min-w-0 truncate t-mono">{o.id}</span>
                    <span className="ml-auto shrink-0 t-caption text-fg-3">
                      Placed {o.at}
                    </span>
                  </div>
                ))}
                <p className="t-small text-fg-2">
                  {data.planned
                    ? `Arrival ${data.planned.band} · ${data.planned.vehicleId}`
                    : "Waiting for the plan"}
                </p>
              </div>
            )}

            {canSubmit && invalid && total > 0 && (
              <p className="t-small text-warning-text">
                Enter whole units, and the weight and volume, for each order.
              </p>
            )}

            {canSubmit ? (
              <Button
                variant="primary"
                size="lg"
                full
                icon={placed ? Check : Send}
                onClick={submit}
                disabled={blocked}
                className="max-lg:hidden"
              >
                {submitLabel}
              </Button>
            ) : data.planned ? (
              <Button
                variant="secondary"
                size="lg"
                full
                href="/store/today"
                iconRight={ArrowRight}
                className="max-md:h-[46px]"
              >
                See delivery
              </Button>
            ) : null}
          </section>

          {data.lastRuns.length > 0 && (
            <section className="rounded-2xl border border-line bg-surface px-5 py-3.5 max-md:px-4">
              <h2 className="pb-2 t-subheading">Last runs</h2>
              <ul>
                {data.lastRuns.map((r) => (
                  <li
                    key={r.day}
                    className="flex flex-wrap items-center gap-2 border-t border-line py-2"
                  >
                    <span className="flex-1 t-small text-fg-2">{r.day}</span>
                    {r.chilled && (
                      <Pill
                        tone={r.chilled === "served" ? "success" : "warning"}
                        icon={r.chilled === "served" ? Check : undefined}
                        size="sm"
                      >
                        {r.chilled === "served" ? "Chilled" : "Chilled skipped"}
                      </Pill>
                    )}
                    {r.ambient && (
                      <Pill
                        tone={r.ambient === "served" ? "success" : "warning"}
                        icon={r.ambient === "served" ? Check : undefined}
                        size="sm"
                      >
                        {r.ambient === "served"
                          ? kindOf("ambient")
                          : `${kindOf("ambient")} skipped`}
                      </Pill>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {canSubmit && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-line bg-surface/95 px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] backdrop-blur-sm lg:hidden">
          <div className="min-w-0 flex-1">
            <p className="t-body-m tabular-nums">{total} units</p>
            <p className="truncate t-caption text-fg-3">
              Delivery {data.dayLabel}
            </p>
          </div>
          <Button
            variant="primary"
            size="xl"
            icon={placed ? Check : Send}
            onClick={submit}
            disabled={blocked}
          >
            {submitLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

function OrderSection({
  sec,
  readOnly,
  disabled,
  value,
  onChange,
  onQty,
}: {
  sec: Section;
  readOnly: boolean;
  disabled: boolean;
  value: Draft[string];
  onChange: (field: "units" | "weightKg" | "volumeM3", v: string) => void;
  onQty: (productId: number, n: number) => void;
}) {
  const fields = [
    { key: "units", label: "Units", hint: "whole units" },
    { key: "weightKg", label: "Weight", hint: "kg" },
    { key: "volumeM3", label: "Volume", hint: "m³" },
  ] as const;
  return (
    <Card as="section" className="overflow-hidden">
      <div
        className={cx(
          "flex items-center gap-2.5 px-[18px] py-3.5 max-md:px-4",
          sec.temp === "chilled" ? "bg-chilled-tint" : "bg-subtle",
        )}
      >
        <TempTag temp={sec.temp} />
        {sec.status && (
          <span className="truncate t-mono-sm text-fg-2">{sec.orderId}</span>
        )}
        {sec.last && (
          <span className="ml-auto truncate t-caption text-fg-3">
            Last {sec.last.day} · {sec.last.units} units
          </span>
        )}
      </div>
      {sec.moved && (
        <Link
          href={`/store/notice/${sec.moved.id}`}
          className="flex min-h-[56px] items-center gap-3 border-t border-line px-[18px] py-2 transition-colors hover:bg-subtle/60 max-md:px-4"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate t-body-m text-warning-text">
              Moved to {sec.moved.to}
            </p>
            <p className="truncate t-caption text-fg-3">
              <span className="t-mono-sm">{sec.moved.id}</span> ·{" "}
              {sec.moved.units} units
            </p>
          </div>
          <ArrowRight size={15} className="shrink-0 text-fg-3" aria-hidden />
        </Link>
      )}
      {sec.mode === "products" ? (
        <ProductLines
          sec={sec}
          readOnly={readOnly}
          disabled={disabled}
          qty={value.qty}
          onQty={onQty}
        />
      ) : (
        <div className="grid grid-cols-3 gap-3 border-t border-line px-[18px] py-4 max-md:px-4">
          {fields.map((f) => (
            <div key={f.key} className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor={`${sec.temp}-${f.key}`} className="t-small-m">
                {f.label}
              </label>
              {readOnly ? (
                <span className="t-heading tabular-nums">
                  {value[f.key] || "0"}
                </span>
              ) : (
                <input
                  id={`${sec.temp}-${f.key}`}
                  inputMode={f.key === "units" ? "numeric" : "decimal"}
                  value={value[f.key]}
                  disabled={disabled}
                  placeholder="0"
                  onChange={(e) => onChange(f.key, e.target.value)}
                  className="h-10 w-full min-w-0 rounded-[10px] border border-line-strong bg-surface px-3 t-body tabular-nums outline-none focus:border-accent max-md:h-[46px] max-md:text-[16px]"
                />
              )}
              <span className="t-caption text-fg-3">{f.hint}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ProductLines({
  sec,
  readOnly,
  disabled,
  qty,
  onQty,
}: {
  sec: Section;
  readOnly: boolean;
  disabled: boolean;
  qty: Record<number, number>;
  onQty: (productId: number, n: number) => void;
}) {
  const shown = readOnly
    ? sec.products.filter((p) => (qty[p.id] ?? 0) > 0)
    : sec.products;
  return (
    <ul>
      {shown.map((p) => (
        <li
          key={p.id}
          className="flex min-h-[60px] items-center gap-4 border-t border-line px-[18px] py-2 max-md:gap-3 max-md:px-4"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate t-body-m">{p.name}</p>
            <p className="truncate t-caption text-fg-3">
              {p.unit} · {round(p.weightKg)} kg · {round(p.volumeM3)} m³
              {p.last !== null && ` · last ${p.last}`}
            </p>
          </div>
          {readOnly ? (
            <span className="t-heading tabular-nums">{qty[p.id] ?? 0}</span>
          ) : (
            <QtyStepper
              label={p.name}
              value={qty[p.id] ?? 0}
              disabled={disabled}
              onChange={(n) => onQty(p.id, n)}
            />
          )}
        </li>
      ))}
      {readOnly && shown.length === 0 && (
        <li className="border-t border-line px-[18px] py-3 t-small text-fg-3 max-md:px-4">
          Nothing ordered
        </li>
      )}
      {sec.retired.length > 0 && (
        <li className="border-t border-line bg-subtle/60 px-[18px] py-2.5 t-small text-fg-2 max-md:px-4">
          No longer offered:{" "}
          {sec.retired.map((r) => `${r.name} ${r.qty}`).join(", ")}.
          {readOnly ? "" : " Updating the order removes them."}
        </li>
      )}
    </ul>
  );
}
