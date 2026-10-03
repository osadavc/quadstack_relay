import { NextResponse } from "next/server";
import { now, revision } from "@/server/clock";

/* Screens poll this to know when anything changed, then refresh. */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { revision: await revision(), clock: now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
