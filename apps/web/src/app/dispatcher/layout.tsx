import { LiveRefresh } from "@/components/live-refresh";
import { DispatcherShell } from "@/components/shells";
import { requireUser } from "@/server/auth";
import { revision } from "@/server/clock";
import { currentDepot, depotList } from "@/server/depot";
import { fleetRecords, outletWatch, sidebar } from "@/server/queries/dispatch";

export default async function DispatcherLayout({
  children,
}: LayoutProps<"/dispatcher">) {
  const user = await requireUser("dispatcher");
  const depot = await currentDepot(user);
  const [rev, counts, fleet, outlets] = await Promise.all([
    revision(),
    sidebar(depot),
    fleetRecords(depot),
    outletWatch(depot),
  ]);
  return (
    <DispatcherShell
      user={{ name: user.name, title: user.title, email: user.email }}
      depot={depot}
      depots={await depotList()}
      counts={counts}
      fleet={fleet}
      outlets={outlets}
    >
      <LiveRefresh revision={rev} />
      {children}
    </DispatcherShell>
  );
}
