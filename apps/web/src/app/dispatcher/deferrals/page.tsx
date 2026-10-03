import { CalendarX, ShieldCheck } from "lucide-react";
import { TempPill } from "@/components/dispatcher/bits";
import { Pill } from "@/components/ui";
import { cx } from "@/lib/cx";
import { requireUser } from "@/server/auth";
import { currentDepot } from "@/server/depot";
import { deferralsRecord } from "@/server/queries/dispatch";

export const metadata = { title: "Deferrals" };

/* The deferral record: orders moved off the working day, each decision, and the last ten days. */
export default async function DeferralsPage() {
  const user = await requireUser("dispatcher");
  const depot = await currentDepot(user);
  const r = await deferralsRecord(depot);
  const byOutlet = new Map<string, typeof r.log>();
  for (const l of r.log)
    byOutlet.set(l.outletId, [...(byOutlet.get(l.outletId) ?? []), l]);
  const repeat = [...byOutlet.entries()].filter(
    ([, list]) => new Set(list.map((x) => x.day)).size > 1,
  );
  return (
    <>
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3.5 max-xl:px-4 max-xl:py-4">
        <h1 className="t-title">Deferrals · {r.dayLabel}</h1>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_380px] overflow-hidden max-xl:block max-xl:overflow-visible">
        <section className="flex min-h-0 flex-col overflow-y-auto scroll-thin max-xl:overflow-visible">
          <div className="flex items-center gap-2 px-5 pt-4 pb-2 max-xl:px-4">
            <h2 className="t-subheading">Moved off {r.dayLabel}</h2>
            <Pill tone={r.today.length ? "warning" : "success"} size="sm">
              {r.today.length}
            </Pill>
          </div>
          {r.today.length === 0 ? (
            <p className="px-5 pb-4 t-small text-fg-3 max-xl:px-4">
              No orders moved off {r.dayLabel}.
            </p>
          ) : (
            <>
              <table className="mx-5 mb-5 border-collapse max-xl:hidden">
                <thead>
                  <tr className="border-b border-line t-caption-m text-fg-3">
                    <th className="py-2 pr-2 text-left">Order</th>
                    <th className="px-2 text-left">Outlet</th>
                    <th className="px-2 text-left">Temp</th>
                    <th className="px-2 text-left">Reason</th>
                    <th className="px-2 text-left">Next run</th>
                  </tr>
                </thead>
                <tbody>
                  {r.today.map((o) => (
                    <tr
                      key={o.id}
                      className={cx(
                        "border-b border-line",
                        o.skips > 0 && "bg-warning-tint/40",
                      )}
                    >
                      <td className="py-2.5 pr-2 t-mono whitespace-nowrap text-fg-2">
                        {o.id}
                      </td>
                      <td className="px-2 t-small-m">
                        {o.outletId} · {o.outlet}
                        {o.skips > 0 && (
                          <span className="block t-caption text-warning-text">
                            {o.decided
                              ? "Second skip in a row · decided by a person"
                              : "Second skip in a row"}
                          </span>
                        )}
                      </td>
                      <td className="px-2">
                        <TempPill temp={o.temp} />
                      </td>
                      <td className="px-2 t-small text-fg-2">{o.reason}</td>
                      <td className="px-2 t-small-m whitespace-nowrap">
                        {o.nextRun}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="mb-5 border-t border-line xl:hidden">
                {r.today.map((o) => (
                  <li
                    key={o.id}
                    className={cx(
                      "flex flex-col gap-1 border-b border-line px-4 py-3",
                      o.skips > 0 && "bg-warning-tint/40",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate t-body-m">
                        {o.outletId} · {o.outlet}
                      </span>
                      <TempPill temp={o.temp} />
                    </div>
                    {o.skips > 0 && (
                      <p className="t-caption text-warning-text">
                        {o.decided
                          ? "Second skip in a row · decided by a person"
                          : "Second skip in a row"}
                      </p>
                    )}
                    <p className="t-small text-fg-2">{o.reason}</p>
                    <p className="flex items-center gap-2 t-caption text-fg-3">
                      <span className="t-mono-sm">{o.id}</span>
                      <span className="ml-auto t-small-m text-fg">
                        Next run {o.nextRun}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="flex items-center gap-2 px-5 pt-2 pb-2 max-xl:px-4">
            <h2 className="t-subheading">Last ten days</h2>
          </div>
          <ul className="mx-5 mb-6 divide-y divide-line rounded-xl border border-line max-xl:mx-4">
            {r.log.length === 0 && (
              <li className="px-4 py-3 t-small text-fg-3">
                No deferrals in the last ten days.
              </li>
            )}
            {r.log.map((l) => (
              <li
                key={`${l.outletId}-${l.temp}-${l.day}`}
                className="flex items-center gap-3 px-4 py-2.5 max-xl:flex-wrap max-xl:gap-x-2 max-xl:gap-y-1 max-xl:px-3.5 max-xl:py-3"
              >
                <span className="w-[86px] t-mono-sm text-fg-3 max-xl:order-first max-xl:w-auto">
                  {l.day}
                </span>
                <span className="w-14 t-mono max-xl:w-auto">{l.outletId}</span>
                <span className="min-w-0 flex-1 truncate t-small-m">
                  {l.outlet}
                </span>
                <TempPill temp={l.temp} />
                {l.note && (
                  <span className="max-w-[280px] truncate t-caption text-fg-3 max-xl:w-full max-xl:max-w-none max-xl:whitespace-normal">
                    {l.note}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-l border-line p-5 scroll-thin max-xl:overflow-visible max-xl:border-t max-xl:border-l-0 max-xl:px-4 max-xl:pb-8">
          <section className="flex flex-col gap-2">
            <h2 className="flex items-center gap-2 t-subheading">
              <CalendarX size={16} strokeWidth={1.8} aria-hidden /> Skipped on
              more than one run
            </h2>
            {repeat.length === 0 ? (
              <p className="t-small text-fg-3">None in the last ten days.</p>
            ) : (
              repeat.map(([id, list]) => (
                <div
                  key={id}
                  className="rounded-[10px] border border-warning bg-warning-tint px-3.5 py-2.5"
                >
                  <p className="t-small-m">
                    {id} · {list[0].outlet}
                  </p>
                  <p className="t-caption text-warning-text">
                    {[...new Set(list.map((x) => x.day))].join(", ")}
                  </p>
                </div>
              ))
            )}
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="flex items-center gap-2 t-subheading">
              <ShieldCheck size={16} strokeWidth={1.8} aria-hidden /> Fairness
              decisions
            </h2>
            {r.decisions.length === 0 ? (
              <p className="t-small text-fg-3">
                No decisions for {r.dayLabel}.
              </p>
            ) : (
              r.decisions.map((d) => (
                <div
                  key={d.id}
                  className="flex flex-col gap-0.5 rounded-[10px] border border-line px-3.5 py-2.5"
                >
                  <p className="flex items-center gap-2 t-small-m">
                    <span className="t-mono-sm text-fg-3">{d.id}</span>{" "}
                    {d.orderId}
                    <Pill
                      tone={d.status === "pending" ? "warning" : "success"}
                      size="sm"
                      className="ml-auto"
                    >
                      {d.status === "pending"
                        ? "Waiting"
                        : d.chosen === "defer"
                          ? "Deferred"
                          : d.chosen === "swap"
                            ? "Swapped"
                            : "Redirected"}
                    </Pill>
                  </p>
                  {d.reason && (
                    <p className="t-caption text-fg-2">“{d.reason}”</p>
                  )}
                  {d.at && (
                    <p className="t-caption text-fg-3">Decided {d.at}</p>
                  )}
                </div>
              ))
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
