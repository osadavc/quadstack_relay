"use server";

import { act } from "@/server/action";
import { userOrThrow } from "@/server/auth";
import type { OrderItem } from "@/server/orders";
import {
  acknowledge,
  confirmReceipt,
  markRead,
  placeOrder,
  reportIssue,
} from "@/server/store";

const manager = () => userOrThrow("store");

export async function placeOrderAction(items: OrderItem[]) {
  return act(async () => placeOrder(await manager(), items));
}

export async function acknowledgeAction(notificationId: string) {
  return act(async () => acknowledge(await manager(), notificationId));
}

export async function confirmReceiptAction(
  orderId: string,
  counts: Record<string, number>,
  note?: string,
  photo?: string | null,
) {
  return act(async () =>
    confirmReceipt(await manager(), orderId, counts, note, photo),
  );
}

export async function reportIssueAction(
  kind: string,
  note?: string,
  orderId?: string,
) {
  return act(async () => reportIssue(await manager(), kind, note, orderId));
}

export async function markReadAction() {
  return act(async () => {
    const user = await userOrThrow();
    const audiences = [`user:${user.id}`, `role:${user.role}`];
    if (user.outletId) audiences.push(`outlet:${user.outletId}`);
    await markRead(audiences);
    return null;
  });
}
