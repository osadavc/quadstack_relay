"use client";

import { requiresRefrigeration, TEMP_LABEL } from "@relay/domain";

import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleCheck,
  Flag,
  GitCompare,
  Lock,
  Package,
  PackageCheck,
  Send,
  Snowflake,
  ThermometerSnowflake,
} from "lucide-react";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { ackChangeAction, setUnitAction } from "@/app/actions/dock";
import { toast } from "@/components/interact";
import {
  Button,
  Card,
  cx,
  Dot,
  IconTile,
  Pill,
  Progress,
} from "@/components/ui";
import type { LoadSheetData } from "@/server/queries/dock";
import {
  changeLines,
  m3,
  plural,
  REASON_WORD,
  type Section,
  type SheetUnit,
  shortfallLine,
} from "./format";
import { LoadMap } from "./load-map";
import { ShortfallDialog, ShortfallSheet } from "./shortfall";
import { UnitCheck, type UnitStatus } from "./unit-check";

/*
 * L2 load sheet on the dock screen, and L5 the same sheet on a phone (below
 * the md breakpoint). Both read and write the same record.
 */

type Patch = { id: string; status: UnitStatus };

function useSheet(data: LoadSheetData) {
  const [pending, start] = useTransition();
  const [statuses, patch] = useOptimistic(
    Object.fromEntries(
      data.sections.flatMap((s) =>
        s.units.map((u) => [u.id, u.status as UnitStatus]),
      ),
    ),
    (state, p: Patch) => ({ ...state, [p.id]: p.status }),
  );
  const editable = !data.released;
  const sections = data.sections.map((s) => ({
    ...s,
    units: s.units.map((u) => ({ ...u, status: statuses[u.id] ?? u.status })),
  }));
  const flat = sections.flatMap((s) => s.units);
  const next = flat.find((u) => u.status === "pending")?.id ?? null;
  const done = flat.filter((u) => u.status !== "pending").length;

  const toggle = (u: SheetUnit) => {
    if (!editable || u.status === "flagged") return;
    const loaded = u.status !== "loaded";
    start(async () => {
      patch({ id: u.id, status: loaded ? "loaded" : "pending" });
      const res = await setUnitAction(data.id, u.id, loaded);
      if (!res.ok) toast(res.error, { tone: "warning" });
    });
  };
  return {
    sections,
    flat,
    next,
    done,
    total: flat.length,
    pending: flat.length - done,
    toggle,
    editable,
    busy: pending,
  };
}

type Sheet = ReturnType<typeof useSheet>;

export function LoadSheet({ data }: { data: LoadSheetData }) {
  const sheet = useSheet(data);
  const [flag, setFlag] = useState<{ open: boolean; unitId: string | null }>({
    open: false,
    unitId: null,
  });
  const openFlag = (unitId: string | null) => setFlag({ open: true, unitId });
  const closeFlag = () => setFlag({ open: false, unitId: null });

  return (
    <>
      <div className="flex min-h-0 flex-1 gap-5 px-6 py-5 max-lg:gap-4 max-lg:px-5 max-md:hidden">
        <div className="scroll-thin flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
          <SheetHeader data={data} sheet={sheet} />
          <PlanChange data={data} />
          {sheet.sections.map((s) => (
            <SectionCard
              key={`${s.stopSeq}-${s.temp}`}
              section={s}
              sheet={sheet}
              onFlag={openFlag}
            />
          ))}
        </div>
        <aside className="scroll-thin flex w-[300px] shrink-0 flex-col gap-3 overflow-y-auto max-lg:w-[248px]">
          <LoadMap
            sections={sheet.sections}
            free={data.free}
            capM3={data.capM3}
          />
          {data.temp !== null && <ReeferCard temp={data.temp} />}
          <ReleasePanel data={data} sheet={sheet} />
        </aside>
      </div>

      <PhoneSheet data={data} sheet={sheet} onFlag={openFlag} />

      {flag.open && (
        <>
          <div className="max-md:hidden">
            <ShortfallDialog
              sheet={data}
              unitId={flag.unitId}
              onClose={closeFlag}
            />
          </div>
          <div className="md:hidden">
            <ShortfallSheet
              sheet={data}
              unitId={flag.unitId}
              onClose={closeFlag}
            />
          </div>
        </>
      )}
    </>
  );
}

