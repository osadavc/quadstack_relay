"use client";

import { dayLabel, requiresRefrigeration, TEMP_LABEL } from "@relay/domain";
import { ChevronLeft, Package, Snowflake } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { phoneOrderAction } from "@/app/actions/dispatch";
import { toast } from "@/components/interact";
import { Button, cx, Pill } from "@/components/ui";
import type { PhoneOrderData } from "@/server/admin";
import { BrandDot, SearchField, Sheet, tap } from "./bits";

/* An order a store phones in: pick the outlet, then units, weight and volume per order. */

type Outlet = PhoneOrderData["outlets"][number];
type Field = "units" | "weightKg" | "volumeM3";
type Draft = Record<string, Record<Field, string>>;
const EMPTY: Record<Field, string> = { units: "", weightKg: "", volumeM3: "" };

const num = (s: string | undefined) => {
  const n = Number((s ?? "").replace(",", ".") || "0");
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
};

export function PhoneOrder({
  data,
  queued,
  open,
  onClose,
}: {
  data: PhoneOrderData;
  /** Outlets that already have an order in for the ordering day. */
  queued: Set<string>;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [outlet, setOutlet] = useState<Outlet | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft>({});
  const [qty, setQty] = useState<Record<number, number>>({});
  const [pending, start] = useTransition();

  const close = () => {
    onClose();
    setOutlet(null);
    setQuery("");
    setDraft({});
    setQty({});
  };

  const needle = query.trim().toLowerCase();
  const matches = data.outlets.filter(
    (o) =>
      !needle ||
      `${o.id} ${o.name} ${o.district}`.toLowerCase().includes(needle),
  );
  const temps = outlet?.temps ?? [];
  /** Products for one of the outlet's temperatures, if dispatch keeps any. */
  const productsFor = (temp: string) =>
    outlet ? (data.products[`${outlet.brand}|${temp}`] ?? []) : [];
  const unitsOf = (temp: string) => {
    const list = productsFor(temp);
    return list.length
      ? list.reduce((a, p) => a + (qty[p.id] ?? 0), 0)
      : num(draft[temp]?.units) || 0;
  };
  const total = temps.reduce((a, temp) => a + unitsOf(temp), 0);
  const invalid = temps.some((temp) => {
    if (productsFor(temp).length) return false;
    const u = num(draft[temp]?.units);
    if (Number.isNaN(u) || !Number.isInteger(u)) return true;
    return (
      u > 0 &&
      !(num(draft[temp]?.weightKg) > 0 && num(draft[temp]?.volumeM3) > 0)
    );
  });

  const submit = () => {
    if (!outlet) return;
    const items = temps.map((temp) => {
      const list = productsFor(temp);
      return list.length
        ? {
            temp,
            units: 0,
            weightKg: 0,
            volumeM3: 0,
            lines: list.map((p) => ({ productId: p.id, qty: qty[p.id] ?? 0 })),
          }
        : {
            temp,
            units: num(draft[temp]?.units),
            weightKg: num(draft[temp]?.weightKg),
            volumeM3: num(draft[temp]?.volumeM3),
          };
    });
    start(async () => {
      const res = await phoneOrderAction(outlet.id, items);
      if (!res.ok) return toast(res.error, { tone: "warning" });
      const ids = res.data.placed;
      toast(
        `${ids.length === 1 ? "Order" : "Orders"} ${ids.join(" and ")} added for ${dayLabel(res.data.day)}`,
        { tone: "success" },
      );
      close();
      router.refresh();
    });
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="New phone order"
      description={`For ${data.dayLabel}`}
      width={520}
      actions={
        <>
          <Button onClick={close} className={cx(tap, "max-xl:order-last")}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!outlet || total === 0 || invalid || pending}
            onClick={submit}
            className={tap}
          >
            {pending ? "Adding" : "Add order"}
          </Button>
        </>
      }
    >
      {outlet ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2.5 rounded-[10px] bg-subtle px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate t-small-m">
                {outlet.id} · {outlet.name}
              </p>
              <BrandDot
                brand={outlet.brand}
                label={`${outlet.brand} · ${outlet.district}`}
                className="t-caption text-fg-3"
              />
            </div>
            <Button
              size="sm"
              variant="ghost"
              icon={ChevronLeft}
              onClick={() => {
                setOutlet(null);
                setDraft({});
                setQty({});
              }}
              className="max-xl:h-10"
            >
              Change
            </Button>
          </div>
          {queued.has(outlet.id) && (
            <p className="t-small text-warning-text">
              {outlet.id} already has an order for {data.dayLabel}. What you
              enter here replaces it.
            </p>
          )}
          {outlet.temps.map((temp) => (
            <section key={temp} className="flex flex-col gap-1.5">
              <p className="flex items-center gap-1.5 t-caption-m text-fg-3">
                {requiresRefrigeration(temp) ? (
                  <Snowflake
                    size={12}
                    strokeWidth={1.8}
                    className="text-chilled-text"
                    aria-hidden
                  />
                ) : (
                  <Package size={12} strokeWidth={1.8} aria-hidden />
                )}
                {TEMP_LABEL[temp]}
              </p>
              {productsFor(temp).length > 0 ? (
                <ul className="divide-y divide-line rounded-[10px] border border-line">
                  {productsFor(temp).map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-3 px-3 py-2 max-xl:py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate t-small-m">{p.name}</p>
                        <p className="truncate t-caption text-fg-3">
                          {p.sku} · {p.unit}
                        </p>
                      </div>
                      <input
                        inputMode="numeric"
                        aria-label={`${p.name}, quantity`}
                        value={qty[p.id] ? String(qty[p.id]) : ""}
                        placeholder="0"
                        onChange={(e) =>
                          setQty((q) => ({
                            ...q,
                            [p.id]: Math.min(
                              99_999,
                              Number(e.target.value.replace(/\D/g, "")) || 0,
                            ),
                          }))
                        }
                        className="h-9 w-16 shrink-0 rounded-lg border border-line-strong bg-surface text-center t-mono outline-none placeholder:text-fg-3 focus:border-accent max-xl:h-11 max-xl:rounded-[10px] max-xl:text-[16px]"
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["units", "Units"],
                      ["weightKg", "Weight, kg"],
                      ["volumeM3", "Volume, m³"],
                    ] as const
                  ).map(([f, label]) => (
                    <label key={f} className="flex min-w-0 flex-col gap-1">
                      <span className="t-caption text-fg-3">{label}</span>
                      <input
                        inputMode={f === "units" ? "numeric" : "decimal"}
                        value={draft[temp]?.[f] ?? ""}
                        placeholder="0"
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            [temp]: {
                              ...(d[temp] ?? EMPTY),
                              [f]: e.target.value,
                            },
                          }))
                        }
                        className="h-9 w-full min-w-0 rounded-lg border border-line-strong bg-surface px-2.5 t-mono outline-none placeholder:text-fg-3 focus:border-accent max-xl:h-11 max-xl:rounded-[10px] max-xl:text-[16px]"
                      />
                    </label>
                  ))}
                </div>
              )}
            </section>
          ))}
          <p
            className={cx(
              "t-small",
              invalid ? "text-warning-text" : "text-fg-2",
            )}
          >
            {invalid
              ? "Enter whole units, and the weight and volume, for each order."
              : total
                ? `${total} ${total === 1 ? "unit" : "units"} for ${data.dayLabel}`
                : "Enter at least one order."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Outlet id or name"
          />
          {matches.length === 0 ? (
            <p className="py-6 text-center t-small text-fg-3">
              {data.outlets.length === 0
                ? "No outlets yet."
                : `No outlet matches “${query.trim()}”.`}
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-[10px] border border-line xl:max-h-[340px] xl:overflow-y-auto xl:scroll-thin">
              {matches.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => setOutlet(o)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-subtle/60 max-xl:min-h-[52px]"
                  >
                    <span className="w-14 shrink-0 t-mono">{o.id}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate t-small-m">{o.name}</span>
                      <BrandDot
                        brand={o.brand}
                        label={`${o.brand} · ${o.district}`}
                        className="t-caption text-fg-3"
                      />
                    </span>
                    {queued.has(o.id) && (
                      <Pill tone="neutral" size="sm">
                        Order in
                      </Pill>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  );
}
