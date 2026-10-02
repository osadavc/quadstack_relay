"use server";

import type { PolicyId } from "@relay/engine";
import { cookies } from "next/headers";
import { act } from "@/server/action";
import {
  createPhoneOrder,
  createUser,
  type NewUser,
  resetPassword,
  setUserActive,
} from "@/server/admin";
import { type User, userOrThrow } from "@/server/auth";
import { workingDay } from "@/server/clock";
import { currentDepot, DEPOT_COOKIE, depotList } from "@/server/depot";
import { setVehicleStatus } from "@/server/ops";
import type { OrderItem } from "@/server/orders";
import {
  type DecisionChoice,
  decide,
  moveOrder,
  moveTargets,
  PlanError,
  publishPlan,
  releasePin,
  runPlan,
} from "@/server/planning";
import {
  createProduct,
  importProducts,
  type ProductInput,
  setProductActive,
  updateProduct,
} from "@/server/products";

const dispatcher = () => userOrThrow("dispatcher");
const depotOf = (user: User) => currentDepot(user);

export async function runPlanAction(depot: string, policy: PolicyId) {
  return act(async () => runPlan(await dispatcher(), depot, policy));
}

export async function decideAction(decisionId: string, choice: DecisionChoice) {
  return act(async () => decide(await dispatcher(), decisionId, choice));
}

export async function moveTargetsAction(planId: string, orderId: string) {
  return act(async () => {
    await dispatcher();
    return moveTargets(planId, orderId);
  });
}

export async function moveOrderAction(
  planId: string,
  orderId: string,
  target: { vehicleId: string } | { defer: string },
) {
  return act(async () =>
    moveOrder(await dispatcher(), planId, orderId, target),
  );
}

export async function releasePinAction(planId: string, orderId: string) {
  return act(async () => releasePin(await dispatcher(), planId, orderId));
}

export async function publishAction(planId: string) {
  return act(async () => publishPlan(await dispatcher(), planId));
}

export async function setDepotAction(depot: string) {
  return act(async () => {
    await dispatcher();
    if (!(await depotList()).some((d) => d.id === depot))
      throw new PlanError("Unknown depot");
    (await cookies()).set(DEPOT_COOKIE, depot, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });
    return null;
  });
}

export async function vehicleStatusAction(
  vehicleId: string,
  status: "available" | "workshop",
  note?: string,
) {
  return act(async () => {
    const user = await dispatcher();
    const depot = await depotOf(user);
    return setVehicleStatus(
      user,
      await workingDay(depot),
      vehicleId,
      status,
      note,
    );
  });
}

/* ---------- People and phoned-in orders ---------- */

export async function createUserAction(input: NewUser) {
  return act(async () => createUser(await dispatcher(), input));
}

export async function setUserActiveAction(id: number, active: boolean) {
  return act(async () => setUserActive(await dispatcher(), id, active));
}

export async function resetPasswordAction(id: number, password: string) {
  return act(async () => {
    await dispatcher();
    return resetPassword(id, password);
  });
}

export async function phoneOrderAction(outletId: string, items: OrderItem[]) {
  return act(async () => createPhoneOrder(await dispatcher(), outletId, items));
}

/* ---------- Products ---------- */

export async function createProductAction(input: ProductInput) {
  return act(async () => createProduct(await dispatcher(), input));
}

export async function updateProductAction(id: number, input: ProductInput) {
  return act(async () => updateProduct(await dispatcher(), id, input));
}

export async function setProductActiveAction(id: number, active: boolean) {
  return act(async () => setProductActive(await dispatcher(), id, active));
}

export async function importProductsAction(csv: string) {
  return act(async () => importProducts(await dispatcher(), csv));
}
