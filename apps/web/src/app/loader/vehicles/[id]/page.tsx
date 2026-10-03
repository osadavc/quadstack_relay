import { notFound } from "next/navigation";
import { LoadSheet } from "@/components/loader/load-sheet";
import { requireUser } from "@/server/auth";
import { loadSheet } from "@/server/queries/dock";

export const metadata = { title: "Load sheet" };

export default async function LoadSheetPage({
  params,
}: PageProps<"/loader/vehicles/[id]">) {
  await requireUser("loader");
  const { id } = await params;
  const data = /^[0-9a-f-]{36}$/.test(id) ? await loadSheet(id) : null;
  if (!data) notFound();
  return <LoadSheet data={data} />;
}
