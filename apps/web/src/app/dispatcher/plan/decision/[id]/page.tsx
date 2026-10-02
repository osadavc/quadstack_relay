import { redirect } from "next/navigation";
import { DecisionSheet } from "@/components/dispatcher/decision-sheet";
import { PlanBoard } from "@/components/dispatcher/plan-board";
import { requireUser } from "@/server/auth";
import { currentDepot } from "@/server/depot";
import { decisionView, planBoard } from "@/server/queries/dispatch";

export const metadata = { title: "Decision" };

export default async function DecisionPage({
  params,
}: PageProps<"/dispatcher/plan/decision/[id]">) {
  const user = await requireUser("dispatcher");
  const { id } = await params;
  const depot = await currentDepot(user);
  const [d, board] = await Promise.all([decisionView(id), planBoard(depot)]);
  if (!d || d.status !== "pending") redirect("/dispatcher/plan");
  return (
    <>
      {/* The plan board stays visible, but not interactive, under the sheet. */}
      <div inert className="flex min-h-0 flex-1 flex-col">
        <PlanBoard board={board} inert />
      </div>
      <DecisionSheet d={d} userName={user.name} />
    </>
  );
}
