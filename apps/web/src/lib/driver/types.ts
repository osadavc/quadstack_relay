import type { DriverRecord, DriverSnapshot } from "@/server/driver";

export type Snapshot = DriverSnapshot;
export type Run = NonNullable<Snapshot["run"]>;
export type Stop = Run["stops"][number];
export type StopOrder = Stop["orders"][number];
export type RecordKind = DriverRecord["kind"];

/** A record waiting on the phone, plus the words the outbox shows for it. */
export type OutRecord = DriverRecord & { title: string; detail: string };

export interface HandoverDraft {
  counts: Record<string, number>;
  photo: string | null;
  photoAt: string | null;
  tempC: number | null;
  receiver: string | null;
  signature: string | null;
}