export function BackLink({
  href,
  label,
  dark,
}: {
  href: string;
  label: string;
  dark?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cx(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] transition-colors",
        dark
          ? "bg-white/12 text-fg-inverse hover:bg-white/20"
          : "border border-line bg-surface text-fg hover:bg-subtle",
      )}
    >
      <ArrowLeft size={18} strokeWidth={1.8} aria-hidden />
    </Link>
  );
}

function SheetHeader({ data, sheet }: { data: LoadSheetData; sheet: Sheet }) {
  return (
    <div className="flex items-center gap-4">
      <BackLink href="/loader" label="Back to the dock queue" />
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <h1 className="f-title">{data.vehicleId}</h1>
          <Pill
            tone={data.reefer ? "chilled" : "neutral"}
            icon={data.reefer ? ThermometerSnowflake : Package}
          >
            {data.body}
          </Pill>
        </div>
        <p className="truncate t-body text-fg-3">
          Departs {data.departs} · {data.district} ·{" "}
          {data.hasDriver ? data.driverName : "no driver assigned"}
        </p>
      </div>
      <div className="ml-auto flex shrink-0 flex-col items-end gap-1.5">
        <p className="flex items-baseline gap-1.5">
          <span className="f-title tabular-nums">{sheet.done}</span>
          <span className="f-label text-fg-3">of {sheet.total} loaded</span>
        </p>
        <div className="w-[180px] max-lg:w-[120px]">
          <Progress
            value={sheet.total ? sheet.done / sheet.total : 0}
            height={8}
          />
        </div>
      </div>
    </div>
  );
}

function PlanChange({
  data,
  compact,
}: {
  data: LoadSheetData;
  compact?: boolean;
}) {
  const [pending, start] = useTransition();
  const [acked, setAcked] = useState(false);
  const lines = changeLines(data.changeNote);
  if (!lines.length) return null;
  const shown = lines.slice(0, compact ? 3 : 5);
  const more = lines.length - shown.length;
  const list = (
    <>
      {shown.map((l) => (
        <span key={l} className="block">
          {l}
        </span>
      ))}
      {more > 0 && (
        <span className="block text-fg-3">
          and {plural(more, "more change")}
        </span>
      )}
    </>
  );
  if (data.changeAcked || acked)
    return (
      <div
        className={cx(
          "flex items-start gap-2 px-1 text-fg-3",
          compact ? "t-caption" : "t-small",
        )}
      >
        <GitCompare
          size={compact ? 14 : 15}
          strokeWidth={1.7}
          className="mt-0.5 shrink-0"
          aria-hidden
        />
        <span>
          Plan v{data.planVersion} applied: {lines[0]}
          {lines.length > 1
            ? `, and ${plural(lines.length - 1, "more change")}`
            : ""}
        </span>
      </div>
    );
  const ack = () =>
    start(async () => {
      setAcked(true);
      const res = await ackChangeAction(data.id);
      if (!res.ok) {
        setAcked(false);
        toast(res.error, { tone: "warning" });
      }
    });
  if (compact)
    return (
      <div className="flex items-center gap-2.5 rounded-xl bg-accent-tint p-3 text-accent-text">
        <GitCompare
          size={18}
          strokeWidth={1.8}
          className="shrink-0"
          aria-hidden
        />
        <p className="min-w-0 flex-1 t-small-m">{list}</p>
        <button
          type="button"
          onClick={ack}
          disabled={pending}
          className="h-8 shrink-0 rounded-lg bg-surface px-3 t-small-m transition-colors hover:bg-subtle"
        >
          Got it
        </button>
      </div>
    );
  return (
    <div className="flex items-center gap-3 rounded-xl bg-accent-tint px-4 py-3">
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-fg-inverse">
        <GitCompare size={17} strokeWidth={1.8} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="f-label text-accent-text">
          Changed in plan v{data.planVersion}
        </p>
        <p className="t-body">{list}</p>
      </div>
      <button
        type="button"
        onClick={ack}
        disabled={pending}
        className="h-8 shrink-0 rounded-lg bg-surface px-4 t-small-m text-accent-text transition-colors hover:bg-subtle"
      >
        Got it
      </button>
    </div>
  );
}

function useFold(complete: boolean) {
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? !complete;
  return { open, toggle: () => setOverride(!open) };
}

