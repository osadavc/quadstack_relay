import { requireUser } from "@/server/auth";
import { todayView } from "@/server/queries/store";
import { TodayView } from "./today-view";

export const metadata = { title: "Deliveries" };

export default async function OnTheWayPage() {
  const user = await requireUser("store");
  return <TodayView data={await todayView(user)} />;
}
