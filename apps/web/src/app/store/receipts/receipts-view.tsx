"use client";

import { ArrowRight, ClipboardList } from "lucide-react";
import Link from "next/link";
import { TempTag } from "@/components/store/bits";
import { Button, Card, Pill, type Tone } from "@/components/ui";
import type { receiptsList } from "@/server/queries/store";

type Row = Awaited<ReturnType<typeof receiptsList>>[number];

const STATUS: Record<string, { label: string; tone: Tone }> = {
  confirmed: { label: "Placed", tone: "neutral" },
  planned: { label: "Planned", tone: "accent" },
  loaded: { label: "On the truck", tone: "accent" },
  delivered: { label: "Delivered", tone: "success" },
  received: { label: "Received", tone: "success" },
  failed: { label: "Not delivered", tone: "danger" },
};

/* A moved order that hasn't arrived opens its notice; everything else its record. */
const hrefFor = (r: Row) =>
  r.movedFrom && !["delivered", "received"].includes(r.status)
    ? `/store/notice/${r.id}`
    : `/store/record/${r.id}`;

export function ReceiptsView({ rows }: { rows: Row[] }) {
  // Rows arrive newest delivery first; group them by delivery day.
  const days: { day: string; current: boolean; rows: Row[] }[] = [];
  for (const r of rows) {
    const last = days.at(-1);
    if (last?.day === r.day) last.rows.push(r);
    else days.push({ day: r.day, current: r.current, rows: [r] });
  }

  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-5 px-6 py-7 max-md:gap-4 max-md:px-4 max-md:py-4">
      <div className="flex flex-col gap-1">
        <h1 className="t-display max-md:f-title">Receipts</h1>
        {rows.length > 0 && (
          <p className="t-small text-fg-3">
            {rows.length} {rows.length === 1 ? "order" : "orders"} ·{" "}
            {rows.filter((r) => r.status === "received").length} received
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <Card
          as="section"
          className="flex flex-col items-center gap-2 px-4 py-12 text-center"
        >
          <span className="mb-1 inline-flex size-12 items-center justify-center rounded-2xl bg-subtle text-fg-2">
            <ClipboardList size={22} strokeWidth={1.7} aria-hidden />
          </span>
          <h2 className="f-heading">No orders yet</h2>
          <Button
            variant="secondary"
            href="/store/order"
            iconRight={ArrowRight}
            className="mt-2 max-md:h-[46px]"
          >
            Place an order
          </Button>
        </Card>
      ) : (
        days.map((d) => (
          <Card key={d.day} as="section" className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-line bg-subtle px-4 py-2.5">
              <h2 className="t-small-m">{d.day}</h2>
              {d.current && (
                <Pill tone="accent" size="sm">
                  Current delivery
                </Pill>
              )}
            </div>
            <ul>
              {d.rows.map((r) => {
                const st = STATUS[r.status] ?? {
                  label: r.status,
                  tone: "neutral" as Tone,
                };
                return (
                  <li
                    key={r.id}
                    className="border-b border-line last:border-b-0"
                  >
                    <Link
                      href={hrefFor(r)}
                      className="flex min-h-[60px] items-center gap-3 px-4 py-3 transition-colors hover:bg-subtle/60"
                    >
                      <span className="w-[84px] shrink-0">
                        <TempTag temp={r.temp} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate t-mono text-fg-2">{r.id}</p>
                        <p className="truncate t-caption text-fg-3 max-md:whitespace-normal">
                          {r.received
                            ? `${r.received} received`
                            : `${r.units} units`}
                          {r.movedFrom ? ` · moved from ${r.movedFrom}` : ""}
                        </p>
                      </div>
                      <Pill tone={st.tone} size="sm">
                        {st.label}
                      </Pill>
                      <ArrowRight
                        size={15}
                        className="shrink-0 text-fg-3"
                        aria-hidden
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