function SectionCard({
  section,
  sheet,
  onFlag,
}: {
  section: Section;
  sheet: Sheet;
  onFlag: (id: string) => void;
}) {
  const done = section.units.filter((u) => u.status !== "pending").length;
  const complete = done === section.units.length;
  const flagged = section.units.filter((u) => u.status === "flagged").length;
  const fold = useFold(complete);

  const head = (
    <>
      {complete ? (
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-success text-fg-inverse">
          <Check size={16} strokeWidth={2.2} aria-hidden />
        </span>
      ) : (
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-inverse t-subheading text-fg-inverse">
          {section.n}
        </span>
      )}
      <div className="min-w-0 text-left">
        <p className="f-label">{section.title}</p>
        <p className="t-small text-fg-3">
          {section.sub}
          {!fold.open && flagged > 0 && (
            <span className="text-warning-text"> · {flagged} flagged</span>
          )}
        </p>
      </div>
      <span className="ml-auto" />
      {requiresRefrigeration(section.temp) ? (
        <Pill tone="chilled" icon={Snowflake}>
          {TEMP_LABEL[section.temp]}
        </Pill>
      ) : (
        <Pill tone="neutral" icon={Package}>
          Ambient
        </Pill>
      )}
      <span
        className={cx(
          "f-mono whitespace-nowrap",
          complete ? "text-success-text" : "text-fg-2",
        )}
      >
        {done} / {section.units.length}
      </span>
      {complete && (
        <ChevronDown
          size={16}
          strokeWidth={1.8}
          className={cx(
            "text-fg-3 transition-transform",
            fold.open && "rotate-180",
          )}
          aria-hidden
        />
      )}
    </>
  );

  return (
    <Card className="shrink-0 overflow-hidden">
      {complete ? (
        <button
          type="button"
          aria-expanded={fold.open}
          onClick={fold.toggle}
          className="flex w-full items-center gap-3 bg-success-tint px-4 py-3"
        >
          {head}
        </button>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3">{head}</div>
      )}
      {fold.open &&
        section.units.map((u) => (
          <UnitRow key={u.id} unit={u} sheet={sheet} onFlag={onFlag} />
        ))}
    </Card>
  );
}

function UnitRow({
  unit,
  sheet,
  onFlag,
}: {
  unit: SheetUnit;
  sheet: Sheet;
  onFlag: (id: string) => void;
}) {
  const isNext = sheet.editable && unit.id === sheet.next;
  const flagged = unit.status === "flagged";
  const detail = flagged
    ? shortfallLine(unit)
    : isNext
      ? `${unit.cases} units · ${m3(unit.volumeM3)} · next to load`
      : `${unit.cases} units · ${m3(unit.volumeM3)}`;
  return (
    <div
      className={cx(
        "flex h-[52px] items-center gap-3.5 border-t border-line px-4 transition-colors",
        flagged && "bg-warning-tint",
        isNext && "bg-accent-tint",
      )}
    >
      <UnitCheck
        status={unit.status as UnitStatus}
        isNext={isNext}
        name={unit.name}
        disabled={!sheet.editable}
        onToggle={() => sheet.toggle(unit)}
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="truncate f-label">{unit.name}</span>
          <span className="t-mono text-fg-3">{unit.id}</span>
        </p>
        <p
          className={cx(
            "truncate t-small",
            flagged ? "text-warning-text" : "text-fg-3",
          )}
        >
          {detail}
        </p>
      </div>
      {unit.status !== "pending" && unit.loadedAt && (
        <span className="t-mono text-fg-3">{unit.loadedAt}</span>
      )}
      {isNext && (
        <Button
          icon={PackageCheck}
          onClick={() => sheet.toggle(unit)}
          className="max-lg:hidden"
        >
          Mark loaded
        </Button>
      )}
      {sheet.editable && unit.status !== "loaded" && (
        <button
          type="button"
          onClick={() => onFlag(unit.id)}
          aria-label={`Report a problem with ${unit.name}`}
          className={cx(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-line transition-colors hover:bg-subtle",
            flagged ? "text-warning-text" : "text-fg-2",
          )}
        >
          <Flag size={15} strokeWidth={1.8} aria-hidden />
        </button>
      )}
    </div>
  );
}

function ReeferCard({ temp }: { temp: number }) {
  const ok = temp >= 0 && temp <= 5;
  return (
    <Card className="flex items-center gap-3 p-4">
      <IconTile icon={ThermometerSnowflake} tone="chilled" size={40} />
      <div className="min-w-0 flex-1">
        <p className="f-heading">{temp.toFixed(1)} °C</p>
        <p className="t-small text-fg-3">Reefer at release</p>
      </div>
      <CircleCheck
        size={20}
        strokeWidth={1.8}
        className={ok ? "text-success" : "text-warning"}
        aria-label={ok ? "Within range" : "Out of range"}
      />
    </Card>
  );
}

