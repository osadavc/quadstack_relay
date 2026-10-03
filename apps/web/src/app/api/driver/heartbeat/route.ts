import { NextResponse } from "next/server";
import { z } from "zod";
import { userOrThrow } from "@/server/auth";
import { heartbeat } from "@/server/driver";

export const dynamic = "force-dynamic";

const body = z.object({
  runId: z.string().uuid(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
});

/* The driver's phone checks in while it has signal, with its position if allowed. */
export async function POST(req: Request) {
  try {
    const user = await userOrThrow("driver");
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    await heartbeat(user, parsed.data.runId, parsed.data.lat, parsed.data.lng);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
}
