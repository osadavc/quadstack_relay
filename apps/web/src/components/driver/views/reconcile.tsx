"use client";

import { cmpOps, hhmm } from "@relay/domain";
import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  CloudCheck,
  GitCompare,
  MessageSquare,
  PackageCheck,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import { useState } from "react";
import { cx } from "@/components/ui";
import { useNav } from "@/lib/driver/nav";
import {
  browserOnline,
  nowAt,
  useDriver,
  useOffline,
  useView,
} from "@/lib/driver/store";
import {
  ActionButton,
  DriverScreen,
  ListHeader,
  OfflineBanner,
  records,
} from "../frame";
import { FeedRow } from "../parts";
import { useNextAction } from "./outbox";

type Choice = "after_handover" | "intact";

function ChoiceOption({
  value,
  title,
  detail,
  checked,
  onSelect,
}: {
  value: Choice;
  title: string;
  detail: string;
  checked: boolean;
  onSelect: (v: Choice) => void;
}) {
  return (
    <label
      className={cx(
        "flex cursor-pointer items-center gap-3 rounded-[14px] border px-3.5 py-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
        checked
          ? "border-accent bg-accent-tint ring-1 ring-accent ring-inset"
          : "border-line bg-surface hover:bg-subtle",
      )}
    >
      <input
        type="radio"
        name="reconcile"
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        className="sr-only"
      />
      <span
        className={cx(
          "size-5 shrink-0 rounded-full bg-surface transition-[border-width,border-color]",
          checked
            ? "border-[6px] border-accent"
            : "border-[1.5px] border-line-strong",
        )}
        aria-hidden
      />
      <span className="flex min-w-0 flex-col">
        <span className="f-label">{title}</span>
        <span className="t-caption text-fg-3">{detail}</span>
      </span>
    </label>
  );
}