function ReleasePanel({ data, sheet }: { data: LoadSheetData; sheet: Sheet }) {
  const href = `/loader/vehicles/${data.id}/release`;
  return (
    <div className="mt-auto flex flex-col gap-2 pt-3">
      {data.released ? (
        <Button
          variant="secondary"
          size="lg"
          full
          icon={CircleCheck}
          href={href}
        >
          {data.hasDriver
            ? `Released to ${data.driverName.split(" ")[0]} · ${data.releasedAt}`
            : `Released · ${data.releasedAt}`}
        </Button>
      ) : sheet.pending > 0 ? (
        <Button variant="primary" size="lg" full icon={Lock} disabled>
          Release to driver
        </Button>
      ) : (
        <Button variant="primary" size="lg" full icon={Send} href={href}>
          Release to driver
        </Button>
      )}
      <p className="text-center t-small text-fg-3">
        {data.released
          ? data.seal
            ? `Seal ${data.seal}`
            : `Handed over at ${data.releasedAt}`
          : sheet.pending > 0
            ? `${plural(sheet.pending, "unit")} left to load`
            : data.totals.flagged
              ? `All ${sheet.total} orders on board · ${plural(data.totals.flagged, "shortfall")}`
              : `All ${sheet.total} orders on board`}
      </p>
    </div>
  );
}

/* ================= L5: the same sheet on a phone ================= */

function PhoneSheet({
  data,
  sheet,
  onFlag,
}: {
  data: LoadSheetData;
  sheet: Sheet;
  onFlag: (id: string | null) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col md:hidden">
      <header className="flex shrink-0 items-center gap-2.5 border-t border-white/10 bg-inverse px-4 pt-2.5 pb-3 text-fg-inverse">
        <BackLink href="/loader" label="Back to the dock queue" dark />
        <div className="min-w-0 flex-1">
          <p className="t-subheading">
            {data.vehicleId} · Dock {data.dock}
          </p>
          <p className="truncate t-caption text-fg-inverse/55">
            Departs {data.departs} · {data.district}
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-[5px] t-caption-m">
          <Dot tone="success" />v{data.planVersion}
        </span>
      </header>

      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 pt-3.5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="flex items-baseline gap-1.5">
              <span className="f-title tabular-nums">{sheet.done}</span>
              <span className="t-small text-fg-3">
                of {sheet.total} orders loaded
              </span>
            </p>
            <Progress
              value={sheet.total ? sheet.done / sheet.total : 0}
              height={6}
            />
          </div>
          {data.temp !== null && (
            <Pill tone="chilled" icon={ThermometerSnowflake}>
              {data.temp.toFixed(1)} °C
            </Pill>
          )}
        </div>

        <PlanChange data={data} compact />

        {sheet.sections.map((s) => (
          <PhoneSection
            key={`${s.stopSeq}-${s.temp}`}
            section={s}
            sheet={sheet}
            onFlag={onFlag}
          />
        ))}

        {data.released ? (
          <Link
            href={`/loader/vehicles/${data.id}/release`}
            className="flex items-center gap-2.5 rounded-xl bg-success-tint p-3 t-small-m text-success-text"
          >
            <CircleCheck size={18} strokeWidth={1.8} aria-hidden />
            <span className="min-w-0 flex-1">
              Released at {data.releasedAt}
              {data.seal ? ` · seal ${data.seal}` : ""}
            </span>
          </Link>
        ) : (
          sheet.pending === 0 && (
            <Link
              href={`/loader/vehicles/${data.id}/release`}
              className="flex items-center gap-2.5 rounded-xl bg-success-tint p-3 t-small-m text-success-text"
            >
              <Check size={18} strokeWidth={2} aria-hidden />
              <span className="min-w-0 flex-1">
                All {sheet.total} orders on board
              </span>
              <Send size={16} strokeWidth={1.8} aria-hidden />
            </Link>
          )
        )}
      </div>

      {sheet.editable && (
        <footer className="flex shrink-0 gap-2.5 border-t border-line bg-surface px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => onFlag(sheet.next)}
            aria-label="Report a problem with a unit"
            className="inline-flex size-[46px] shrink-0 items-center justify-center rounded-xl bg-subtle text-fg transition-colors hover:bg-muted"
          >
            <Flag size={18} strokeWidth={1.8} aria-hidden />
          </button>
          {sheet.next ? (
            <Button
              variant="primary"
              size="xl"
              full
              icon={PackageCheck}
              onClick={() => {
                const u = sheet.flat.find((x) => x.id === sheet.next);
                if (u) sheet.toggle(u);
              }}
              className="min-w-0 flex-1"
            >
              <span className="truncate">
                Mark {sheet.flat.find((x) => x.id === sheet.next)?.id} loaded
              </span>
            </Button>
          ) : (
            <Button
              variant="primary"
              size="xl"
              full
              icon={Send}
              href={`/loader/vehicles/${data.id}/release`}
              className="flex-1"
            >
              Release to driver
            </Button>
          )}
        </footer>
      )}
    </div>
  );
}

