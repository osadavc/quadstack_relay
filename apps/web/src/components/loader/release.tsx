"use client";

import {
  Check,
  CircleCheck,
  CircleDashed,
  Flag,
  type LucideIcon,
  PenLine,
  QrCode,
  Send,
  Smartphone,
  ThermometerSnowflake,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { type ReactNode, useEffect, useState, useTransition } from "react";
import {
  ackChangeAction,
  loadAllAction,
  releaseAction,
} from "@/app/actions/dock";
import { toast } from "@/components/interact";
import { Avatar, Button, cx, Pill } from "@/components/ui";
import type { LoadSheetData } from "@/server/queries/dock";
import { changeSummary, plural, REASON_WORD } from "./format";
import { BackLink } from "./load-sheet";

/* L4: the checks before a vehicle leaves, and the handover to the driver by QR. */

type CheckState = "done" | "warning" | "todo";

const MARK: Record<CheckState, { icon: LucideIcon; cls: string }> = {
  done: { icon: Check, cls: "bg-success text-fg-inverse" },
  warning: { icon: Flag, cls: "bg-warning text-fg-inverse" },
  todo: { icon: CircleDashed, cls: "bg-subtle text-fg-3" },
};

/* What the reefer unit can show; the server refuses anything outside it. */
const REEFER_MIN = -25;
const REEFER_MAX = 15;
/* Chilled goods travel at 0 to 5 °C. */
const CHILLED_MIN = 0;
const CHILLED_MAX = 5;

type Reading =
  | { kind: "empty" }
  | { kind: "invalid"; message: string }
  | { kind: "ok"; value: number; inRange: boolean };

function readTemp(raw: string): Reading {
  const text = raw.trim().replace(",", ".").replace("−", "-");
  if (!text) return { kind: "empty" };
  if (!/^-?\d{1,2}(\.\d?)?$/.test(text))
    return { kind: "invalid", message: "Use a number like 3.5" };
  const value = Number(text);
  if (value < REEFER_MIN || value > REEFER_MAX)
    return {
      kind: "invalid",
      message: `Check the display: ${REEFER_MIN} to ${REEFER_MAX} °C`,
    };
  return {
    kind: "ok",
    value,
    inRange: value >= CHILLED_MIN && value <= CHILLED_MAX,
  };
}

function CheckRow({
  state,
  title,
  sub,
  subTone = "text-fg-3",
  aside,
}: {
  state: CheckState;
  title: string;
  sub?: ReactNode;
  subTone?: string;
  aside?: ReactNode;
}) {
  const m = MARK[state];
  return (
    <li className="flex items-center gap-4 px-[18px] py-4 max-md:flex-wrap max-md:gap-3 max-md:px-4">
      <span
        className={cx(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
          m.cls,
        )}
      >
        <m.icon size={18} strokeWidth={2} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="f-body-m">{title}</p>
        {sub && <p className={cx("t-small", subTone)}>{sub}</p>}
      </div>
      {aside && <div className="max-md:w-full max-md:pl-12">{aside}</div>}
    </li>
  );
}

const FIELD =
  "flex h-9 w-[150px] items-center gap-2 rounded-lg border bg-surface px-3.5 transition-colors focus-within:ring-1 has-[:disabled]:bg-subtle max-md:h-[46px] max-md:w-full";

export function ReleaseScreen({ data }: { data: LoadSheetData }) {
  const [pending, start] = useTransition();
  const [seal, setSeal] = useState(data.seal ?? "");
  const [tempText, setTempText] = useState(
    data.temp !== null ? data.temp.toFixed(1) : "",
  );
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const left = data.totals.units - data.totals.done;
  const sealed = seal.trim().length > 0;
  const changeOk = !data.changeNote || data.changeAcked;
  const reading = readTemp(tempText);
  const tempOk = !data.reefer || reading.kind === "ok";
  const ready = left === 0 && sealed && changeOk && tempOk && !data.released;
  const driverFirst = data.hasDriver ? data.driverName.split(" ")[0] : null;
  const flaggedUnits = data.sections
    .flatMap((s) => s.units)
    .filter((u) => u.status === "flagged");
  const url = `${origin}/h/${data.handoverToken}`;

  const run = (
    fn: () => Promise<{ ok: true } | { ok: false; error: string }>,
    done?: string,
  ) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast(res.error, { tone: "warning" });
      if (done) toast(done, { tone: "success" });
    });

  const release = () =>
    run(
      () =>
        releaseAction(
          data.id,
          seal,
          data.reefer && reading.kind === "ok" ? reading.value : null,
        ),
      driverFirst
        ? `${data.vehicleId} released to ${driverFirst}`
        : `${data.vehicleId} released`,
    );

  const firstStop = data.sections.at(-1);
  const deepest = data.sections[0];

  const tempRow = (() => {
    if (!data.reefer) return null;
    const state: CheckState =
      reading.kind === "ok" ? (reading.inRange ? "done" : "warning") : "todo";
    const sub =
      reading.kind === "invalid"
        ? reading.message
        : reading.kind === "ok" && !reading.inRange
          ? `Outside ${CHILLED_MIN}–${CHILLED_MAX} °C for chilled goods`
          : `From the reefer display · ${CHILLED_MIN}–${CHILLED_MAX} °C for chilled goods`;
    return (
      <CheckRow
        state={state}
        title={
          reading.kind === "ok"
            ? `Reefer at ${reading.value.toFixed(1)} °C`
            : "Reefer temperature"
        }
        sub={sub}
        subTone={
          reading.kind === "invalid" ||
          (reading.kind === "ok" && !reading.inRange)
            ? "text-warning-text"
            : "text-fg-3"
        }
        aside={
          <label
            className={cx(
              FIELD,
              reading.kind === "invalid"
                ? "border-warning focus-within:border-warning focus-within:ring-warning"
                : "border-line-strong focus-within:border-accent focus-within:ring-accent",
            )}
          >
            <span className="sr-only">Reefer temperature in °C</span>
            <ThermometerSnowflake
              size={16}
              strokeWidth={1.7}
              className="shrink-0 text-chilled-text"
              aria-hidden
            />
            <input
              value={tempText}
              onChange={(e) =>
                setTempText(e.target.value.replace(/[^\d.,\-−]/g, ""))
              }
              disabled={data.released}
              inputMode="decimal"
              maxLength={5}
              placeholder="3.0"
              aria-invalid={reading.kind === "invalid"}
              style={{ outline: "none" }}
              className="w-full min-w-0 bg-transparent f-mono placeholder:text-fg-3"
            />
            <span className="shrink-0 t-small-m text-fg-3">°C</span>
          </label>
        }
      />
    );
  })();

  return (
    <div className="scroll-thin flex min-h-0 flex-1 items-start gap-6 overflow-y-auto px-7 py-6 max-lg:flex-col max-md:gap-4 max-md:px-4 max-md:py-4">
      <div className="flex w-full min-w-0 flex-1 flex-col gap-4">
        <div className="flex items-center gap-4 max-md:gap-3">
          <BackLink
            href={`/loader/vehicles/${data.id}`}
            label="Back to the load sheet"
          />
          <div className="min-w-0">
            <h1 className="f-title">Release {data.vehicleId}</h1>
            <p className="truncate t-body text-fg-3">
              Departs {data.departs} · {data.district} ·{" "}
              {data.totals.volumeM3.toFixed(1)} m³ ·{" "}
              {Math.round(data.totals.weightKg).toLocaleString("en-GB")} kg
            </p>
          </div>
        </div>

        <section className="w-full overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <div className="flex items-center gap-2.5 border-b border-line px-[18px] py-4 max-md:px-4">
            <h2 className="f-label">Before {data.vehicleId} leaves</h2>
            <Pill size="sm" className="ml-auto">
              Plan v{data.planVersion}
            </Pill>
          </div>
          <ul className="divide-y divide-line">
            {left === 0 ? (
              <CheckRow
                state="done"
                title={`${data.totals.units} of ${data.totals.units} orders loaded`}
                sub={
                  deepest && firstStop
                    ? `${deepest.outletId} deepest · ${firstStop.outletId} ${firstStop.temp === "chilled" ? "chilled goods" : "goods"} at the doors`
                    : undefined
                }
              />
            ) : (
              <CheckRow
                state="todo"
                title={`${data.totals.done} of ${data.totals.units} orders loaded`}
                sub={`${plural(left, "unit")} still on the dock`}
                aside={
                  !data.released ? (
                    <Button
                      icon={Check}
                      disabled={pending}
                      onClick={() => run(() => loadAllAction(data.id))}
                      className="max-md:h-[46px] max-md:w-full"
                    >
                      Mark all loaded
                    </Button>
                  ) : undefined
                }
              />
            )}

            {flaggedUnits.length ? (
              <CheckRow
                state="warning"
                title={`${plural(flaggedUnits.length, "shortfall")} recorded`}
                sub={flaggedUnits
                  .map((u) => {
                    const sf = u.shortfall;
                    return sf
                      ? `${plural(sf.cases, "unit")} ${u.name.toLowerCase()} ${REASON_WORD[sf.reason] ?? sf.reason}`
                      : u.name;
                  })
                  .join(" · ")}
                subTone="text-warning-text"
              />
            ) : (
              <CheckRow state="done" title="No shortfalls" />
            )}

            {tempRow}

            <CheckRow
              state={sealed ? "done" : "todo"}
              title={sealed ? `Doors sealed · ${seal.trim()}` : "Doors sealed"}
              sub={sealed ? undefined : "Seal number from the tag on the doors"}
              aside={
                <label
                  className={cx(
                    FIELD,
                    "border-line-strong focus-within:border-accent focus-within:ring-accent",
                  )}
                >
                  <span className="sr-only">Seal number</span>
                  <input
                    value={seal}
                    onChange={(e) => setSeal(e.target.value.replace(/\s/g, ""))}
                    disabled={data.released}
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="Seal no."
                    style={{ outline: "none" }}
                    className="w-full min-w-0 bg-transparent f-mono placeholder:text-fg-3"
                  />
                  {!data.released && (
                    <PenLine
                      size={16}
                      strokeWidth={1.7}
                      className="shrink-0 text-fg-3"
                      aria-hidden
                    />
                  )}
                </label>
              }
            />

            {data.changeNote &&
              (data.changeAcked ? (
                <CheckRow
                  state="done"
                  title="Plan change applied"
                  sub={changeSummary(data.changeNote)}
                />
              ) : (
                <CheckRow
                  state="todo"
                  title="Plan change not confirmed"
                  sub={changeSummary(data.changeNote)}
                  aside={
                    <Button
                      disabled={pending}
                      onClick={() => run(() => ackChangeAction(data.id))}
                      className="max-md:h-[46px] max-md:w-full"
                    >
                      Got it
                    </Button>
                  }
                />
              ))}
          </ul>
        </section>

        {data.released ? (
          <div className="flex w-full items-center gap-3 rounded-xl bg-success-tint px-4 py-3">
            <CircleCheck
              size={20}
              strokeWidth={1.8}
              className="shrink-0 text-success"
              aria-hidden
            />
            <p className="min-w-0 flex-1 t-body-m text-success-text">
              Released {driverFirst ? `to ${driverFirst} ` : ""}at{" "}
              {data.releasedAt}
              {data.seal ? ` · seal ${data.seal}` : ""}
              {data.temp !== null ? ` · ${data.temp.toFixed(1)} °C` : ""}
              {data.accepted ? ` · accepted ${data.acceptedAt}` : ""}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-3 max-md:flex-col max-md:items-stretch">
            {!ready && (
              <p className="t-small text-fg-3">
                {left > 0
                  ? "Load every unit to release."
                  : !tempOk
                    ? "Enter the reefer temperature to release."
                    : !sealed
                      ? "Enter the seal number to release."
                      : "Confirm the plan change to release."}
              </p>
            )}
            <Button
              variant="primary"
              size="lg"
              icon={Send}
              disabled={!ready || pending}
              onClick={release}
              className="ml-auto max-md:ml-0 max-md:h-[46px]"
            >
              {pending
                ? "Releasing"
                : driverFirst
                  ? `Release to ${driverFirst}`
                  : "Release vehicle"}
            </Button>
          </div>
        )}
      </div>

      <section className="flex w-[380px] shrink-0 flex-col items-center gap-[18px] rounded-2xl border border-line bg-surface p-6 shadow-pop max-lg:w-full max-md:p-5">
        <div className="w-full">
          <h2 className="f-heading">Hand over to the driver</h2>
          <p className="t-body text-fg-3">
            {data.released
              ? `${driverFirst ?? "The driver"} scans the code or types it in`
              : "Available after release"}
          </p>
        </div>
        <div
          className={cx(
            "rounded-2xl bg-subtle p-4 transition-opacity",
            !data.released && "opacity-40",
          )}
        >
          <div className="overflow-hidden rounded-xl">
            {data.released && origin ? (
              <QRCodeSVG
                value={url}
                size={168}
                level="M"
                fgColor="#1e1b18"
                bgColor="#ffffff"
                marginSize={2}
                title={`Handover code for ${data.vehicleId}`}
              />
            ) : (
              <div
                className="flex size-[168px] items-center justify-center bg-surface text-fg-3"
                aria-hidden
              >
                <QrCode size={56} strokeWidth={1.2} />
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="t-body text-fg-3">Code</span>
          <span className="sr-only">
            {data.released ? data.handoverCode : "Hidden until release"}
          </span>
          <span className="flex gap-1.5" aria-hidden>
            {[...data.handoverCode].map((d, i) => (
              <span
                key={`${data.handoverCode}-${i.toString()}`}
                className="inline-flex h-11 w-9 items-center justify-center rounded-lg bg-subtle f-mono"
              >
                {data.released ? d : "·"}
              </span>
            ))}
          </span>
        </div>
        <div className="flex w-full items-center gap-3 rounded-xl border border-line p-3">
          <Avatar
            initials={data.hasDriver ? data.driverInitials : "–"}
            size={40}
            tone={data.hasDriver ? "solidAccent" : "neutral"}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate f-label">
              {data.hasDriver ? data.driverName : "No driver assigned"}
            </p>
            <p
              className={cx(
                "t-small",
                data.accepted
                  ? "text-success-text"
                  : data.released
                    ? "text-accent-text"
                    : "text-fg-3",
              )}
            >
              {data.accepted
                ? `Accepted ${data.acceptedAt}`
                : data.released
                  ? "Waiting for scan"
                  : "Not released yet"}
            </p>
          </div>
          {data.accepted ? (
            <CircleCheck
              size={20}
              strokeWidth={1.8}
              className="text-success"
              aria-hidden
            />
          ) : (
            <Smartphone
              size={20}
              strokeWidth={1.7}
              className="text-fg-3"
              aria-hidden
            />
          )}
        </div>
      </section>
    </div>
  );
}
