"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { AccountMenu } from "../account-menu";
import { RelayMark } from "../brand";
import { cx, Dot } from "../ui";

type ShellUser = { name: string; title: string; email: string };

const COLOMBO = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Colombo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/* Depot time, starting from the server's reading so the first render matches. */
function useDepotClock(initial: string) {
  const [clock, setClock] = useState(initial);
  useEffect(() => {
    const tick = () => setClock(COLOMBO.format(new Date()));
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, []);
  return clock;
}

/* ================= Loader dock ================= */

export function DockShell({
  user,
  place,
  clock,
  version,
  children,
}: {
  user: ShellUser;
  place: string;
  clock: string;
  version: number | null;
  children: ReactNode;
}) {
  const path = usePathname();
  const now = useDepotClock(clock);
  // The load sheet has its own header on a phone (L5).
  const ownPhoneHeader = /^\/loader\/vehicles\/[^/]+$/.test(path);
  return (
    <div className="flex h-dvh min-h-[560px] flex-col bg-canvas">
      <header
        className={cx(
          "flex h-16 shrink-0 items-center gap-3.5 bg-inverse px-5 text-fg-inverse max-md:h-14 max-md:gap-2.5 max-md:px-4",
          ownPhoneHeader && "max-md:hidden",
        )}
      >
        <RelayMark size={32} surface="dark" />
        <div className="min-w-0">
          <p className="t-body-m">Relay Dock</p>
          <p className="truncate t-caption text-fg-inverse/55">{place}</p>
        </div>
        <div className="flex-1 text-center">
          <time className="font-mono text-[17px] font-medium tabular-nums max-md:text-[15px]">
            {now}
          </time>
        </div>
        <span className="flex h-7 items-center gap-2 rounded-full bg-white/12 px-3 t-small-m max-sm:hidden">
          <Dot tone={version ? "success" : "offline"} />
          {version ? `Plan v${version}` : "No plan yet"}
        </span>
        <AccountMenu user={user} tone="warning" trigger="pill" />
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
