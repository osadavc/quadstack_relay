import { NextResponse } from "next/server";
import { userOrThrow } from "@/server/auth";
import { driverSnapshot } from "@/server/driver";

export const dynamic = "force-dynamic";

/* The driver's run, cached on the phone for offline use. */
export async function GET() {
  try {
    const user = await userOrThrow("driver");
    return NextResponse.json(await driverSnapshot(user), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Sign in again" }, { status: 401 });
  }
}
