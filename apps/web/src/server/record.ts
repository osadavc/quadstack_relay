import { type DBOrTx, schema as s } from "@relay/db";
import type { Role } from "@relay/domain";
import type { User } from "./auth";

/*
 * Writing to the shared record. Every handoff becomes an event that the
 * other roles see, and a notification for the people it affects.
 */

export interface EventInput {
  at: string;
  kind: string;
  text: string;
  actor?: Pick<User, "id" | "name" | "role"> | null;
  actorName?: string;
  role?: Role;
  orderId?: string | null;
  outletId?: string | null;
  vehicleId?: string | null;
  tripRunId?: string | null;
  source?: "online" | "offline" | "system";
  data?: unknown;
}

export async function logEvent(tx: DBOrTx, e: EventInput) {
  await tx.insert(s.events).values({
    at: e.at,
    kind: e.kind,
    text: e.text,
    role: e.role ?? e.actor?.role ?? null,
    actorId: e.actor?.id ?? null,
    actorName: e.actorName ?? e.actor?.name.split(" ")[0] ?? "Relay",
    orderId: e.orderId ?? null,
    outletId: e.outletId ?? null,
    vehicleId: e.vehicleId ?? null,
    tripRunId: e.tripRunId ?? null,
    source: e.source ?? "online",
    data: e.data ?? null,
  });
}

export type Audience = `outlet:${string}` | `user:${number}` | `role:${Role}`;

export async function notify(
  tx: DBOrTx,
  n: {
    audience: Audience;
    kind: string;
    title: string;
    body?: string;
    link?: string;
    orderId?: string;
    at: string;
  },
) {
  await tx.insert(s.notifications).values({
    audience: n.audience,
    kind: n.kind,
    title: n.title,
    body: n.body ?? null,
    link: n.link ?? null,
    orderId: n.orderId ?? null,
    at: n.at,
  });
}
