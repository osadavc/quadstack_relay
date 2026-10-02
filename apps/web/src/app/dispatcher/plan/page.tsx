import { PlanBoard } from "@/components/dispatcher/plan-board";
import { requireUser } from "@/server/auth";
import { currentDepot } from "@/server/depot";
import { planBoard } from "@/server/queries/dispatch";

export const metadata = { title: "Plan" };

export default async function PlanPage() {
  const user = await requireUser("dispatcher");
  const depot = await currentDepot(user);
  return <PlanBoard board={await planBoard(depot)} />;
}
