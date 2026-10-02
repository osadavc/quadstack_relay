import { notFound } from "next/navigation";
import { ReleaseScreen } from "@/components/loader/release";
import { requireUser } from "@/server/auth";
import { loadSheet } from "@/server/queries/dock";

export const metadata = { title: "Release" };

export default async function ReleasePage({
  params,
}: PageProps<"/loader/vehicles/[id]/release">) {
  await requireUser("loader");
  const { id } = await params;
  const data = /^[0-9a-f-]{36}$/.test(id) ? await loadSheet(id) : null;
  if (!data) notFound();
  return <ReleaseScreen data={data} />;
}
