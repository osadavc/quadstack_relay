"use client";

import { create } from "zustand";

/*
 * The driver app switches screens with the History API instead of server
 * navigations, so it keeps working with no signal once it has loaded.
 */
export const useNav = create<{
  path: string;
  go: (path: string, replace?: boolean) => void;
  sync: () => void;
}>()((set) => ({
  path: typeof window === "undefined" ? "/driver" : window.location.pathname,
  go: (path, replace) => {
    if (replace) window.history.replaceState(null, "", path);
    else window.history.pushState(null, "", path);
    set({ path });
    window.scrollTo?.(0, 0);
  },
  sync: () => set({ path: window.location.pathname }),
}));

export type DriverRoute =
  | { view: "run" }
  | { view: "stop"; seq: number }
  | { view: "handover"; seq: number }
  | { view: "outbox" }
  | { view: "reconcile" };

export function parseRoute(path: string): DriverRoute {
  const parts = path
    .replace(/^\/driver\/?/, "")
    .split("/")
    .filter(Boolean);
  const seq = Number(parts[1]);
  if (parts[0] === "stop" && seq > 0) return { view: "stop", seq };
  if (parts[0] === "handover" && seq > 0) return { view: "handover", seq };
  if (parts[0] === "outbox") return { view: "outbox" };
  if (parts[0] === "reconcile") return { view: "reconcile" };
  return { view: "run" };
}
