import { LiveBoard } from "@/components/dispatcher/live-board";
import { requireUser } from "@/server/auth";
import { currentDepot } from "@/server/depot";
import { liveBoard } from "@/server/queries/dispatch";

export const metadata = { title: "Live" };

export default async function LivePage() {
  const user = await requireUser("dispatcher");
  const depot = await currentDepot(user);
  return <LiveBoard live={await liveBoard(depot)} />;
}
