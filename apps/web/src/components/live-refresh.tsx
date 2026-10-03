"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/*
 * Keeps a screen current. Every few seconds it asks the server for the
 * revision number; when another role has changed something, the page
 * re-renders from the server. It also re-renders once a minute so times
 * that depend on the clock (arrival estimates, the cutoff) stay right.
 */
export function LiveRefresh({
  revision,
  every = 3000,
}: {
  revision: number;
  every?: number;
}) {
  const router = useRouter();
  const seen = useRef(revision);
  seen.current = Math.max(seen.current, revision);

  useEffect(() => {
    let alive = true;
    let last = Date.now();
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        if (!res.ok) return;
        const { revision: r } = (await res.json()) as { revision: number };
        if (alive && (r > seen.current || Date.now() - last > 60_000)) {
          seen.current = Math.max(seen.current, r);
          last = Date.now();
          router.refresh();
        }
      } catch {
        // Offline or the server is restarting: try again next tick.
      }
    };
    const id = setInterval(tick, every);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [router, every]);

  return null;
}
