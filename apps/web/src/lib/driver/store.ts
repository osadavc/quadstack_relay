"use client";

import { colomboTime, maxOps } from "@relay/domain";
import { get as idbGet, set as idbSet } from "idb-keyval";
import { useMemo } from "react";
import { create } from "zustand";
import { toast } from "@/components/interact";
import { applyOutbox } from "./apply";
import { recordTime } from "./clock";
import type { HandoverDraft, OutRecord, RecordKind, Snapshot } from "./types";

/*
 * The driver's state on this device: the last snapshot from the server, the
 * outbox of records not yet sent, and handover drafts. All of it is kept in
 * IndexedDB, so a reload or a closed browser loses nothing. The outbox is
 * sent oldest first whenever there is a connection; the server applies each
 * record once, by its id.
 */

interface Persisted {
  epoch: string;
  base: Snapshot;
  outbox: OutRecord[];
  lastSync: string | null;
  /** The last time records made offline went out. */
  sent: { count: number; at: string } | null;
  /** When the connection was lost. */
  outage: { since: string } | null;
  drafts: Record<string, HandoverDraft>;
}

interface State extends Persisted {
  userId: number;
  hydrated: boolean;
  /** Last request reached the server. */
  netOk: boolean;
  syncing: boolean;
  init: (initial: Snapshot, userId: number) => Promise<void>;
  record: (
    kind: RecordKind,
    opts: {
      at: string;
      runId?: string;
      seq?: number;
      payload?: Record<string, unknown>;
      title: string;
      detail: string;
    },
  ) => void;
  sync: () => Promise<void>;
  /** A request failed or the browser went offline. */
  markOffline: () => void;
  setDraft: (seq: number, patch: Partial<HandoverDraft>) => void;
  clearDraft: (seq: number) => void;
}

const keyFor = (userId: number) => `relay-driver-${userId}`;

/** crypto.randomUUID needs a secure context; phones on a LAN address may not have one. */
export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      // fall through
    }
  }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const browserOnline = () =>
  typeof navigator === "undefined" || navigator.onLine;

export const isOffline = (s: Pick<State, "netOk">) =>
  !s.netOk || !browserOnline();

const PERSISTED: (keyof Persisted)[] = [
  "epoch",
  "base",
  "outbox",
  "lastSync",
  "sent",
  "outage",
  "drafts",
];

