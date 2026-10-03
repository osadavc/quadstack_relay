import { type DBOrTx, schema as s } from "@relay/db";

/* Photos and signatures arrive as data URLs from the phone; stored as bytes. */

const MAX_BYTES = 1_500_000;

export async function saveMedia(
  tx: DBOrTx,
  dataUrl: string | null | undefined,
  kind: "photo" | "signature",
): Promise<string | null> {
  if (!dataUrl) return null;
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const data = Buffer.from(m[2], "base64");
  if (data.length > MAX_BYTES) throw new Error("Photo is too large");
  const [row] = await tx
    .insert(s.media)
    .values({ kind, mime: m[1], data })
    .returning({ id: s.media.id });
  return row.id;
}
