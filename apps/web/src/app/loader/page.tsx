import { DockQueue } from "@/components/loader/dock-queue";
import { requireUser } from "@/server/auth";
import { dockQueue } from "@/server/queries/dock";

export const metadata = { title: "Dock" };

export default async function DockQueuePage() {
  const user = await requireUser("loader");
  const q = await dockQueue(user.depot ?? "");
  return (
    <DockQueue
      cards={q.cards}
      dayLabel={q.dayLabel}
      window={q.window}
      version={q.version}
    />
  );
}