/** What went out, then settle any difference with the store's count. */
export function ReconcileView() {
  const { view } = useView();
  const offline = useOffline();
  const sync = useDriver((s) => s.sync);
  const syncing = useDriver((s) => s.syncing);
  const waiting = useDriver((s) => s.outbox.length);
  const sent = useDriver((s) => s.sent);
  const lastSync = useDriver((s) => s.lastSync);
  const record = useDriver((s) => s.record);
  const go = useNav((s) => s.go);
  const [choice, setChoice] = useState<Choice | null>(null);
  const action = useNextAction(view.run);

  if (offline) {
    return (
      <DriverScreen
        gap="gap-3.5"
        back={{ label: "Run", to: "/driver" }}
        footer={
          <ActionButton
            variant="primary"
            icon={RefreshCw}
            disabled={syncing || !browserOnline()}
            onClick={() => void sync()}
          >
            Try again
          </ActionButton>
        }
      >
        <OfflineBanner />
        <section className="flex w-full flex-col gap-3 rounded-[20px] bg-subtle p-[18px]">
          <div className="flex items-center gap-3">
            <span
              className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-fg-2"
              aria-hidden
            >
              <WifiOff size={22} strokeWidth={1.8} />
            </span>
            <div className="flex min-w-0 flex-col">
              <h1 className="f-heading">Still offline</h1>
              <p className="t-small text-fg-2">
                {waiting > 0
                  ? `${records(waiting)} waiting on this phone`
                  : "Nothing waiting on this phone"}
              </p>
            </div>
          </div>
        </section>
      </DriverScreen>
    );
  }

  const stops = view.run?.stops ?? [];
  const open = view.reconciliations.find((r) => r.status === "open");
  const settled = [...view.reconciliations]
    .reverse()
    .find((r) => r.status === "resolved");
  const stopOf = (orderId: string) =>
    stops.find((s) => s.orders.some((o) => o.id === orderId));
  const openStop = open ? stopOf(open.orderId) : undefined;
  const openReceipt = openStop?.orders.find(
    (o) => o.id === open?.orderId,
  )?.received;
  const delivered = stops.filter((s) => s.status === "completed");
  const allReceived =
    delivered.length > 0 &&
    delivered.every((s) => s.orders.every((o) => o.received));
  const pendingStore = delivered.find((s) => s.orders.some((o) => !o.received));

  const confirm = () => {
    if (!open || !choice) return;
    const at = nowAt();
    record("reconcile", {
      at,
      payload: { orderId: open.orderId, resolution: choice },
      title: `Settled · ${open.orderId}`,
      detail: `${hhmm(at)} · ${choice === "intact" ? "handed over intact, dispatch reviews" : "damaged after handover"}`,
    });
    setChoice(null);
  };

  // Updates from other roles while the phone was quiet.
  const feed = [
    ...view.messages.map((m) => ({
      key: m.id,
      at: m.at,
      icon: MessageSquare,
      tone: "accent" as const,
      title: m.text,
      detail: `From ${m.from.split(" ")[0]}`,
    })),
    ...stops.flatMap((s) =>
      s.orders
        .filter((o) => o.received)
        .map((o) => ({
          key: `r-${o.id}`,
          at: o.received?.at ?? "",
          icon: PackageCheck,
          tone: "success" as const,
          title: `${s.outletId} confirmed receipt`,
          detail: `${o.received?.count} of ${o.loaded} counted · ${o.id}`,
        })),
    ),
  ].sort((a, b) => cmpOps(b.at, a.at));

  return (
    <DriverScreen
      gap="gap-3.5"
      back={{ label: "Run", to: "/driver" }}
      footer={
        open ? (
          <ActionButton
            variant="primary"
            icon={ArrowRight}
            disabled={!choice}
            onClick={confirm}
          >
            Confirm
          </ActionButton>
        ) : action ? (
          <ActionButton
            variant="primary"
            icon={action.icon}
            onClick={action.onClick}
          >
            <span className="truncate">{action.label}</span>
          </ActionButton>
        ) : (
          <ActionButton
            variant="secondary"
            icon={ArrowLeft}
            onClick={() => go("/driver")}
          >
            Back to the run
          </ActionButton>
        )
      }
    >
      <div className="flex w-full items-center gap-3 rounded-[14px] bg-success-tint px-3.5 py-3">
        <CloudCheck
          size={20}
          strokeWidth={1.7}
          className="shrink-0 text-success-text"
          aria-hidden
        />
        <div className="flex min-w-0 flex-col">
          <h1 className="t-small-m text-success-text">
            {waiting
              ? `Online · sending ${records(waiting)}`
              : sent
                ? `Online · ${records(sent.count)} sent ${hhmm(sent.at)}`
                : "Online · all records sent"}
          </h1>
          <p className="t-caption text-fg-2">
            Synced {lastSync ? hhmm(lastSync) : ""}
          </p>
        </div>
      </div>

      {open ? (
        <section className="flex w-full flex-col gap-3 rounded-[18px] border border-line bg-surface p-4">
          <p className="flex items-center gap-2 f-label text-warning-text">
            <GitCompare size={18} strokeWidth={1.7} aria-hidden />
            Count difference on {open.orderId}
          </p>
          <p className="f-body-m">
            {openStop?.outletId ?? "The store"} counted {open.storeCount}
            {openReceipt ? ` at ${hhmm(openReceipt.at)}` : ""}. You recorded{" "}
            {open.driverCount} at handover.
          </p>
          <div className="flex items-center gap-2 rounded-xl bg-subtle p-2.5">
            <span
              className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-fg-2"
              aria-hidden
            >
              <MessageSquare size={18} strokeWidth={1.7} />
            </span>
            <div className="flex min-w-0 flex-col">
              <p className="t-small">
                {open.storeNote
                  ? `${openStop?.receiver?.split(" ")[0] ?? "Store"}: “${open.storeNote}”`
                  : "No note from the store"}
              </p>
              <p className="t-caption text-fg-3">
                Your photo and signature are on the record
              </p>
            </div>
          </div>
          <fieldset className="flex min-w-0 flex-col gap-3">
            <legend className="sr-only">What happened to the units?</legend>
            <ChoiceOption
              value="after_handover"
              title="Happened after handover"
              detail="Damaged at the store, nothing more to do"
              checked={choice === "after_handover"}
              onSelect={setChoice}
            />
            <ChoiceOption
              value="intact"
              title={`Handed over ${open.driverCount} intact`}
              detail="Dispatch reviews your photo"
              checked={choice === "intact"}
              onSelect={setChoice}
            />
          </fieldset>
        </section>
      ) : settled ? (
        <section className="flex w-full flex-col gap-2 rounded-[18px] border border-line bg-surface p-4">
          <p className="flex items-center gap-2 f-label text-success-text">
            <CircleCheck size={18} strokeWidth={1.7} aria-hidden />
            Settled with {stopOf(settled.orderId)?.outletId ?? "the store"}
          </p>
          <p className="f-body-m">
            {settled.resolution === "intact"
              ? `You handed over ${settled.driverCount} intact. Dispatch reviews your photo and signature.`
              : "Recorded as damaged after handover. Nothing more to do."}
          </p>
          <p className="t-caption text-fg-3">Added to the delivery record.</p>
        </section>
      ) : (
        <section className="flex w-full items-start gap-3 rounded-[18px] border border-line bg-surface p-4">
          <CircleCheck
            size={20}
            strokeWidth={1.7}
            className="mt-0.5 shrink-0 text-success-text"
            aria-hidden
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="f-label">
              {allReceived ? "Everything matches" : "Everything matches so far"}
            </p>
            <p className="t-small text-fg-2">
              {allReceived
                ? "Every store counted the same as your handover."
                : pendingStore
                  ? `Waiting for ${pendingStore.outletId} to confirm receipt.`
                  : "Nothing handed over yet."}
            </p>
          </div>
        </section>
      )}

      <section className="w-full overflow-hidden rounded-2xl border border-line bg-surface">
        <ListHeader>Latest updates</ListHeader>
        {feed.length === 0 ? (
          <p className="border-t border-line px-3.5 py-3 t-small text-fg-3">
            Nothing new from dispatch or the stores
          </p>
        ) : (
          <ul>
            {feed.slice(0, 6).map((f) => (
              <FeedRow
                key={f.key}
                icon={f.icon}
                tone={f.tone}
                title={f.title}
                time={f.at ? hhmm(f.at) : ""}
                detail={f.detail}
              />
            ))}
          </ul>
        )}
      </section>
    </DriverScreen>
  );
}
