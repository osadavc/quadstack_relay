"use client";

import { useEffect } from "react";
import { isOffline, useDriver } from "./store";

const EVERY_MS = 30_000;

/*
 * While a trip is accepted or on the road and the page is visible, tell
 * dispatch the driver is reachable, with the position when the driver
 * allows location. Nothing waits on it: a missed heartbeat is only a gap
 * on the live board, and records travel through the outbox.
 */
export function useHeartbeat(runId: string | null, active: boolean) {
  useEffect(() => {
    if (!runId || !active) return;
    let pos: { lat: number; lng: number } | null = null;
    let watch: number | null = null;
    let inFlight = false;

    if ("geolocation" in navigator) {
      try {
        watch = navigator.geolocation.watchPosition(
          (p) => {
            pos = { lat: p.coords.latitude, lng: p.coords.longitude };
          },
          () => {
            pos = null;
          },
          { enableHighAccuracy: false, maximumAge: 60_000, timeout: 20_000 },
        );
      } catch {
        watch = null;
      }
    }

    const beat = async () => {
      if (inFlight || document.visibilityState !== "visible") return;
      if (isOffline(useDriver.getState())) return;
      inFlight = true;
      try {
        await fetch("/api/driver/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          keepalive: true,
          body: JSON.stringify({ runId, ...(pos ?? {}) }),
        });
      } catch {
        useDriver.getState().markOffline();
      } finally {
        inFlight = false;
      }
    };

    // The first one waits a moment so a position can arrive with it.
    const first = setTimeout(() => void beat(), 3000);
    const id = setInterval(() => void beat(), EVERY_MS);
    const onVisible = () =>
      document.visibilityState === "visible" && void beat();
    // Give the app a moment to see the connection is back first.
    const onOnline = () => setTimeout(() => void beat(), 1500);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      if (watch !== null) navigator.geolocation.clearWatch(watch);
    };
  }, [runId, active]);
}
