import { db, schema as s } from "@relay/db";
import { eq } from "drizzle-orm";
import { currentUser } from "@/server/auth";

/* Photos and signatures, for signed-in users only. */
export async function GET(_: Request, ctx: RouteContext<"/api/media/[id]">) {
  if (!(await currentUser())) return new Response("Sign in", { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id))
    return new Response("Not found", { status: 404 });
  const [m] = await db.select().from(s.media).where(eq(s.media.id, id));
  if (!m) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(m.data), {
    headers: {
      "Content-Type": m.mime,
      "Cache-Control": "private, max-age=86400",
    },
  });
}
