"use client";

import { hhmm, requiresRefrigeration, TEMP_LABEL } from "@relay/domain";
import {
  ArrowLeft,
  Camera,
  Check,
  Minus,
  Plus,
  Thermometer,
  User,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "@/components/interact";
import { cx, Stepper } from "@/components/ui";
import { useNav } from "@/lib/driver/nav";
import { nowAt, useDriver, useOffline, useView } from "@/lib/driver/store";
import type { StopOrder } from "@/lib/driver/types";
import {
  ActionButton,
  casesWord,
  DriverScreen,
  OfflineBanner,
  orderKind,
  records,
} from "../frame";
import { SignaturePad } from "../signature-pad";

/** Downscale a camera photo to a small JPEG that travels well on a weak signal. */
async function compress(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Step a probe reading by 0.1 °C, starting from the recorded reefer reading. */
const bumpTemp = (t: number | null, d: number, initial: number) =>
  t == null ? initial : Math.round((t + d) * 10) / 10;

function countNote(o: StopOrder, n: number) {
  if (n === o.loaded)
    return {
      ok: true,
      text: o.shortfall
        ? `Matches the dock record (${o.shortfall.cases} short)`
        : requiresRefrigeration(o.temp)
          ? "Matches the load sheet"
          : "All handed over",
    };
  const d = o.loaded - n;
  return { ok: false, text: `${d} fewer than the dock record` };
}

/** A count row: label and check on the left, a large stepper with "of N" on the right. */
function CountRow({
  order,
  value,
  onChange,
}: {
  order: StopOrder;
  value: number;
  onChange: (n: number) => void;
}) {
  const note = countNote(order, value);
  const label = `${orderKind(order)} order`;
  return (
    <div className="flex items-center gap-3 px-3.5 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <p className="f-label">{label}</p>
        <p
          aria-live="polite"
          className={cx(
            "t-caption transition-colors",
            note.ok ? "text-success-text" : "text-warning-text",
          )}
        >
          {note.text}
        </p>
      </div>
      {/* Lift the stepper's number so "of N" can sit underneath, as in the design. */}
      <fieldset className="relative [&>div>span]:min-w-[52px] [&>div>span]:-translate-y-[7px]">
        <legend className="sr-only">{`${label}, ${casesWord(order)} handed over`}</legend>
        <Stepper
          size="lg"
          value={value}
          max={order.loaded}
          onChange={(n) => onChange(Math.min(order.loaded, n))}
        />
        <span className="pointer-events-none absolute top-[26px] left-1/2 -translate-x-1/2 whitespace-nowrap t-caption text-fg-3">
          of {order.loaded}
        </span>
      </fieldset>
    </div>
  );
}

/** Proof of delivery: counts, photo, probe reading and signature. */
export function HandoverView({ seq }: { seq: number }) {
  const { view } = useView();
  const record = useDriver((s) => s.record);
  const draft = useDriver((s) => s.drafts[String(seq)]);
  const setDraft = useDriver((s) => s.setDraft);
  const clearDraft = useDriver((s) => s.clearDraft);
  const saved = useDriver((s) => s.outbox.length);
  const offline = useOffline();
  const go = useNav((s) => s.go);
  const fileRef = useRef<HTMLInputElement>(null);
  const run = view.run;
  const stop = run?.stops.find((s) => s.seq === seq);
  const hasChilled = Boolean(
    stop?.orders.some((o) => requiresRefrigeration(o.temp)),
  );
  const hasFrozen = Boolean(stop?.orders.some((o) => o.temp === "frozen"));

  // Start the draft from what left the dock.
  useEffect(() => {
    if (!stop || draft || stop.status === "completed") return;
    setDraft(seq, {
      counts: Object.fromEntries(stop.orders.map((o) => [o.id, o.loaded])),
      receiver: stop.receiver ?? "",
      tempC: hasChilled ? (run?.reeferTempC ?? null) : null,
    });
  }, [stop, draft, seq, setDraft, hasChilled, run?.reeferTempC]);

  if (!run || !stop) {
    return (
      <DriverScreen
        back={{ label: "Run", to: "/driver" }}
        footer={
          <ActionButton
            variant="secondary"
            icon={ArrowLeft}
            onClick={() => go("/driver")}
          >
            Back to the run
          </ActionButton>
        }
      >
        <h1 className="f-title">Stop not found</h1>
        <p className="t-body text-fg-2">
          It may have been removed from your trip.
        </p>
      </DriverScreen>
    );
  }

  const done = stop.status === "completed";
  const temp = draft?.tempC ?? null;
  const counts = done ? (stop.counts ?? {}) : (draft?.counts ?? {});
  const ready = Boolean(draft?.photo && draft?.signature);

  const complete = () => {
    if (!draft) return;
    const at = nowAt();
    const summary = stop.orders
      .map(
        (o) =>
          `${counts[o.id] ?? o.loaded} ${o.brand === "Fresh" ? TEMP_LABEL[o.temp].toLowerCase() : casesWord(o)}`,
      )
      .join(", ");
    record("complete", {
      at,
      runId: run.id,
      seq: stop.seq,
      payload: {
        counts: Object.fromEntries(
          stop.orders.map((o) => [o.id, counts[o.id] ?? o.loaded]),
        ),
        receiver: (draft.receiver ?? "").trim() || (stop.receiver ?? undefined),
        tempC: hasChilled ? (draft.tempC ?? undefined) : undefined,
        photo: draft.photo,
        signature: draft.signature,
      },
      title: `Proof of delivery · ${stop.outletId}`,
      detail: `${hhmm(at)} · ${summary} · photo and signature`,
    });
    clearDraft(seq);
    go(offline ? "/driver/outbox" : "/driver");
  };

  const takePhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      setDraft(seq, { photo: await compress(file), photoAt: nowAt() });
    } catch {
      toast("That photo couldn’t be read", {
        detail: "Try taking it again.",
        tone: "warning",
      });
    }
  };

  const footNote =
    !ready && !done
      ? "Add a photo and the receiver’s signature to finish"
      : offline
        ? "Saved on this phone · sends when back online"
        : null;

  return (
    <DriverScreen
      gap="gap-3"
      back={{ label: `Stop ${stop.seq}`, to: `/driver/stop/${stop.seq}` }}
      footer={
        <>
          {done ? (
            <ActionButton
              variant="secondary"
              icon={ArrowLeft}
              onClick={() => go(offline ? "/driver/outbox" : "/driver")}
            >
              {offline ? "View outbox" : "Back to the run"}
            </ActionButton>
          ) : (
            <ActionButton
              variant="primary"
              icon={Check}
              disabled={!ready}
              onClick={complete}
            >
              Complete stop
            </ActionButton>
          )}
          {footNote && (
            <p className="text-center t-caption text-fg-3">{footNote}</p>
          )}
        </>
      }
    >
      {offline && (
        <OfflineBanner
          title={saved > 0 ? `Offline · ${records(saved)} saved` : "Offline"}
        />
      )}

      <div className="flex flex-col gap-0.5">
        <h1 className="f-title">Handover · {stop.outletId}</h1>
        <p className="t-body text-fg-2">Count with the receiver, then sign</p>
      </div>

      <section
        aria-label="Quantities"
        className="w-full divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface"
      >
        {stop.orders.map((o) =>
          done ? (
            <div key={o.id} className="flex items-center gap-3 px-3.5 py-3">
              <p className="min-w-0 flex-1 f-label">{orderKind(o)} order</p>
              <p className="t-mono">
                {counts[o.id] ?? o.loaded}{" "}
                <span className="text-fg-3">of {o.loaded}</span>
              </p>
            </div>
          ) : (
            <CountRow
              key={o.id}
              order={o}
              value={counts[o.id] ?? o.loaded}
              onChange={(n) =>
                setDraft(seq, { counts: { ...counts, [o.id]: n } })
              }
            />
          ),
        )}
      </section>

      <div
        className={cx(
          "grid w-full gap-2.5",
          hasChilled ? "grid-cols-2" : "grid-cols-1",
        )}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            void takePhoto(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          aria-label={
            draft?.photo ? "Retake the handover photo" : "Take a handover photo"
          }
          disabled={done}
          onClick={() => fileRef.current?.click()}
          className={cx(
            "flex h-16 min-w-0 items-center gap-2.5 rounded-[14px] border bg-surface p-2.5 text-left transition-colors",
            draft?.photo || done
              ? "border-line"
              : "border-dashed border-line-strong hover:bg-subtle",
          )}
        >
          {draft?.photo ? (
            // biome-ignore lint/performance/noImgElement: a local data URL from the camera, not an optimisable asset
            <img
              src={draft.photo}
              alt=""
              className="size-11 shrink-0 rounded-[10px] object-cover"
            />
          ) : (
            <span
              className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-subtle text-fg-2"
              aria-hidden
            >
              <Camera size={20} strokeWidth={1.7} />
            </span>
          )}
          <span className="flex min-w-0 flex-col">
            <span className="t-small-m">
              {done ? "Photo" : draft?.photo ? "Photo" : "Add photo"}
            </span>
            <span className="truncate t-caption text-fg-3">
              {done
                ? "On the record"
                : draft?.photo
                  ? `${draft.photoAt ? hhmm(draft.photoAt) : ""} · retake`
                  : "Camera"}
            </span>
          </span>
        </button>

        {hasChilled && (
          <div className="flex h-16 min-w-0 items-center gap-2 rounded-[14px] border border-line bg-surface p-2.5">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-chilled-tint text-chilled-text"
              aria-hidden
            >
              <Thermometer size={19} strokeWidth={1.7} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="t-small-m tabular-nums">
                {done || temp == null ? "Probe" : `${temp.toFixed(1)} °C`}
              </span>
              <span
                className={cx(
                  "truncate t-caption",
                  temp != null && temp > 5 && !hasFrozen && !done
                    ? "text-warning-text"
                    : "text-fg-3",
                )}
              >
                {done
                  ? "On the record"
                  : temp == null
                    ? "Not taken"
                    : hasFrozen
                      ? "Probe recorded · frozen goods"
                      : temp <= 5
                        ? "Probe · in range"
                        : "Probe · too warm"}
              </span>
            </span>
            {!done && (
              <span className="flex flex-col gap-0.5">
                <button
                  type="button"
                  aria-label="Probe reading up"
                  onClick={() =>
                    setDraft(seq, {
                      tempC: bumpTemp(temp, 0.1, run.reeferTempC ?? 0),
                    })
                  }
                  className="flex size-6 items-center justify-center rounded-md bg-subtle text-fg hover:bg-muted"
                >
                  <Plus size={12} strokeWidth={2} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Probe reading down"
                  onClick={() =>
                    setDraft(seq, {
                      tempC: bumpTemp(temp, -0.1, run.reeferTempC ?? 0),
                    })
                  }
                  className="flex size-6 items-center justify-center rounded-md bg-subtle text-fg hover:bg-muted"
                >
                  <Minus size={12} strokeWidth={2} aria-hidden />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      <label className="flex h-[52px] w-full items-center gap-2.5 rounded-[14px] border border-line bg-surface px-3.5 focus-within:border-accent">
        <User
          size={18}
          strokeWidth={1.7}
          className="shrink-0 text-fg-2"
          aria-hidden
        />
        <span className="sr-only">Receiver’s name</span>
        <input
          value={
            done
              ? (stop.receiver ?? "")
              : (draft?.receiver ?? stop.receiver ?? "")
          }
          disabled={done}
          placeholder="Receiver’s name"
          onChange={(e) => setDraft(seq, { receiver: e.target.value })}
          className="min-w-0 flex-1 bg-transparent f-body-m outline-none placeholder:text-fg-3 disabled:text-fg"
        />
        <span className="shrink-0 t-caption text-fg-3">Receiver</span>
      </label>

      {done ? (
        <div className="flex h-[72px] w-full items-center gap-2.5 rounded-2xl border border-line bg-surface px-3.5">
          <Check
            size={18}
            strokeWidth={1.8}
            className="text-success-text"
            aria-hidden
          />
          <p className="t-small">
            Signed {stop.completedAt ? hhmm(stop.completedAt) : ""} · photo and
            signature saved
          </p>
        </div>
      ) : (
        <SignaturePad
          value={draft?.signature ?? null}
          onChange={(png) => setDraft(seq, { signature: png })}
        />
      )}
    </DriverScreen>
  );
}
