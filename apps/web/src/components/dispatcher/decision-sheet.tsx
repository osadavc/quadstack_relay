"use client";

import {
  ArrowLeftRight,
  Bell,
  CalendarX,
  CircleCheck,
  CircleX,
  Info,
  Route,
  ShieldCheck,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { decideAction } from "@/app/actions/dispatch";
import { toast } from "@/components/interact";
import { Button, cx, Pill } from "@/components/ui";
import type { DecisionData } from "@/server/queries/dispatch";
import { tap } from "./bits";

/* The fairness guard's decision, over the plan board. */

type Option = DecisionData["options"][number];
type Choice = { kind: "swap" | "redirect"; index: number } | { kind: "defer" };

export function DecisionSheet({
  d,
  userName,
}: {
  d: DecisionData;
  userName: string;
}) {
  const router = useRouter();
  const swaps = d.options.filter(
    (o): o is Extract<Option, { kind: "swap" }> => o.kind === "swap",
  );
  const redirects = d.options.filter(
    (o): o is Extract<Option, { kind: "redirect" }> => o.kind === "redirect",
  );
  const adds = d.options.filter(
    (o): o is Extract<Option, { kind: "add" }> => o.kind === "add",
  );
  const firstFeasible: Choice =
    swaps.findIndex((o) => o.feasible) >= 0
      ? { kind: "swap", index: swaps.findIndex((o) => o.feasible) }
      : redirects.findIndex((o) => o.feasible) >= 0
        ? { kind: "redirect", index: redirects.findIndex((o) => o.feasible) }
        : { kind: "defer" };
  const [choice, setChoice] = useState<Choice>(firstFeasible);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDialogElement>(null);
  const close = () => router.push("/dispatcher/plan");

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && router.push("/dispatcher/plan");
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const outlet = d.outlet;
  const same = (c: Choice) =>
    c.kind === choice.kind &&
    ("index" in c ? "index" in choice && c.index === choice.index : true);
  const needsReason = choice.kind === "defer" && reason.trim().length < 4;

  const apply = () =>
    start(async () => {
      const res = await decideAction(
        d.id,
        choice.kind === "defer" ? { kind: "defer", reason } : choice,
      );
      if (!res.ok) return toast(res.error, { tone: "warning" });
      toast(
        choice.kind === "defer"
          ? "Deferred with your reason"
          : choice.kind === "swap"
            ? "Swap applied"
            : "Trip redirected",
        { detail: `Draft v${res.data.version}`, tone: "success" },
      );
      router.push("/dispatcher/plan");
      router.refresh();
    });

  const chosenSwap = choice.kind === "swap" ? swaps[choice.index] : null;
  const chosenRedirect =
    choice.kind === "redirect" ? redirects[choice.index] : null;
  const preview =
    choice.kind === "defer"
      ? {
          who: `${outlet?.name}’s store manager will see`,
          text: `Your order moves to ${d.nextRunLabel}. It’s protected and goes first. Anything else still arrives as planned.`,
        }
      : chosenSwap
        ? {
            who: `${chosenSwap.with.name}’s store manager will see`,
            text: `Your order moves to ${d.nextRunLabel}, first fridge trip. ${outlet?.name} was skipped on the last run and takes your slot on ${d.dayLabel}.`,
          }
        : chosenRedirect?.displacedNamed.length
          ? {
              who: `${chosenRedirect.displacedNamed.map((x) => x.name).join(", ")} will see`,
              text: `Your order moves to ${d.nextRunLabel}. A truck was sent to outlets that went without on the last run.`,
            }
          : {
              who: `${outlet?.name}’s store manager will see`,
              text: `Your order for ${d.dayLabel} is back on the plan, with an arrival time.`,
            };

  return (
    <>
      <button
        type="button"
        aria-label="Close decision"
        onClick={close}
        className="fixed inset-0 z-40 cursor-default bg-inverse/32"
      />
      <dialog
        ref={ref}
        open
        aria-labelledby="decision-title"
        tabIndex={-1}
        className="fixed inset-y-2 right-2 left-auto z-40 m-0 flex h-auto max-h-none w-[540px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-[14px] bg-surface p-0 text-fg shadow-modal outline-none max-md:inset-0 max-md:w-full max-md:max-w-none max-md:rounded-none"
      >
        <div className="flex shrink-0 flex-col gap-2.5 border-b border-line px-6 pt-[18px] pb-4 max-xl:px-4 max-xl:pt-2.5">
          <div className="flex items-center gap-2">
            <Pill tone="warning" icon={ShieldCheck} size="sm">
              Fairness guard
            </Pill>
            <span className="t-mono-sm text-fg-3">{d.id}</span>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="-my-1 -mr-1 ml-auto inline-flex size-7 items-center justify-center rounded-md text-fg-2 transition-colors hover:bg-subtle hover:text-fg max-xl:-mr-2 max-xl:size-11 max-xl:rounded-[10px]"
            >
              <X size={18} strokeWidth={1.8} aria-hidden />
            </button>
          </div>
          <h2 id="decision-title" className="t-title">
            {outlet?.id} · {outlet?.name} would be skipped{" "}
            {d.skips >= 2 ? "again" : "twice"}
          </h2>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pt-4 pb-3 scroll-thin max-xl:px-4">
          <dl className="grid grid-cols-[max-content_1fr_1fr] gap-x-6 max-xl:grid-cols-2 max-xl:gap-y-2.5">
            <Fact label="Order" wide>
              {d.orderId} · {d.order?.volumeM3.toFixed(1)} m³ {d.order?.temp}
            </Fact>
            <Fact label="Window">{outlet?.window}</Fact>
            <Fact label="Last delivery" tone="warning">
              {d.lastDelivery}
            </Fact>
          </dl>

          <div className="flex flex-col gap-2 rounded-[10px] bg-subtle p-3.5">
            <div className="flex items-center gap-2">
              <Info
                size={14}
                strokeWidth={1.8}
                className="shrink-0 text-fg-2"
                aria-hidden
              />
              <p className="t-small-m">Why the planner deferred it</p>
              {d.closest && (
                <span className="ml-auto t-mono-sm text-fg-3">
                  {d.closest.vehicleId} · T{d.closest.tripNo}{" "}
                  {d.closest.district}
                </span>
              )}
            </div>
            {d.closest ? (
              <>
                <OverflowBar
                  load={d.closest.loadM3}
                  add={d.order?.volumeM3 ?? 0}
                  cap={d.closest.capacityM3}
                />
                <p className="t-small text-fg-2">
                  The {d.closest.district} trip is {d.closest.loadM3.toFixed(1)}{" "}
                  of {d.closest.capacityM3.toFixed(1)} m³ full.{" "}
                  {d.order?.volumeM3.toFixed(1)} m³ won’t fit, and every other
                  reefer is at its limit.
                </p>
              </>
            ) : (
              <p className="t-small text-fg-2">
                No reefer trip goes to {outlet?.district} on {d.dayLabel}. Every
                reefer is at its two-trip limit or can’t reach{" "}
                {outlet?.district} before the window closes.
              </p>
            )}
          </div>

          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-2.5 t-caption-m text-fg-3">Options</legend>
            {swaps.map((o, i) => (
              <OptionCard
                key={`s${o.withOrderId}`}
                selected={same({ kind: "swap", index: i })}
                onSelect={() => setChoice({ kind: "swap", index: i })}
                disabled={!o.feasible}
                icon={ArrowLeftRight}
                title={`Swap with ${o.with.id} · ${o.with.name}`}
                badge={
                  o.recommended ? (
                    <Pill tone="accent" size="sm" className="ml-auto">
                      Recommended
                    </Pill>
                  ) : null
                }
              >
                <p className="t-small text-fg-2">
                  Same trip on {o.vehicleId}. {o.with.name} was served on the
                  last run. Its {o.with.volume.toFixed(1)} m³ moves to{" "}
                  {d.nextRunLabel}.
                </p>
                {o.checks.map((c) => (
                  <Check key={c.text} ok={c.ok}>
                    {c.text}
                  </Check>
                ))}
              </OptionCard>
            ))}
            {redirects.map((o, i) => (
              <OptionCard
                key={`r${o.vehicleId}`}
                selected={same({ kind: "redirect", index: i })}
                onSelect={() => setChoice({ kind: "redirect", index: i })}
                disabled={!o.feasible}
                icon={Route}
                title={`Send ${o.vehicleId} to ${outlet?.district} instead`}
                badge={
                  o.recommended ? (
                    <Pill tone="accent" size="sm" className="ml-auto">
                      Recommended
                    </Pill>
                  ) : null
                }
              >
                <p className="t-small text-fg-2">
                  {o.vehicleId} drops {o.fromDistricts.join(" and ")} and serves{" "}
                  {o.servesNamed.map((x) => `${x.id} ${x.name}`).join(", ")}.
                </p>
                {o.checks.map((c) => (
                  <Check key={c.text} ok={c.ok}>
                    {c.text}
                  </Check>
                ))}
              </OptionCard>
            ))}
            {adds.map((o) => (
              <OptionCard
                key={`a${o.vehicleId}`}
                selected={false}
                onSelect={() => {}}
                disabled
                icon={CircleX}
                title={`Add to ${o.vehicleId}`}
              >
                <p className="t-small text-fg-2">Not possible.</p>
                {o.checks.map((c) => (
                  <Check key={c.text} ok={c.ok}>
                    {c.text}
                  </Check>
                ))}
              </OptionCard>
            ))}
            <OptionCard
              selected={choice.kind === "defer"}
              onSelect={() => setChoice({ kind: "defer" })}
              icon={CalendarX}
              title="Defer again, with a reason"
            >
              <p className="t-small text-fg-2">
                {outlet?.name} goes another run without. The area manager is
                copied, and the order is protected on {d.nextRunLabel}.
              </p>
              {choice.kind === "defer" && (
                <label className="mt-1 flex flex-col gap-1.5">
                  <span className="t-caption-m text-fg-2">
                    Reason for the area manager
                  </span>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    placeholder={`Why ${outlet?.name} can wait another run`}
                    className="resize-none rounded-lg border border-line-strong bg-surface px-2.5 py-2 t-small text-fg outline-none placeholder:text-fg-3 focus:border-accent max-xl:text-[16px]"
                  />
                </label>
              )}
            </OptionCard>
          </fieldset>
          {/* On a phone the preview scrolls with the options. */}
          <Preview
            who={preview.who}
            text={preview.text}
            className="xl:hidden"
          />
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t border-line bg-subtle px-6 pt-3.5 pb-[18px] max-xl:gap-2 max-xl:px-4 max-xl:pt-2.5 max-xl:pb-4">
          <Preview
            who={preview.who}
            text={preview.text}
            className="max-xl:hidden"
          />
          <div className="flex items-center gap-2 max-xl:flex-wrap">
            <p className="t-caption text-fg-3 max-xl:w-full">
              Logged as {userName} · {d.clock}
            </p>
            <Button
              variant="secondary"
              className={cx(tap, "ml-auto max-xl:ml-0 max-xl:flex-1")}
              onClick={close}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={
                choice.kind === "defer"
                  ? CalendarX
                  : choice.kind === "swap"
                    ? ArrowLeftRight
                    : Route
              }
              disabled={needsReason || pending}
              onClick={apply}
              className={cx(tap, "max-xl:flex-[2]")}
            >
              {pending
                ? "Applying"
                : choice.kind === "defer"
                  ? "Defer again"
                  : choice.kind === "swap"
                    ? "Apply swap"
                    : "Redirect trip"}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}

function Preview({
  who,
  text,
  className,
}: {
  who: string;
  text: string;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex items-start gap-2.5 rounded-[10px] border border-line bg-surface p-3",
        className,
      )}
    >
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent-text">
        <Bell size={14} strokeWidth={1.8} aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="t-caption-m text-fg-3">{who}</p>
        <p className="t-small">{text}</p>
      </div>
    </div>
  );
}

