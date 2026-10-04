"use client";

import type { Temp } from "@relay/domain";

import { CalendarX, CircleCheck, CircleX, MoveRight, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { moveOrderAction, moveTargetsAction } from "@/app/actions/dispatch";
import { toast } from "@/components/interact";
import { Button, cx, Pill, Progress } from "@/components/ui";
import type { PlanBoardData } from "@/server/queries/dispatch";
import { field, TempPill, tap } from "./bits";

/*
 * Manual planning with validation. Open a trip to see its stops and move or
 * defer an order; every target vehicle is checked against the same rules as
 * the planner, and the blocking rule is shown for the ones that can't take it.
 */

type Lane = Extract<PlanBoardData, { lanes: unknown }>["lanes"][number];
type Trip = Lane["trips"][number];
type Deferred = Extract<
  PlanBoardData,
  { groups: unknown }
>["groups"][number]["items"][number];
type Target = {
  vehicleId: string;
  ok: boolean;
  reason?: string;
  loadM3?: number;
  capM3?: number;
};

const clock = (m: number) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.round(m) % 60).padStart(2, "0")}`;

export function TripSheet({
  planId,
  draft,
  lane,
  trip,
  orderId,
  deferred,
  onClose,
}: {
  planId: string;
  draft: boolean;
  lane: Lane | null;
  trip: Trip | null;
  orderId: string | null;
  deferred: Deferred | null;
  onClose: () => void;
}) {
  const [moving, setMoving] = useState<string | null>(orderId);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-inverse/24"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={
          trip && lane ? `${lane.id} trip ${trip.tripNo}` : "Find a slot"
        }
        tabIndex={-1}
        style={{ outline: "none" }}
        className="fixed inset-y-2 right-2 z-40 flex w-[480px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-[14px] bg-surface shadow-modal max-md:inset-0 max-md:w-full max-md:max-w-none max-md:rounded-none"
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-line px-6 pt-[18px] pb-4 max-xl:px-4 max-xl:pt-3">
          <div className="min-w-0 flex-1">
            {trip && lane ? (
              <>
                <p className="t-mono-sm text-fg-3">
                  {lane.id} · {lane.kind} · trip {trip.tripNo}
                </p>
                <h2 className="t-title">
                  {trip.district} · {trip.stops.length} stop
                  {trip.stops.length === 1 ? "" : "s"}
                </h2>
                <p className="t-small text-fg-3">
                  Leaves {clock(trip.depart)} · last stop{" "}
                  {clock(trip.lastServiceEnd)} · back {clock(trip.returnAt)}
                </p>
              </>
            ) : (
              <>
                <p className="t-mono-sm text-fg-3">{deferred?.orderId}</p>
                <h2 className="t-title">
                  Find a slot for {deferred?.outletId}
                </h2>
                <p className="t-small text-fg-3">
                  {deferred?.outlet} · {deferred?.volumeM3.toFixed(1)} m³{" "}
                  {deferred?.temp} · {deferred?.reason}
                </p>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 inline-flex size-7 items-center justify-center rounded-md text-fg-2 transition-colors hover:bg-subtle hover:text-fg max-xl:-mt-1 max-xl:-mr-2 max-xl:size-11 max-xl:rounded-[10px]"
          >
            <X size={18} strokeWidth={1.8} aria-hidden />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4 scroll-thin max-xl:px-4">
          {trip && lane && (
            <>
              <div className="grid grid-cols-3 gap-3 max-xl:gap-2">
                <Meter
                  label="Volume"
                  value={`${trip.volumeM3.toFixed(1)} of ${lane.capM3.toFixed(1)} m³`}
                  share={trip.load}
                />
                <Meter
                  label="Weight"
                  value={`${Math.round(trip.weightKg).toLocaleString("en-GB")} of ${lane.capKg.toLocaleString("en-GB")} kg`}
                  share={trip.weightShare}
                />
                <Meter
                  label="Fuel"
                  value={`${Math.round(trip.liters)} L · ${Math.round(trip.km)} km`}
                  share={lane.fuelShare}
                />
              </div>
              <ol className="flex flex-col divide-y divide-line rounded-xl border border-line">
                {trip.stops.map((st) => {
                  const late = st.arrive > st.windowClose;
                  return (
                    <li
                      key={st.seq}
                      className="flex flex-col gap-2 px-3.5 py-3"
                    >
                      <div className="flex items-center gap-2 max-xl:flex-wrap max-xl:gap-y-0.5">
                        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-inverse t-caption-m text-fg-inverse">
                          {st.seq}
                        </span>
                        <span className="min-w-0 t-small-m max-xl:flex-1">
                          {st.outletId} · {st.outlet}
                        </span>
                        <span
                          className={cx(
                            "ml-auto t-mono-sm max-xl:ml-8 max-xl:w-full",
                            late ? "text-danger-text" : "text-fg-2",
                          )}
                        >
                          {clock(st.arrive)} · {clock(st.windowOpen)}–
                          {clock(st.windowClose)}
                        </span>
                      </div>
                      {st.orderIds.map((id, i) => (
                        <div key={id} className="flex items-center gap-2 pl-8">
                          <TempPill temp={st.temps[i] as Temp} />
                          <span className="t-mono-sm text-fg-2">{id}</span>
                          {draft && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="ml-auto max-xl:h-10 max-xl:border max-xl:border-line max-xl:px-3"
                              onClick={() =>
                                setMoving(moving === id ? null : id)
                              }
                            >
                              {moving === id ? "Cancel" : "Move or defer"}
                            </Button>
                          )}
                        </div>
                      ))}
                      {st.orderIds.includes(moving ?? "") && moving && (
                        <MovePanel
                          planId={planId}
                          orderId={moving}
                          current={lane.id}
                          onDone={onClose}
                        />
                      )}
                    </li>
                  );
                })}
              </ol>
              {!draft && (
                <p className="t-caption text-fg-3">
                  Published. Re-run for a new draft to move orders.
                </p>
              )}
            </>
          )}
          {!trip && orderId && (
            <MovePanel
              planId={planId}
              orderId={orderId}
              current={null}
              onDone={onClose}
            />
          )}
        </div>
      </div>
    </>
  );
}

function Meter({
  label,
  value,
  share,
}: {
  label: string;
  value: string;
  share: number;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] bg-subtle px-3 py-2.5">
      <p className="t-caption-m text-fg-3">{label}</p>
      <p className="t-small-m">{value}</p>
      <Progress
        value={share}
        height={4}
        tone={share > 0.98 ? "warning" : "inverse"}
      />
    </div>
  );
}

function MovePanel({
  planId,
  orderId,
  current,
  onDone,
}: {
  planId: string;
  orderId: string;
  current: string | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    moveTargetsAction(planId, orderId).then((res) => {
      if (alive) setTargets(res.ok ? res.data : []);
    });
    return () => {
      alive = false;
    };
  }, [planId, orderId]);

  const apply = (target: { vehicleId: string } | { defer: string }) =>
    start(async () => {
      const res = await moveOrderAction(planId, orderId, target);
      if (!res.ok) return toast(res.error, { tone: "warning" });
      toast(
        "vehicleId" in target
          ? `Moved to ${target.vehicleId}`
          : "Deferred with your reason",
        { detail: `Draft v${res.data.version}`, tone: "success" },
      );
      onDone();
      router.refresh();
    });

  const ok = targets?.filter((t) => t.ok) ?? [];
  const blocked = targets?.filter((t) => !t.ok) ?? [];
  return (
    <div className="flex flex-col gap-3 rounded-[10px] bg-subtle p-3">
      <p className="t-caption-m text-fg-3">Move {orderId} to</p>
      {targets === null ? (
        <p className="t-small text-fg-3">Checking vehicles…</p>
      ) : (
        <>
          {ok.length === 0 && (
            <p className="t-small text-fg-2">
              No vehicle can take it without breaking a rule.
            </p>
          )}
          <ul className="flex flex-col gap-1.5">
            {ok.slice(0, 6).map((t) => (
              <li
                key={t.vehicleId}
                className="flex items-center gap-2 rounded-lg bg-surface px-2.5 py-2"
              >
                <CircleCheck
                  size={14}
                  strokeWidth={1.8}
                  className="shrink-0 text-success"
                  aria-hidden
                />
                <span className="t-mono">{t.vehicleId}</span>
                <span className="t-caption text-fg-2">
                  fits · {t.loadM3?.toFixed(1)} of {t.capM3?.toFixed(1)} m³
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={MoveRight}
                  disabled={pending}
                  className="ml-auto max-xl:h-10 max-xl:px-3"
                  onClick={() => apply({ vehicleId: t.vehicleId })}
                >
                  Move
                </Button>
              </li>
            ))}
          </ul>
          {blocked.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer t-caption-m text-fg-2">
                {blocked.length} vehicle{blocked.length === 1 ? "" : "s"} can’t
                take it
              </summary>
              <ul className="mt-1.5 flex flex-col gap-1">
                {blocked.slice(0, 12).map((t) => (
                  <li
                    key={t.vehicleId}
                    className="flex items-start gap-2 t-caption text-danger-text"
                  >
                    <CircleX
                      size={13}
                      strokeWidth={1.8}
                      className="mt-px shrink-0 text-danger"
                      aria-hidden
                    />
                    <span className="t-mono-sm text-fg-2">{t.vehicleId}</span>
                    {t.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      {current !== null && (
        <div className="flex flex-col gap-1.5 border-t border-line pt-3">
          <label className="flex flex-col gap-1.5">
            <span className="t-caption-m text-fg-2">
              Or defer it, with a reason the store will see
            </span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why this order can wait"
              className={field}
            />
          </label>
          <Button
            size="sm"
            variant="secondary"
            icon={CalendarX}
            disabled={pending || reason.trim().length < 4}
            onClick={() => apply({ defer: reason })}
            className={cx(tap, "self-start max-xl:self-stretch")}
          >
            Defer
          </Button>
        </div>
      )}
      {pending && <Pill tone="accent">Re-fitting the plan</Pill>}
    </div>
  );
}
