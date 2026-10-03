"use client";

import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CircleCheck,
  ImageIcon,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { confirmReceiptAction } from "@/app/actions/store";
import { toast } from "@/components/interact";
import { PhoneColumn, QtyStepper, TempTag } from "@/components/store/bits";
import { Button, cx } from "@/components/ui";
import type { confirmView } from "@/server/queries/store";

type Data = NonNullable<Awaited<ReturnType<typeof confirmView>>>;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Downscale a camera photo to a JPEG data URL, at most 1000 px on its long side. */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Not an image"));
      img.src = url;
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

export function ConfirmForm({ data }: { data: Data }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(data.lines.map((l) => [String(l.id), l.counted])),
  );
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const confirmed = Boolean(data.receipt);
  const total = data.lines.reduce((a, l) => a + (counts[String(l.id)] ?? 0), 0);
  const short = total < data.expected;

  const submit = () =>
    start(async () => {
      const res = await confirmReceiptAction(
        data.orderId,
        counts,
        short ? note : undefined,
        short ? photo : null,
      );
      if (!res.ok) return toast(res.error, { tone: "warning" });
      toast(`Confirmed ${total} of ${data.expected} received`, {
        tone: "success",
      });
      router.refresh();
    });

  return (
    <PhoneColumn
      footer={
        confirmed && data.receipt ? (
          <>
            <div
              aria-live="polite"
              className="flex items-start gap-2.5 rounded-xl bg-success-tint px-3.5 py-3"
            >
              <CircleCheck
                size={18}
                strokeWidth={1.7}
                className="mt-px shrink-0 text-success-text"
                aria-hidden
              />
              <p className="min-w-0 t-small-m text-success-text">
                {data.receipt.received} of {data.receipt.expected} received ·
                confirmed {data.receipt.at}
              </p>
            </div>
            <Button
              variant="primary"
              size="xl"
              className="md:h-10"
              full
              href={`/store/record/${data.orderId}`}
              iconRight={ArrowRight}
            >
              Open the delivery record
            </Button>
          </>
        ) : data.ready ? (
          <Button
            variant="primary"
            size="xl"
            className="md:h-10"
            full
            icon={Check}
            disabled={pending}
            onClick={submit}
          >
            {pending
              ? "Confirming"
              : `Confirm ${total} of ${data.expected} received`}
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="xl"
            className="md:h-10"
            full
            href="/store/today"
            icon={ArrowLeft}
          >
            Back to deliveries
          </Button>
        )
      }
    >
      <div className="flex items-center gap-3">
        <Link
          href="/store/today"
          aria-label="Back to deliveries"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-fg transition-colors hover:bg-subtle"
        >
          <ArrowLeft size={20} strokeWidth={1.7} aria-hidden />
        </Link>
        <div className="min-w-0">
          <p className="truncate t-subheading">Delivery · {data.orderId}</p>
          <p className="truncate t-caption text-fg-3">
            {data.outlet.id} · {data.outlet.name}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="f-title">
          {confirmed
            ? "Receipt confirmed"
            : data.ready
              ? "Confirm what arrived"
              : "Nothing to count yet"}
        </h1>
        <p className="t-small text-fg-3">{data.deliveredLine}</p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex items-center px-3.5 py-2.5">
          <TempTag temp={data.temp} />
          <span className="ml-auto t-caption text-fg-3">
            {confirmed
              ? "Confirmed by you"
              : data.ready
                ? "Your count"
                : "Expected"}
          </span>
        </div>
        <ul>
          {data.lines.map((l) => {
            const value = counts[String(l.id)] ?? 0;
            const diff = l.expected - value;
            const detail = !data.ready
              ? l.short
                ? `${l.unit} · ${l.short} credited at the dock`
                : l.unit
              : diff > 0
                ? `${plural(diff, "unit")} fewer than delivered`
                : diff < 0
                  ? `${plural(-diff, "unit")} more than delivered`
                  : l.short
                    ? `${l.short} credited at the dock`
                    : l.unit;
            return (
              <li
                key={l.id}
                className={cx(
                  "flex items-center gap-2.5 border-t border-line px-3.5 py-3 transition-colors",
                  diff !== 0 && "bg-warning-tint",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="t-body-m">{l.name}</p>
                  <p
                    className={cx(
                      "t-caption",
                      diff !== 0 ? "text-warning-text" : "text-fg-3",
                    )}
                  >
                    {detail}
                  </p>
                </div>
                {!data.ready && !confirmed ? (
                  <span className="t-subheading tabular-nums">
                    {l.expected}
                  </span>
                ) : confirmed ? (
                  <div className="flex w-12 flex-col items-center">
                    <span className="t-subheading tabular-nums">{value}</span>
                    <span className="t-caption text-fg-3">of {l.expected}</span>
                  </div>
                ) : (
                  <div className="flex shrink-0 flex-col items-center gap-0.5">
                    <QtyStepper
                      label={l.name}
                      value={value}
                      disabled={pending}
                      onChange={(n) =>
                        setCounts((c) => ({ ...c, [String(l.id)]: n }))
                      }
                    />
                    <span className="t-caption text-fg-3">of {l.expected}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {!confirmed && short && (
        <section className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="t-caption-m text-fg-3">
              What happened to the difference?
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="For example: 2 units split when shelving"
              className="resize-none rounded-lg border border-line-strong bg-surface px-3 py-2 t-body outline-none focus:border-accent"
            />
          </label>
          <input
            ref={file}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                setPhoto(await shrink(f));
              } catch {
                toast("That file isn’t a photo", { tone: "warning" });
              }
              e.target.value = "";
            }}
          />
          {photo ? (
            <div className="flex items-center gap-3 rounded-xl bg-subtle p-2.5">
              {/* biome-ignore lint/performance/noImgElement: a local preview from the camera, not a page asset */}
              <img
                src={photo}
                alt="The difference, from the camera"
                className="size-12 rounded-lg object-cover"
              />
              <p className="min-w-0 flex-1 t-small-m">Photo added</p>
              <Button
                size="sm"
                variant="ghost"
                icon={X}
                onClick={() => setPhoto(null)}
              >
                Remove
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => file.current?.click()}
              className="flex h-14 items-center gap-3 rounded-xl border border-dashed border-line-strong px-3 text-left transition-colors hover:bg-subtle"
            >
              <span
                className="inline-flex size-9 items-center justify-center rounded-lg bg-subtle text-fg-2"
                aria-hidden
              >
                <Camera size={18} strokeWidth={1.7} />
              </span>
              <span className="t-small-m">Add a photo (optional)</span>
              <ImageIcon
                size={18}
                strokeWidth={1.7}
                className="ml-auto text-fg-3"
                aria-hidden
              />
            </button>
          )}
        </section>
      )}

      {confirmed && data.receipt?.note && (
        <p className="rounded-xl bg-subtle p-3 t-small text-fg-2">
          Your note: “{data.receipt.note}”
        </p>
      )}
    </PhoneColumn>
  );
}
