import { requireUser } from "@/server/auth";
import { receiptsList } from "@/server/queries/store";
import { ReceiptsView } from "./receipts-view";

export const metadata = { title: "Receipts" };

export default async function ReceiptsPage() {
  const user = await requireUser("store");
  return <ReceiptsView rows={await receiptsList(user)} />;
}