function PhoneSection({
  section,
  sheet,
  onFlag,
}: {
  section: Section;
  sheet: Sheet;
  onFlag: (id: string) => void;
}) {
  const done = section.units.filter((u) => u.status !== "pending").length;
  const complete = done === section.units.length;
  const fold = useFold(complete);
  const head = (
    <>
      <span
        className={cx(
          "inline-flex size-[26px] shrink-0 items-center justify-center rounded-full text-fg-inverse",
          complete ? "bg-success" : "bg-inverse t-caption-m",
        )}
      >
        {complete ? (
          <Check size={14} strokeWidth={2.4} aria-hidden />
        ) : (
          section.n
        )}
      </span>
      <span className="min-w-0 flex-1 text-left t-small-m">
        {section.phoneTitle}
      </span>
      <span
        className={cx("t-mono", complete ? "text-success-text" : "text-fg-2")}
      >
        {done}/{section.units.length}
      </span>
      {complete && (
        <ChevronDown
          size={16}
          strokeWidth={1.8}
          className={cx(
            "text-fg-3 transition-transform",
            fold.open && "rotate-180",
          )}
          aria-hidden
        />
      )}
    </>
  );
  return (
    <section className="shrink-0 overflow-hidden rounded-[14px] border border-line bg-surface">
      {complete ? (
        <button
          type="button"
          aria-expanded={fold.open}
          onClick={fold.toggle}
          className="flex w-full items-center gap-2.5 bg-success-tint px-3.5 py-2.5"
        >
          {head}
        </button>
      ) : (
        <div className="flex items-center gap-2.5 px-3.5 py-2.5">{head}</div>
      )}
      {fold.open &&
        section.units.map((u) => (
          <PhoneUnitRow key={u.id} unit={u} sheet={sheet} onFlag={onFlag} />
        ))}
    </section>
  );
}

function PhoneUnitRow({
  unit,
  sheet,
  onFlag,
}: {
  unit: SheetUnit;
  sheet: Sheet;
  onFlag: (id: string) => void;
}) {
  const isNext = sheet.editable && unit.id === sheet.next;
  const flagged = unit.status === "flagged";
  let detail = `${unit.cases} units`;
  if (flagged && unit.shortfall)
    detail = `${unit.cases - unit.shortfall.cases} of ${unit.cases} · ${unit.shortfall.cases} ${REASON_WORD[unit.shortfall.reason] ?? unit.shortfall.reason}`;
  else if (isNext) detail = `${detail} · next to load`;
  const square =
    "inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-line transition-colors hover:bg-subtle";
  return (
    <div
      className={cx(
        "flex h-16 items-center gap-3 border-t border-line px-3.5 transition-colors",
        flagged && "bg-warning-tint",
        isNext && "bg-accent-tint",
      )}
    >
      <UnitCheck
        size="lg"
        status={unit.status as UnitStatus}
        isNext={isNext}
        name={unit.name}
        disabled={!sheet.editable}
        onToggle={() => sheet.toggle(unit)}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate f-label">{unit.name}</p>
        <p
          className={cx(
            "truncate t-caption",
            flagged ? "text-warning-text" : "text-fg-3",
          )}
        >
          <span className="t-mono-sm">{unit.id}</span> · {detail}
        </p>
      </div>
      {unit.status === "loaded" && unit.loadedAt && (
        <span className="t-mono text-fg-3">{unit.loadedAt}</span>
      )}
      {sheet.editable && unit.status !== "loaded" && (
        <button
          type="button"
          onClick={() => onFlag(unit.id)}
          aria-label={`Report a problem with ${unit.name}`}
          className={cx(
            square,
            flagged ? "bg-surface/60 text-warning-text" : "bg-surface text-fg",
          )}
        >
          <Flag size={18} strokeWidth={1.8} aria-hidden />
        </button>
      )}
    </div>
  );
}
