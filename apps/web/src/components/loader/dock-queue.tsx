"use client";

import { CircleCheck, ListChecks, Play, Send, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startLoadingAction } from "@/app/actions/dock";
import { toast } from "@/components/interact";
import { Button, cx } from "@/components/ui";
import type { DockCard } from "@/server/queries/dock";
import { changeSummary } from "./format";
import { VehicleCard } from "./vehicle-card";

type Tab = "toLoad" | "released" | "all";

/* Card actions: 40px on the dock screen, 46px on a phone. */
const ACTION = "max-md:h-[46px] max-md:flex-1";

const done = (text: string) => (
  <span className="inline-flex h-10 min-w-0 items-center gap-2 rounded-[10px] bg-success-tint px-4 t-body-m text-success-text max-md:h-[46px]">
    <CircleCheck size={16} strokeWidth={1.8} className="shrink-0" aria-hidden />
    <span className="truncate">{text}</span>
  </span>
);

export function DockQueue({
  cards,
  dayLabel,
  window,
  version,
}: {
  cards: DockCard[];
  dayLabel: string;
  window: string | null;
  version: number | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const toLoad = cards.filter((c) => !c.released);
  const released = cards.filter((c) => c.released);
  const [tab, setTab] = useState<Tab>(toLoad.length ? "toLoad" : "all");

  const shown = [
    ...(tab === "toLoad" ? toLoad : tab === "released" ? released : cards),
  ].sort((a, b) => a.departs.localeCompare(b.departs) || a.tripNo - b.tripNo);

  const startLoading = (c: DockCard) => {
    setBusy(c.id);
    start(async () => {
      const res = await startLoadingAction(c.id);
      setBusy(null);
      if (!res.ok) return toast(res.error, { tone: "warning" });
      router.push(`/loader/vehicles/${c.id}`);
    });
  };

  const actionFor = (c: DockCard) => {
    if (c.released)
      return done(
        c.accepted ? `Accepted by ${c.driver}` : `Released to ${c.driver}`,
      );
    if (c.allLoaded)
      return (
        <Button
          variant="primary"
          size="lg"
          icon={Send}
          href={`/loader/vehicles/${c.id}/release`}
          className={ACTION}
        >
          Release vehicle
        </Button>
      );
    if (c.started)
      return (
        <Button
          variant="primary"
          size="lg"
          icon={ListChecks}
          href={`/loader/vehicles/${c.id}`}
          className={ACTION}
        >
          Continue loading
        </Button>
      );
    return (
      <Button
        variant="primary"
        size="lg"
        icon={Play}
        disabled={pending && busy === c.id}
        onClick={() => startLoading(c)}
        className={ACTION}
      >
        {pending && busy === c.id ? "Starting" : "Start loading"}
      </Button>
    );
  };

  const counts: Record<Tab, number> = {
    toLoad: toLoad.length,
    released: released.length,
    all: cards.length,
  };

  if (!cards.length)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-subtle text-fg-2">
          <Truck size={22} strokeWidth={1.7} aria-hidden />
        </span>
        <h1 className="f-heading">No trips to load</h1>
        <p className="max-w-[36ch] t-body text-fg-3">
          Vehicles for {dayLabel} appear here once dispatch publishes the plan.
        </p>
      </div>
    );

  return (
    <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-7 py-6 max-md:gap-4 max-md:px-4 max-md:py-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="f-title">Vehicles to load</h1>
          <p className="t-body text-fg-3">
            {dayLabel}
            {window ? ` · departures ${window}` : ""}
            {version ? ` · plan v${version}` : ""}
          </p>
        </div>
        <div className="ml-auto flex rounded-xl bg-muted p-1 max-md:ml-0 max-md:w-full">
          {(
            [
              ["toLoad", "To load"],
              ["released", "Released"],
              ["all", "All"],
            ] as const
          ).map(([key, label]) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => setTab(key)}
                className={cx(
                  "flex h-9 items-center justify-center gap-2 rounded-[10px] px-[18px] f-label transition-colors max-md:h-10 max-md:flex-1 max-md:px-2",
                  active
                    ? "bg-surface text-fg shadow-card"
                    : "text-fg-2 hover:text-fg",
                )}
              >
                {label}
                <span
                  className={cx(
                    "rounded-full px-2 py-px t-mono",
                    active ? "bg-inverse text-fg-inverse" : "text-fg-2",
                  )}
                >
                  {counts[key]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {shown.length > 0 ? (
        <div className="grid grid-cols-3 gap-4 max-xl:grid-cols-2 max-md:grid-cols-1 max-md:gap-3">
          {shown.map((c) => (
            <VehicleCard
              key={c.id}
              vehicleId={
                c.tripNo > 1 ? `${c.vehicleId} · T${c.tripNo}` : c.vehicleId
              }
              reefer={c.reefer}
              body={c.body}
              departs={c.departs}
              eta={c.eta}
              urgent={c.urgent}
              brand={c.brand}
              route={c.route}
              tempPill={c.temp !== null ? `${c.temp.toFixed(1)} °C` : null}
              banner={
                c.banner
                  ? `Plan v${version ?? ""}: ${changeSummary(c.banner)}`
                  : null
              }
              status={c.status}
              progress={c.progress}
              progressTone={c.released || c.allLoaded ? "success" : "inverse"}
              dock={c.dock}
              action={actionFor(c)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-line-strong px-4 py-10 text-center">
          <p className="t-body-m">
            {tab === "released" ? "Nothing released yet" : "All released"}
          </p>
          <p className="t-small text-fg-3">
            {tab === "released"
              ? `No vehicle has left the dock for ${dayLabel}.`
              : `Every vehicle for ${dayLabel} has left the dock.`}
          </p>
        </div>
      )}
    </div>
  );
}
