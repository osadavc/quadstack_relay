import { LiveRefresh } from "@/components/live-refresh";
import { DockShell } from "@/components/shells";
import { requireUser } from "@/server/auth";
import { revision } from "@/server/clock";
import { dockQueue } from "@/server/queries/dock";

export default async function LoaderLayout({
  children,
}: LayoutProps<"/loader">) {
  const user = await requireUser("loader");
  const depot = user.depot ?? "";
  const [rev, queue] = await Promise.all([revision(), dockQueue(depot)]);
  return (
    <DockShell
      user={{ name: user.name, title: user.title, email: user.email }}
      place={`${depot} · ${queue.dayLabel} run`}
      clock={queue.clock}
      version={queue.version}
    >
      <LiveRefresh revision={rev} />
      {children}
    </DockShell>
  );
}
