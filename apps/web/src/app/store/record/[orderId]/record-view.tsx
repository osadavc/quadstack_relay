"use client";

import { TEMP_LABEL } from "@relay/domain";

import {
  Check,
  CircleAlert,
  CircleCheck,
  Clock,
  CloudOff,
  GitCompare,
  ImageIcon,
  type LucideIcon,
  PackageCheck,
  Signature,
  ThermometerSnowflake,
  Truck,
} from "lucide-react";
import { TempTag } from "@/components/store/bits";
import { Card, cx, Pill } from "@/components/ui";
import type { recordView } from "@/server/queries/store";
import type { TrailTone } from "@/server/queries/story";
import { PrintButton } from "./print-button";

const NODE: Record<TrailTone, string> = {
  done: "bg-success text-fg-inverse",
  warning: "bg-warning text-fg-inverse",
  offline: "bg-offline text-fg-inverse",
  live: "bg-accent text-fg-inverse",
  pending: "border-[1.5px] border-line-strong bg-surface",
};
const LINK: Record<TrailTone, string> = {
  done: "bg-success",
  warning: "bg-success",
  offline: "bg-offline",
  live: "bg-accent",
  pending: "bg-line",
};
const NODE_ICON: Partial<Record<TrailTone, LucideIcon>> = {
  done: Check,
  warning: CircleAlert,
  offline: CloudOff,
  live: Truck,
};
const TIME: Record<TrailTone, string> = {
  done: "text-fg-3",
  warning: "text-warning-text",
  offline: "text-offline-text",
  live: "text-accent-text",
  pending: "text-fg-3",
};
const ROLE_DOT: Record<string, string> = {
  dispatcher: "bg-accent",
  loader: "bg-warning",
  driver: "bg-chilled",
  store: "bg-success",
};
const ROLE_LABEL: Record<string, string> = {
  dispatcher: "Dispatcher",
  loader: "Loader",
  driver: "Driver",
  store: "Store manager",
};
const EVIDENCE_ICON: Record<string, LucideIcon> = {
  photo: ImageIcon,
  signature: Signature,
  temp: ThermometerSnowflake,
};

const COLS =
  "grid grid-cols-[250px_88px_88px_100px_88px_minmax(200px,1fr)] items-center";

