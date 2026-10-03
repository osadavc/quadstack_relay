import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { recordView } from "@/server/queries/store";
import { RecordView } from "./record-view";

export const metadata = { title: "Delivery record" };

export default async function DeliveryRecordPage({
  params,
}: PageProps<"/store/record/[orderId]">) {
  const user = await requireUser("store");
  const { orderId } = await params;
  const r = await recordView(user, orderId);
  if (!r) notFound();
  return <RecordView r={r} />;
}
