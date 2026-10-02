import { revalidatePath } from "next/cache";
import { AuthError } from "./auth";
import { OrderError } from "./orders";
import { PlanError } from "./planning";
import { ProductError } from "./products";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const KNOWN = [AuthError, PlanError, ProductError, OrderError];

/** Run a mutation, refresh every screen, and turn known errors into messages. */
export async function act<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (e) {
    if (KNOWN.some((K) => e instanceof K))
      return { ok: false, error: (e as Error).message };
    console.error(e);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}