export function RecordView({
  r,
}: {
  r: NonNullable<Awaited<ReturnType<typeof recordView>>>;
}) {
  const temps = [...new Set(r.temps)]
    .map((t) => (t === "ambient" ? "dry" : TEMP_LABEL[t]))
    .join(" + ");

  return (
    <div className="mx-auto flex w-full max-w-[1248px] flex-col gap-6 px-6 py-7 max-md:gap-4 max-md:px-4 max-md:py-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="t-display max-md:f-title">
            Delivery record · {r.orderId}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {r.receivedAt ? (
              <Pill tone="success" icon={PackageCheck} size="sm">
                Received {r.receivedAt}
              </Pill>
            ) : (
              <Pill tone="neutral" icon={Clock} size="sm">
                Not received yet
              </Pill>
            )}
            <p className="t-small text-fg-3">
              {temps.charAt(0).toUpperCase() + temps.slice(1)} · {r.dayLabel}
              {r.vehicleId ? ` · ${r.vehicleId}` : ""}
            </p>
          </div>
        </div>
        <PrintButton />
      </div>

      <Card as="section" className="px-2 pt-5 pb-4 max-md:px-1">
        <ol
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${r.stages.length}, minmax(0, 1fr))`,
          }}
          aria-label="Handoffs"
        >
          {r.stages.map((s, i) => {
            const Icon = NODE_ICON[s.tone];
            const next = r.stages[i + 1];
            return (
              <li
                key={s.label}
                className="relative flex flex-col items-center gap-2.5 px-2 text-center max-md:px-0.5"
              >
                {next && (
                  <span
                    className={cx(
                      "absolute top-[11px] left-1/2 h-0.5 w-full",
                      LINK[next.tone],
                    )}
                    aria-hidden
                  />
                )}
                <span
                  className={cx(
                    "relative inline-flex size-6 items-center justify-center rounded-full",
                    NODE[s.tone],
                  )}
                  aria-hidden
                >
                  {Icon && <Icon size={13} strokeWidth={2.4} />}
                </span>
                <div className="flex flex-col items-center gap-px">
                  <p
                    className={cx(
                      "t-body-m max-md:t-caption-m",
                      s.tone === "pending" ? "text-fg-3" : "text-fg",
                    )}
                  >
                    {s.label}
                  </p>
                  <p className="t-caption text-fg-2 max-md:hidden">
                    {s.detail}
                  </p>
                  <p className={cx("h-3.5 t-mono-sm", TIME[s.tone])}>{s.at}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start max-md:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-6 max-md:gap-4">
          <Card as="section" className="overflow-hidden">
            <div className="px-4 py-3.5">
              <h2 className="t-heading">Dock to door</h2>
            </div>
            <ul className="md:hidden">
              {r.rows.map((row) => (
                <li
                  key={row.key}
                  className={cx(
                    "flex flex-col gap-2.5 border-t border-line px-4 py-3",
                    row.notes.length > 0 && "bg-warning-tint",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <TempTag temp={row.temp} />
                    <span className="truncate t-body-m">{row.name}</span>
                  </div>
                  <dl className="grid grid-cols-4 gap-2">
                    {(
                      [
                        ["Ordered", row.ordered, false, null],
                        ["Loaded", row.loaded, row.loadedWarn, null],
                        ["Delivered", row.delivered, false, row.deliveredNote],
                        ["Received", row.received, row.receivedWarn, null],
                      ] as const
                    ).map(([label, value, warn, note]) => (
                      <div key={label} className="flex min-w-0 flex-col">
                        <dt className="t-caption text-fg-3">{label}</dt>
                        <dd
                          className={cx(
                            "truncate",
                            note
                              ? "t-caption text-offline-text"
                              : value === null
                                ? "t-caption text-fg-3"
                                : "t-mono",
                            warn && "text-warning-text",
                          )}
                        >
                          {note ?? value ?? "Pending"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {row.notes.length > 0 && (
                    <p className="t-small text-fg-2">{row.notes.join(" · ")}</p>
                  )}
                </li>
              ))}
            </ul>
            <div className="scroll-thin overflow-x-auto max-md:hidden">
              <div className="min-w-[820px]">
                <div
                  className={cx(
                    COLS,
                    "h-9 border-t border-line bg-subtle t-caption-m text-fg-3",
                  )}
                >
                  <span className="px-3.5">Line</span>
                  <span className="px-3.5">Ordered</span>
                  <span className="px-3.5">Loaded</span>
                  <span className="px-3.5">Delivered</span>
                  <span className="px-3.5">Received</span>
                  <span className="px-3.5">What happened</span>
                </div>
                {r.rows.map((row) => {
                  const flagged = row.notes.length > 0;
                  return (
                    <div
                      key={row.key}
                      className={cx(
                        COLS,
                        "min-h-[52px] border-t border-line py-2.5",
                        flagged && "bg-warning-tint",
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2 px-3.5">
                        <TempTag temp={row.temp} />
                        <span className="truncate t-body-m">{row.name}</span>
                      </div>
                      <Count value={row.ordered} />
                      <Count value={row.loaded} warn={row.loadedWarn} />
                      {row.deliveredNote ? (
                        <span className="px-3.5 t-caption text-offline-text">
                          {row.deliveredNote}
                        </span>
                      ) : (
                        <Count value={row.delivered} />
                      )}
                      <Count value={row.received} warn={row.receivedWarn} />
                      <div className="px-3.5">
                        {flagged ? (
                          <p className="t-small text-fg-2">
                            {row.notes.join(" · ")}
                          </p>
                        ) : row.released ? (
                          <p className="flex items-center gap-1.5 t-small text-fg-3">
                            <CircleCheck
                              size={14}
                              strokeWidth={1.7}
                              className="shrink-0 text-success-text"
                              aria-hidden
                            />
                            {row.state === "received"
                              ? "Matches at every handoff"
                              : "Matches so far"}
                          </p>
                        ) : (
                          <p className="t-small text-fg-3">Not loaded yet</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          <Card as="section" className="overflow-hidden">
            <div className="flex flex-wrap items-baseline gap-x-2.5 px-4 py-3.5">
              <h2 className="t-heading">Handoff log</h2>
              <span className="ml-auto t-mono-sm text-fg-3">
                {r.events.length} {r.events.length === 1 ? "entry" : "entries"}
              </span>
            </div>
            {r.pendingOnPhone && (
              <div className="flex items-center gap-2 border-t border-line bg-offline-tint px-4 py-2.5">
                <CloudOff
                  size={16}
                  strokeWidth={1.7}
                  className="shrink-0 text-offline-text"
                  aria-hidden
                />
                <p className="t-small text-offline-text">
                  Driver’s phone offline · some entries not synced yet
                </p>
              </div>
            )}
            <ol>
              {r.events.map((e) => (
                <li
                  key={e.id}
                  className="flex gap-4 border-t border-line px-4 py-2.5 max-md:gap-3"
                >
                  <div className="w-[72px] shrink-0 max-md:w-[58px]">
                    <p className="t-mono">{e.at}</p>
                    <p className="t-caption text-fg-3">{e.day}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 t-small-m">
                      <span
                        className={cx(
                          "size-2 shrink-0 rounded-full",
                          ROLE_DOT[e.role ?? ""] ?? "bg-offline",
                        )}
                        aria-hidden
                      />
                      {e.actor}
                      <span className="t-caption text-fg-3">
                        · {ROLE_LABEL[e.role ?? ""] ?? "Relay"}
                      </span>
                      {e.source === "offline" && (
                        <Pill tone="offline" size="sm" className="ml-1">
                          Recorded offline
                        </Pill>
                      )}
                    </p>
                    <p className="t-small text-fg-2">{e.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside className="flex w-full flex-col gap-4 lg:w-[340px] lg:shrink-0">
          <Card as="section" className="px-[18px] py-4">
            <h2 className="pb-1.5 t-heading">Evidence</h2>
            {r.evidence.length === 0 ? (
              <p className="border-t border-line pt-3 t-small text-fg-3">
                No evidence yet
              </p>
            ) : (
              <ul>
                {r.evidence.map((ev) => {
                  const Icon = EVIDENCE_ICON[ev.kind] ?? ImageIcon;
                  return (
                    <li
                      key={`${ev.title}-${ev.meta}`}
                      className="flex items-center gap-3 border-t border-line py-2.5"
                    >
                      {ev.mediaId ? (
                        <a
                          href={`/api/media/${ev.mediaId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="block size-12 shrink-0 overflow-hidden rounded-[10px] border border-line bg-subtle"
                        >
                          {/* biome-ignore lint/performance/noImgElement: stored evidence served from the API, not a page asset */}
                          <img
                            src={`/api/media/${ev.mediaId}`}
                            alt={ev.title}
                            className={cx(
                              "size-full",
                              ev.kind === "signature"
                                ? "object-contain p-1"
                                : "object-cover",
                            )}
                          />
                        </a>
                      ) : (
                        <span
                          className="inline-flex size-12 shrink-0 items-center justify-center rounded-[10px] bg-subtle text-fg-2"
                          aria-hidden
                        >
                          <Icon size={20} strokeWidth={1.7} />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="t-small-m">{ev.title}</p>
                        <p className="t-caption text-fg-3">{ev.meta}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {r.credits.length > 0 && (
            <section className="flex flex-col gap-2 rounded-xl bg-success-tint p-[18px]">
              <h2 className="flex items-center gap-2 t-body-m text-success-text">
                <CircleCheck size={18} strokeWidth={1.7} aria-hidden />
                Credit raised
              </h2>
              {r.credits.map((c) => (
                <p key={c.ref} className="t-small">
                  {c.cases} {c.cases === 1 ? "unit" : "units"}{" "}
                  {c.line.toLowerCase()} · {c.reason} at the dock ·{" "}
                  <span className="t-mono-sm">{c.ref}</span>
                </p>
              ))}
            </section>
          )}

          {r.reconciliation && (
            <section
              className={cx(
                "flex flex-col gap-2 rounded-xl p-[18px]",
                r.reconciliation.status === "resolved"
                  ? "bg-subtle"
                  : "bg-warning-tint",
              )}
            >
              <h2
                className={cx(
                  "flex items-center gap-2 t-body-m",
                  r.reconciliation.status === "resolved"
                    ? "text-fg"
                    : "text-warning-text",
                )}
              >
                <GitCompare size={18} strokeWidth={1.7} aria-hidden />
                {r.reconciliation.status === "resolved"
                  ? "Difference settled"
                  : "Counts differ"}
              </h2>
              <p className="t-small text-fg-2">
                Driver handed over {r.reconciliation.driver}, you counted{" "}
                {r.reconciliation.store}.{" "}
                {r.reconciliation.status !== "resolved"
                  ? "Waiting for the driver."
                  : r.reconciliation.resolution === "after_handover"
                    ? "Agreed as damage after handover."
                    : "Driver reports it was handed over intact. Dispatch is reviewing."}
              </p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

/* One count in the dock-to-door table. Null means that handoff has not happened. */
function Count({ value, warn }: { value: number | null; warn?: boolean }) {
  return value === null ? (
    <span className="px-3.5 t-caption text-fg-3">Pending</span>
  ) : (
    <span className={cx("px-3.5 t-mono", warn && "text-warning-text")}>
      {value}
    </span>
  );
}
