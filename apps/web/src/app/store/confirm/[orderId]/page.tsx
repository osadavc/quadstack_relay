import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { confirmView } from "@/server/queries/store";
import { ConfirmForm } from "./confirm-form";

export const metadata = { title: "Confirm receipt" };

export default async function ConfirmPage({
  params,
}: PageProps<"/store/confirm/[orderId]">) {
  const user = await requireUser("store");
  const { orderId } = await params;
  const data = await confirmView(user, orderId);
  if (!data) notFound();
  return <ConfirmForm data={data} />;
}
