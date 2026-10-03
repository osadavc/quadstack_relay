"use client";

import { useEffect } from "react";
import { MobileShell } from "@/components/shells";
import { useHeartbeat } from "@/lib/driver/heartbeat";
import { parseRoute, useNav } from "@/lib/driver/nav";
import { useDriver, useView } from "@/lib/driver/store";
import type { Snapshot } from "@/lib/driver/types";
import { type Account, DriverHeader } from "./frame";
import { HandoverView } from "./views/handover";
import { OutboxView } from "./views/outbox";
import { ReconcileView } from "./views/reconcile";
import { RunView } from "./views/run";
import { StopView } from "./views/stop";

const POLL_MS = 5000;

/** Ask the service worker to keep what this page loaded, for a reload without a connection. */
function registerWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register("/sw.js", { scope: "/" })
    .then(() => navigator.serviceWorker.ready)
    .then((reg) => {
      const urls = performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .filter(
          (u) =>
            u.startsWith(window.location.origin) &&
            u.includes("/_next/static/"),
        );
      reg.active?.postMessage({
        type: "keep",
        urls: [...new Set([...urls, "/icon.svg"])],
        page: window.location.pathname,
      });
    })
    .catch(() => {});
}

/**
 * The driver app. It loads once, then switches screens without the server;
 * records queue in IndexedDB and go out whenever there is a connection.
 */
export function DriverApp({
  initial,
  userId,
  account,
}: {
  initial: Snapshot;
  userId: number;
  account: Account;
}) {
  const hydrated = useDriver((s) => s.hydrated);
  const path = useNav((s) => s.path);
  const { view } = useView();
  const run = hydrated ? view.run : null;

  useEffect(() => {
    void useDriver.getState().init(initial, userId);
    // The first snapshot is enough; later ones come from polling.
  }, [initial, userId]);

  useEffect(() => {
    if (!hydrated) return;
    const { sync } = useDriver.getState();
    const onOnline = () => {
      useDriver.setState({ netOk: true });
      void sync();
    };
    const onOffline = () => useDriver.getState().markOffline();
    const onVisible = () =>
      document.visibilityState === "visible" && void sync();
    const onPop = () => useNav.getState().sync();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("popstate", onPop);
    document.addEventListener("visibilitychange", onVisible);
    useNav.getState().sync();
    if (!navigator.onLine) onOffline();
    void sync();
    const id = setInterval(() => {
      if (document.visibilityState === "visible")
        void useDriver.getState().sync();
    }, POLL_MS);
    registerWorker();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(id);
    };
  }, [hydrated]);

  useHeartbeat(
    run?.id ?? null,
    Boolean(run && ["accepted", "on_road"].includes(run.status)),
  );

  const route = parseRoute(path);

  if (!hydrated)
    return (
      <MobileShell>
        <div className="flex flex-1 items-center justify-center t-small text-fg-3">
          Loading
        </div>
      </MobileShell>
    );

  return (
    <MobileShell header={<DriverHeader account={account} />}>
      {route.view === "stop" ? (
        <StopView seq={route.seq} />
      ) : route.view === "handover" ? (
        <HandoverView seq={route.seq} />
      ) : route.view === "outbox" ? (
        <OutboxView />
      ) : route.view === "reconcile" ? (
        <ReconcileView />
      ) : (
        <RunView />
      )}
    </MobileShell>
  );
}
