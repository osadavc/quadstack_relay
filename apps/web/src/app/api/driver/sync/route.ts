import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { userOrThrow } from "@/server/auth";
import { applyRecords, driverSnapshot, recordSchema } from "@/server/driver";

export const dynamic = "force-dynamic";

const body = z.object({ records: z.array(recordSchema).max(200) });

/*
 * The phone's outbox. Records are applied oldest first, each exactly once:
 * a record already seen (same clientId) is acknowledged without applying it
 * again, so a retry after a dropped connection is safe.
 */
export async function POST(req: Request) {
  let user: Awaited<ReturnType<typeof userOrThrow>>;
  try {
    user = await userOrThrow("driver");
  } catch {
    return NextResponse.json({ error: "Sign in again" }, { status: 401 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Bad records" }, { status: 400 });
  const results = await applyRecords(user, parsed.data.records);
  revalidatePath("/", "layout");
  return NextResponse.json({ results, snapshot: await driverSnapshot(user) });
}
