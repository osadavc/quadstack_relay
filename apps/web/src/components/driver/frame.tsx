"use client";

import { hhmm, TEMP_LABEL } from "@relay/domain";
import {
  ArrowLeft,
  ChevronRight,
  CloudOff,
  ThermometerSnowflake,
  Truck,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { AccountMenu } from "@/components/account-menu";
import { RelayMark } from "@/components/brand";
import { useDisclosure } from "@/components/interact";
import { Button, cx, Dot } from "@/components/ui";
import { useNav } from "@/lib/driver/nav";
import { useDriver, useOffline, useView } from "@/lib/driver/store";
import type { StopOrder } from "@/lib/driver/types";
import { ConnectionSheet } from "./connection";

export type Account = { name: string; title: string; email: string };

/* "1 record", "3 records" */
export const records = (n: number) => `${n} record${n === 1 ? "" : "s"}`;

const UNIT_WORD: Record<string, [string, string]> = {
  chilled: ["chilled order", "chilled orders"],
  frozen: ["frozen order", "frozen orders"],
  ambient: ["ambient order", "ambient orders"],
};
export const unitsLabel = (o: Pick<StopOrder, "unitCount" | "unitKind">) => {
  const [one, many] = UNIT_WORD[o.unitKind] ?? ["order", "orders"];
  return `${o.unitCount} ${o.unitCount === 1 ? one : many}`;
};
export const orderKind = (o: Pick<StopOrder, "temp" | "brand">) =>
  o.brand === "Fresh" ? TEMP_LABEL[o.temp] : o.brand;
export const casesWord = (_o: Pick<StopOrder, "brand">) => "units";

/** The main action at the foot of a screen: 46 px on a phone, 40 px from tablet up. */
export function ActionButton({
  className,
  ...props
}: ComponentProps<typeof Button>) {
  return (
    <Button
      size="xl"
      full
      className={cx("md:h-10 md:rounded-[10px]", className)}
      {...props}
    />
  );
}

/** Sync state. Tapping it opens the connection sheet. */
function SyncState() {
  const offline = useOffline();
  const saved = useDriver((s) => s.outbox.length);
  const lastSync = useDriver((s) => s.lastSync);
  const sheet = useDisclosure();
  return (
    <>
      <button
        type="button"
        onClick={sheet.onOpen}
        aria-live="polite"
        aria-label="Connection and sync"
        className="shrink-0"
      >
        {offline ? (
          <span className="flex items-center gap-1.5 rounded-full bg-warning-tint px-2.5 py-1.5 t-caption-m text-warning-text">
            <CloudOff size={14} strokeWidth={1.7} aria-hidden />
            Offline{saved > 0 ? ` · ${saved} saved` : ""}
          </span>
        ) : saved > 0 ? (
          <span className="flex items-center gap-1.5 rounded-full bg-subtle px-2.5 py-1.5 t-caption-m text-fg-2">
            <Dot tone="warning" pulse />
            Sending {saved}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 rounded-full bg-subtle px-2.5 py-1.5 t-caption-m text-fg-2">
            <Dot tone="success" />
            Synced {lastSync ? hhmm(lastSync) : ""}
          </span>
        )}
      </button>
      <ConnectionSheet open={sheet.open} onClose={sheet.onClose} />
    </>
  );
}

/**
 * The app header. On a phone: vehicle, sync state and the account menu. From
 * tablet width up it becomes a full-width bar with the Relay mark.
 */
export function DriverHeader({ account }: { account: Account }) {
  const { view } = useView();
  const run = view?.run;
  const vehicleId = view?.driver.vehicleId;
  return (
    <header className="sticky top-0 z-30 bg-canvas md:border-b md:border-line md:bg-surface">
      <div className="flex h-14 items-center gap-2.5 px-5 md:h-14 md:gap-3">
        <div className="flex items-center gap-2 max-md:hidden">
          <RelayMark size={28} />
          <span className="t-subheading">Relay</span>
          <span className="t-subheading text-fg-3">Driver</span>
        </div>
        <span className="h-5 w-px bg-line max-md:hidden" aria-hidden />
        <span className="flex min-w-0 items-center gap-2 rounded-[10px] bg-subtle px-2.5 py-1.5">
          {run?.reefer ? (
            <ThermometerSnowflake
              size={16}
              strokeWidth={1.7}
              className="shrink-0 text-chilled-text"
              aria-hidden
            />
          ) : (
            <Truck
              size={16}
              strokeWidth={1.7}
              className="shrink-0 text-fg-2"
              aria-hidden
            />
          )}
          <span className="t-mono text-fg">{vehicleId ?? "No vehicle"}</span>
          {run && <span className="t-caption text-fg-3">T{run.tripNo}</span>}
          {run && (
            <span className="truncate t-caption text-fg-3 max-lg:hidden">
              · {run.vehicleLabel}
            </span>
          )}
        </span>
        <span className="flex-1" />
        {view && <SyncState />}
        <AccountMenu user={account} tone="accent" compact />
      </div>
    </header>
  );
}

/** Amber strip shown while offline. Tapping it opens the outbox. */
export function OfflineBanner({
  title,
  note = "View outbox",
}: {
  title?: string;
  note?: string;
}) {
  const saved = useDriver((s) => s.outbox.length);
  const outage = useDriver((s) => s.outage);
  const go = useNav((s) => s.go);
  const heading =
    title ??
    `${outage ? `Offline since ${hhmm(outage.since)}` : "Offline"}${saved > 0 ? ` · ${records(saved)} saved` : ""}`;
  return (
    <button
      type="button"
      onClick={() => go("/driver/outbox")}
      className="flex w-full shrink-0 items-center gap-2.5 rounded-[14px] bg-warning-tint px-3.5 py-2.5 text-left transition-[filter] hover:brightness-[0.98]"
    >
      <CloudOff
        size={18}
        strokeWidth={1.7}
        className="shrink-0 text-warning-text"
        aria-hidden
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="t-small-m text-warning-text">{heading}</span>
        <span className="t-caption text-fg-2">{note}</span>
      </span>
      <ChevronRight
        size={16}
        strokeWidth={1.7}
        className="shrink-0 text-warning-text"
        aria-hidden
      />
    </button>
  );
}

/**
 * A screen: an optional way back, the content, and a footer for the main
 * action. On a phone the footer sits at the bottom of the viewport; on a
 * wider screen it follows the content and sticks when the content is long.
 */
export function DriverScreen({
  children,
  footer,
  back,
  gap = "gap-4",
}: {
  children: ReactNode;
  footer?: ReactNode;
  back?: { label: string; to: string };
  gap?: string;
}) {
  const go = useNav((s) => s.go);
  return (
    <div className="flex flex-1 flex-col">
      <div
        className={cx(
          "flex flex-1 flex-col px-5 pt-1 pb-4 md:flex-none md:pt-6 [&>*]:shrink-0",
          gap,
        )}
      >
        {back && (
          <button
            type="button"
            onClick={() => go(back.to)}
            className="-mb-1 flex items-center gap-1.5 self-start rounded-md t-small-m text-fg-2 transition-colors hover:text-fg"
          >
            <ArrowLeft size={16} strokeWidth={1.7} aria-hidden />
            {back.label}
          </button>
        )}
        {children}
      </div>
      {footer && (
        <div className="sticky bottom-0 z-10 flex flex-col gap-3.5 bg-canvas px-5 pt-2 pb-[max(16px,env(safe-area-inset-bottom))] md:pb-6">
          {footer}
        </div>
      )}
    </div>
  );
}

/** Header row inside a list card ("Unload", "Waiting to send"). */
export function ListHeader({
  children,
  aside,
  asideClass = "t-caption text-fg-3",
}: {
  children: ReactNode;
  aside?: ReactNode;
  asideClass?: string;
}) {
  return (
    <div className="flex items-center px-3.5 py-3">
      <p className="t-caption-m text-fg-3">{children}</p>
      <span className="flex-1" />
      {aside && <p className={asideClass}>{aside}</p>}
    </div>
  );
}
