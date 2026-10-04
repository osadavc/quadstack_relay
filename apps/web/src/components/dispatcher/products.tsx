"use client";

import { type Temp, tempsFor } from "@relay/domain";
import {
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Power,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import {
  createProductAction,
  importProductsAction,
  setProductActiveAction,
  updateProductAction,
} from "@/app/actions/dispatch";
import { Menu, toast } from "@/components/interact";
import { Button, cx, Pill } from "@/components/ui";
import type { ProductRow } from "@/server/products";
import {
  type Brand,
  BrandDot,
  field,
  SearchField,
  Segmented,
  Sheet,
  TempPill,
  tap,
} from "./bits";

/* The products stores order from: add, change, switch off, import. */

type Filter = "all" | Brand;
const BRANDS: Brand[] = ["Fresh", "Style", "Tech"];
const UNITS = ["Case", "Carton", "Crate", "Item"];
const HEADER = "sku,name,brand,temp,unit,weight_kg,volume_m3";

const per = (n: number, unit: string) =>
  `${Math.round(n * 1000) / 1000} ${unit}`;

export function Products({ products }: { products: ProductRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [pending, start] = useTransition();

  const needle = query.trim().toLowerCase();
  const rows = products
    .filter(
      (p) =>
        (filter === "all" || p.brand === filter) &&
        (!needle ||
          `${p.sku} ${p.name} ${p.unit}`.toLowerCase().includes(needle)),
    )
    .sort((a, b) => Number(b.active) - Number(a.active));
  const count = (b: Brand) => products.filter((p) => p.brand === b).length;

  const toggle = (p: ProductRow) =>
    start(async () => {
      const res = await setProductActiveAction(p.id, !p.active);
      if (!res.ok) return toast(res.error, { tone: "warning" });
      toast(`${p.name} ${p.active ? "switched off" : "switched on"}`, {
        detail: p.active ? "Stores can no longer order it" : undefined,
        tone: p.active ? undefined : "success",
      });
      router.refresh();
    });

  const actions = (
    <>
      <Button
        icon={Upload}
        onClick={() => setImporting(true)}
        className={cx(tap, "max-md:flex-1")}
      >
        Import CSV
      </Button>
      <Button
        variant="primary"
        icon={Plus}
        onClick={() => setEditing("new")}
        className={cx(tap, "max-md:flex-1")}
      >
        Add product
      </Button>
    </>
  );

  return (
    <>
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line px-5 py-3.5 max-xl:px-4 max-xl:py-4">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="t-title">Products</h1>
          <Pill tone="neutral" size="sm">
            {products.length}
          </Pill>
        </div>
        <div className="ml-auto flex gap-2 max-md:ml-0 max-md:w-full">
          {actions}
        </div>
      </header>

      {products.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <span className="inline-flex size-10 items-center justify-center rounded-xl bg-subtle text-fg-2">
            <Package size={18} strokeWidth={1.7} aria-hidden />
          </span>
          <p className="t-heading">No products yet</p>
          <p className="max-w-[44ch] t-small text-fg-2">
            Until a brand has products, its stores enter each order as units,
            weight and volume.
          </p>
        </div>
      ) : (
        <>
          <div className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-2 px-5 pt-4 pb-3 max-xl:px-4">
            <Segmented
              label="Filter by brand"
              value={filter}
              onChange={setFilter}
              className="max-md:w-full"
              options={[
                { value: "all", label: "All", count: String(products.length) },
                ...BRANDS.map((b) => ({
                  value: b,
                  label: b,
                  count: String(count(b)),
                })),
              ]}
            />
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="Search code, name, unit"
              className="ml-auto w-[260px] max-md:ml-0 max-md:w-full"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-auto scroll-thin max-xl:overflow-visible">
            <div className="min-w-[900px] max-xl:min-w-0 max-xl:border-t max-xl:border-line">
              <div className="sticky top-0 z-10 flex h-[34px] items-center gap-3 border-y border-line bg-subtle px-5 t-caption-m text-fg-3 max-xl:hidden">
                <span className="w-[110px] shrink-0">Code</span>
                <span className="min-w-0 flex-1">Name</span>
                <span className="w-[80px] shrink-0">Brand</span>
                <span className="w-[96px] shrink-0">Temp</span>
                <span className="w-[80px] shrink-0">Unit</span>
                <span className="w-[100px] shrink-0 text-right">
                  Weight per unit
                </span>
                <span className="w-[110px] shrink-0 text-right">
                  Volume per unit
                </span>
                <span className="w-[64px] shrink-0">Status</span>
                <span className="w-8 shrink-0" />
              </div>
              {rows.map((p) => (
                <ProductLine
                  key={p.id}
                  p={p}
                  busy={pending}
                  onEdit={() => setEditing(p)}
                  onToggle={() => toggle(p)}
                />
              ))}
              {rows.length === 0 && (
                <p className="px-5 py-10 text-center t-small text-fg-3">
                  No product matches.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      <ProductForm
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        product={editing}
        onClose={() => setEditing(null)}
      />
      <ImportProducts open={importing} onClose={() => setImporting(false)} />
    </>
  );
}

function ProductLine({
  p,
  busy,
  onEdit,
  onToggle,
}: {
  p: ProductRow;
  busy: boolean;
  onEdit: () => void;
  onToggle: () => void;
}) {
  const menu = (
    <Menu
      align="end"
      width={220}
      items={[
        { label: "Edit", icon: Pencil, onSelect: onEdit },
        {
          label: p.active ? "Switch off" : "Switch on",
          detail: p.active ? "Stores can’t order it" : undefined,
          icon: Power,
          danger: p.active,
          disabled: busy,
          onSelect: onToggle,
        },
      ]}
      trigger={(t) => (
        <button
          type="button"
          {...t}
          aria-label={`Actions for ${p.name}`}
          className="inline-flex size-8 items-center justify-center rounded-lg text-fg-2 transition-colors hover:bg-subtle hover:text-fg max-xl:size-11 max-xl:rounded-[10px]"
        >
          <MoreHorizontal size={16} strokeWidth={1.8} aria-hidden />
        </button>
      )}
    />
  );
  const status = p.active ? (
    <Pill tone="success" size="sm">
      Active
    </Pill>
  ) : (
    <Pill tone="offline" size="sm">
      Off
    </Pill>
  );
  return (
    <div
      className={cx(
        "border-b border-line",
        !p.active && "bg-subtle/50 text-fg-3",
      )}
    >
      {/* Desktop */}
      <div className="flex h-[52px] items-center gap-3 px-5 max-xl:hidden">
        <span className="w-[110px] shrink-0 truncate t-mono">{p.sku}</span>
        <span className="min-w-0 flex-1 truncate t-small-m">{p.name}</span>
        <span className="w-[80px] shrink-0">
          <BrandDot brand={p.brand} label={p.brand} className="t-small" />
        </span>
        <span className="w-[96px] shrink-0">
          <TempPill temp={p.temp} />
        </span>
        <span className="w-[80px] shrink-0 truncate t-small">{p.unit}</span>
        <span className="w-[100px] shrink-0 text-right t-mono">
          {per(p.weightKg, "kg")}
        </span>
        <span className="w-[110px] shrink-0 text-right t-mono">
          {per(p.volumeM3, "m³")}
        </span>
        <span className="w-[64px] shrink-0">{status}</span>
        <span className="w-8 shrink-0">{menu}</span>
      </div>

      {/* Phone and tablet */}
      <div className="flex items-start gap-3 py-3 pr-2 pl-4 xl:hidden">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="flex items-center gap-2">
            <span className="min-w-0 truncate t-body-m">{p.name}</span>
            {!p.active && status}
          </p>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="t-mono-sm text-fg-2">{p.sku}</span>
            <BrandDot
              brand={p.brand}
              label={p.brand}
              className="t-caption text-fg-2"
            />
            <TempPill temp={p.temp} />
          </div>
          <p className="t-caption text-fg-3">
            {p.unit} · {per(p.weightKg, "kg")} · {per(p.volumeM3, "m³")}
          </p>
        </div>
        <div className="-mt-1">{menu}</div>
      </div>
    </div>
  );
}

/* ---------- Forms ---------- */

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <label htmlFor={htmlFor} className="t-small-m">
          {label}
        </label>
        {hint}
      </div>
      {children}
    </div>
  );
}

function Choice<T extends string>({
  options,
  value,
  onChange,
  disabled = [],
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: T[];
}) {
  return (
    <div className="flex gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          disabled={disabled.includes(o.value)}
          onClick={() => onChange(o.value)}
          className={cx(
            "h-8 flex-1 rounded-lg border px-2.5 t-small-m whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-45 max-xl:h-11 max-xl:rounded-[10px]",
            value === o.value
              ? "border-accent bg-accent-tint text-accent-text"
              : "border-line-strong bg-surface text-fg-2 hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ProductForm({
  product,
  onClose,
}: {
  product: ProductRow | "new" | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const existing = product && product !== "new" ? product : null;
  const [form, setForm] = useState({
    sku: existing?.sku ?? "",
    name: existing?.name ?? "",
    brand: (existing?.brand ?? "Fresh") as Brand,
    temp: (existing?.temp ?? "chilled") as Temp,
    unit: existing?.unit ?? "",
    weightKg: existing ? String(existing.weightKg) : "",
    volumeM3: existing ? String(existing.volumeM3) : "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const temps = tempsFor(form.brand);
  const setBrand = (b: Brand) =>
    setForm((f) => ({
      ...f,
      brand: b,
      temp: tempsFor(b).includes(f.temp) ? f.temp : tempsFor(b)[0],
    }));
  const num = (s: string) => Number(s.replace(",", "."));

  const submit = () =>
    start(async () => {
      setError(null);
      const input = {
        sku: form.sku,
        name: form.name,
        brand: form.brand,
        temp: form.temp,
        unit: form.unit,
        weightKg: num(form.weightKg),
        volumeM3: num(form.volumeM3),
      };
      const res = existing
        ? await updateProductAction(existing.id, input)
        : await createProductAction(input);
      if (!res.ok) return setError(res.error);
      toast(
        existing ? `${form.name.trim()} updated` : `Added ${form.name.trim()}`,
        {
          detail: existing?.orderLines
            ? "Orders already placed keep their figures"
            : undefined,
          tone: "success",
        },
      );
      onClose();
      router.refresh();
    });

  return (
    <Sheet
      open={product !== null}
      onClose={onClose}
      title={existing ? "Edit product" : "Add a product"}
      width={480}
      actions={
        <>
          <Button onClick={onClose} className={cx(tap, "max-xl:order-last")}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={pending}
            onClick={submit}
            className={tap}
          >
            {pending ? "Saving" : existing ? "Save" : "Add product"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="grid grid-cols-[1fr_2fr] gap-3 max-sm:grid-cols-1">
          <Field label="Code" htmlFor="product-sku">
            <input
              id="product-sku"
              value={form.sku}
              onChange={(e) => set("sku", e.target.value)}
              autoComplete="off"
              className={cx(field, "t-mono")}
            />
          </Field>
          <Field label="Name" htmlFor="product-name">
            <input
              id="product-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              autoComplete="off"
              className={field}
            />
          </Field>
        </div>
        <Field label="Brand">
          <Choice
            value={form.brand}
            onChange={setBrand}
            options={BRANDS.map((b) => ({ value: b, label: b }))}
          />
        </Field>
        <Field
          label="Temperature"
          hint={
            temps.length === 1 ? (
              <span className="t-caption text-fg-3">
                {form.brand} orders ambient goods
              </span>
            ) : undefined
          }
        >
          <Choice<Temp>
            value={form.temp}
            onChange={(v) => set("temp", v)}
            disabled={(["chilled", "frozen"] as Temp[]).filter(
              (temp) => !temps.includes(temp),
            )}
            options={[
              { value: "chilled", label: "Chilled" },
              { value: "frozen", label: "Frozen" },
              { value: "ambient", label: "Ambient" },
            ]}
          />
        </Field>
        <Field
          label="Unit"
          htmlFor="product-unit"
          hint={<span className="t-caption text-fg-3">What one unit is</span>}
        >
          <input
            id="product-unit"
            list="product-units"
            value={form.unit}
            onChange={(e) => set("unit", e.target.value)}
            autoComplete="off"
            className={field}
          />
          <datalist id="product-units">
            {UNITS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Weight per unit" htmlFor="product-weight">
            <div className="relative">
              <input
                id="product-weight"
                inputMode="decimal"
                value={form.weightKg}
                onChange={(e) => set("weightKg", e.target.value)}
                className={cx(field, "w-full pr-9")}
              />
              <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 t-caption text-fg-3">
                kg
              </span>
            </div>
          </Field>
          <Field label="Volume per unit" htmlFor="product-volume">
            <div className="relative">
              <input
                id="product-volume"
                inputMode="decimal"
                value={form.volumeM3}
                onChange={(e) => set("volumeM3", e.target.value)}
                className={cx(field, "w-full pr-9")}
              />
              <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 t-caption text-fg-3">
                m³
              </span>
            </div>
          </Field>
        </div>
        {existing && existing.orderLines > 0 && (
          <p className="t-small text-fg-2">
            Changes apply to new orders. Orders already placed keep the figures
            they were placed with.
          </p>
        )}
        {error && <p className="t-small text-danger-text">{error}</p>}
      </form>
    </Sheet>
  );
}

function ImportProducts({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const close = () => {
    onClose();
    setText("");
    setError(null);
  };

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await importProductsAction(text);
      if (!res.ok) return setError(res.error);
      toast("Products imported", {
        detail: `${res.data.added} added · ${res.data.updated} updated`,
        tone: "success",
      });
      close();
      router.refresh();
    });

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Import products"
      width={560}
      actions={
        <>
          <Button onClick={close} className={cx(tap, "max-xl:order-last")}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={pending || !text.trim()}
            onClick={submit}
            className={tap}
          >
            {pending ? "Importing" : "Import"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="t-small text-fg-2">
          A CSV file with this header. A row whose code already exists updates
          that product. Nothing is saved if a row is wrong.
        </p>
        <code className="block overflow-x-auto rounded-lg bg-subtle px-3 py-2 t-mono-sm whitespace-nowrap text-fg-2">
          {HEADER}
        </code>
        <label className="flex flex-col gap-1.5">
          <span className="t-small-m">File</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setText(await f.text());
            }}
            className="t-small file:mr-3 file:h-8 file:rounded-lg file:border file:border-line-strong file:bg-surface file:px-3 file:t-small-m file:text-fg max-xl:file:h-11"
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="product-csv" className="t-small-m">
            Or paste the rows
          </label>
          <textarea
            id="product-csv"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            spellCheck={false}
            placeholder={HEADER}
            className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 t-mono-sm outline-none placeholder:text-fg-3 focus:border-accent max-xl:text-[16px]"
          />
        </div>
        {error && <p className="t-small text-danger-text">{error}</p>}
      </div>
    </Sheet>
  );
}