export const useDriver = create<State>()((set, get) => ({
  userId: 0,
  hydrated: false,
  netOk: true,
  syncing: false,
  epoch: "",
  base: null as unknown as Snapshot,
  outbox: [],
  lastSync: null,
  sent: null,
  outage: null,
  drafts: {},

  init: async (initial, userId) => {
    let stored: Persisted | undefined;
    try {
      stored = await idbGet<Persisted>(keyFor(userId));
    } catch {
      stored = undefined; // private mode or storage blocked: run in memory
    }
    if (stored && stored.epoch === initial.epoch && stored.base) {
      // A page served from the offline cache carries an older snapshot.
      const base =
        stored.base.revision > initial.revision ? stored.base : initial;
      set({
        userId,
        hydrated: true,
        epoch: stored.epoch,
        base,
        outbox: stored.outbox ?? [],
        lastSync: stored.lastSync
          ? maxOps(stored.lastSync, initial.clock)
          : initial.clock,
        sent: stored.sent ?? null,
        outage: stored.outage?.since ? { since: stored.outage.since } : null,
        drafts: stored.drafts ?? {},
      });
    } else {
      set({
        userId,
        hydrated: true,
        epoch: initial.epoch,
        base: initial,
        outbox: [],
        lastSync: initial.clock,
        sent: null,
        outage: null,
        drafts: {},
      });
    }
    useDriver.subscribe((s, prev) => {
      if (!s.hydrated || !PERSISTED.some((k) => s[k] !== prev[k])) return;
      const data = Object.fromEntries(
        PERSISTED.map((k) => [k, s[k]]),
      ) as unknown as Persisted;
      idbSet(keyFor(s.userId), data).catch(() => {});
    });
  },

  record: (kind, opts) => {
    const s = get();
    const rec: OutRecord = {
      clientId: uuid(),
      kind,
      at: opts.at,
      offline: isOffline(s),
      runId: opts.runId,
      seq: opts.seq,
      payload: opts.payload ?? {},
      title: opts.title,
      detail: opts.detail,
    };
    set({ outbox: [...s.outbox, rec] });
    void get().sync();
  },

  sync: async () => {
    const s = get();
    if (!s.hydrated || s.syncing || !browserOnline()) return;
    set({ syncing: true });
    try {
      if (s.outbox.length) {
        const batch = s.outbox.slice(0, 100);
        const res = await fetch("/api/driver/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            records: batch.map(({ title: _t, detail: _d, ...r }) => r),
          }),
        });
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!res.ok) throw new Error(`sync ${res.status}`);
        const { results, snapshot } = (await res.json()) as {
          results: {
            clientId: string;
            ok: boolean;
            duplicate?: boolean;
            error?: string;
          }[];
          snapshot: Snapshot;
        };
        const done = new Set(results.map((r) => r.clientId));
        const refused = results.filter((r) => !r.ok);
        const wentOut = batch.filter(
          (r) =>
            r.offline && results.some((x) => x.clientId === r.clientId && x.ok),
        );
        set((st) =>
          adopt(st, snapshot, {
            outbox: st.outbox.filter((r) => !done.has(r.clientId)),
            sent: wentOut.length
              ? { count: wentOut.length, at: snapshot.clock }
              : st.sent,
          }),
        );
        for (const r of refused)
          toast(r.error ?? "A record was not accepted", { tone: "warning" });
      } else {
        const res = await fetch("/api/driver/run", { cache: "no-store" });
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!res.ok) throw new Error(`run ${res.status}`);
        const snapshot = (await res.json()) as Snapshot;
        set((st) => adopt(st, snapshot, {}));
      }
    } catch {
      get().markOffline();
    } finally {
      set({ syncing: false });
      // Anything recorded while the request was in flight goes next.
      const after = get();
      if (after.netOk && after.outbox.length)
        setTimeout(() => void get().sync(), 50);
    }
  },

  markOffline: () => {
    const st = get();
    set({
      netOk: false,
      outage: st.outage ?? { since: colomboTime() },
    });
  },

  setDraft: (seq, patch) =>
    set((st) => {
      const cur = st.drafts[String(seq)] ?? {
        counts: {},
        photo: null,
        photoAt: null,
        tempC: null,
        receiver: "",
        signature: null,
      };
      return { drafts: { ...st.drafts, [String(seq)]: { ...cur, ...patch } } };
    }),
  clearDraft: (seq) =>
    set((st) => {
      const next = { ...st.drafts };
      delete next[String(seq)];
      return { drafts: next };
    }),
}));

/** Take a server snapshot; a new epoch means the server's data was reset. */
function adopt(
  st: State,
  snapshot: Snapshot,
  patch: Partial<Persisted>,
): Partial<State> {
  if (snapshot.epoch !== st.epoch) {
    return {
      epoch: snapshot.epoch,
      base: snapshot,
      outbox: [],
      drafts: {},
      sent: null,
      outage: null,
      netOk: true,
      lastSync: snapshot.clock,
    };
  }
  return {
    ...patch,
    base: snapshot,
    netOk: true,
    lastSync: snapshot.clock,
    outage: null,
  };
}

/** The time for a record made now. */
export const nowAt = () => recordTime(useDriver.getState().outbox);

/** The run as this device sees it: server snapshot plus waiting records. */
export function useView() {
  const base = useDriver((s) => s.base);
  const outbox = useDriver((s) => s.outbox);
  return useMemo(() => ({ view: applyOutbox(base, outbox) }), [base, outbox]);
}

export function useOffline() {
  return useDriver((s) => isOffline(s));
}
