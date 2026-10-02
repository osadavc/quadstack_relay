"use server";

import { cookies } from "next/headers";
import { act } from "@/server/action";
import { type User, userOrThrow } from "@/server/auth";
import { workingDay } from "@/server/clock";
import { currentDepot, DEPOT_COOKIE, depotList } from "@/server/depot";
import { setVehicleStatus } from "@/server/ops";
import { PlanError } from "@/server/planning";

const dispatcher = () => userOrThrow("dispatcher");
const depotOf = (user: User) => currentDepot(user);

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
