"use server";

import { act } from "@/server/action";
import { userOrThrow } from "@/server/auth";
import {
  ackChange,
  flagShortfall,
  loadAll,
  releaseVehicle,
  type ShortfallReason,
  setUnit,
  startLoading,
} from "@/server/dock";

const loader = () => userOrThrow("loader");

export async function startLoadingAction(runId: string) {
  return act(async () => startLoading(await loader(), runId));
}

export async function setUnitAction(
  runId: string,
  unitId: string,
  loaded: boolean,
) {
  return act(async () => setUnit(await loader(), runId, unitId, loaded));
}

export async function loadAllAction(runId: string) {
  return act(async () => loadAll(await loader(), runId));
}

export async function flagAction(
  runId: string,
  input: {
    unitId: string;
    reason: ShortfallReason;
    cases: number;
    note?: string;
    photo?: string | null;
  },
) {
  return act(async () => flagShortfall(await loader(), runId, input));
}

export async function ackChangeAction(runId: string) {
  return act(async () => ackChange(await loader(), runId));
}

export async function releaseAction(
  runId: string,
  seal: string,
  reeferTempC?: number | null,
) {
  return act(async () =>
    releaseVehicle(await loader(), runId, seal, reeferTempC),
  );
}
