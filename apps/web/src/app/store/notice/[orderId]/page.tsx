import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { noticeView } from "@/server/queries/store";
import { NoticeView } from "./notice-view";

export const metadata = { title: "Moved order" };

export default async function NoticePage({
  params,
}: PageProps<"/store/notice/[orderId]">) {
  const user = await requireUser("store");
  const { orderId } = await params;
  const n = await noticeView(user, orderId);
  if (!n) notFound();
  return <NoticeView n={n} />;
}