function OverflowBar({
  load,
  add,
  cap,
}: {
  load: number;
  add: number;
  cap: number;
}) {
  const total = Math.max(cap, load + add) * 1.03;
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div
      className="relative h-2.5 w-full"
      role="img"
      aria-label={`Trip holds ${load.toFixed(1)} of ${cap.toFixed(1)} m³; adding ${add.toFixed(1)} m³ overflows`}
    >
      <span className="absolute top-px left-0 h-2 w-full rounded-[4px] bg-muted" />
      <span
        className="absolute top-px left-0 h-2 rounded-l-[4px] bg-chilled"
        style={{ width: pct(load) }}
      />
      <span
        className="absolute top-px h-2 bg-danger"
        style={{ left: pct(load), width: pct(add) }}
      />
      <span
        className="absolute top-0 h-2.5 w-0.5 bg-fg"
        style={{ left: pct(cap) }}
      />
    </div>
  );
}

function Fact({
  label,
  tone,
  wide,
  children,
}: {
  label: string;
  tone?: "warning";
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        "flex min-w-0 flex-col gap-0.5",
        wide && "max-xl:col-span-2",
      )}
    >
      <dt className="t-caption text-fg-3">{label}</dt>
      <dd
        className={cx(
          "t-small-m",
          tone === "warning" ? "text-warning-text" : "text-fg",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

function Check({ ok, children }: { ok?: boolean; children: ReactNode }) {
  const Icon = ok ? CircleCheck : CircleX;
  return (
    <p
      className={cx(
        "flex items-start gap-2 t-small",
        ok ? "text-fg-2" : "text-danger-text",
      )}
    >
      <Icon
        size={14}
        strokeWidth={1.8}
        className={cx("mt-[3px] shrink-0", ok ? "text-success" : "text-danger")}
        aria-hidden
      />
      {children}
    </p>
  );
}

function OptionCard({
  selected,
  onSelect,
  title,
  badge,
  disabled,
  icon: _icon,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  badge?: ReactNode;
  disabled?: boolean;
  icon?: unknown;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        "rounded-xl transition-colors",
        selected
          ? "border-[1.5px] border-accent bg-accent-tint p-[15.5px]"
          : "border border-line bg-surface p-4",
      )}
    >
      <label
        className={cx(
          "flex items-center gap-2.5",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <input
          type="radio"
          name="decision-option"
          checked={selected}
          disabled={disabled}
          onChange={onSelect}
          className="peer sr-only"
        />
        <span
          className={cx(
            "size-[18px] shrink-0 rounded-full bg-surface transition-[border] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
            selected
              ? "border-[5px] border-accent"
              : "border-[1.5px] border-line-strong",
          )}
          aria-hidden
        />
        <span className={cx("t-body-m", disabled ? "text-fg-3" : "text-fg")}>
          {title}
        </span>
        {badge}
      </label>
      <div className="mt-2.5 flex flex-col gap-1.5 pl-7">{children}</div>
    </div>
  );
}
