import { People } from "@/components/dispatcher/people";
import { peopleView } from "@/server/admin";
import { requireUser } from "@/server/auth";
import { currentDepot } from "@/server/depot";

export const metadata = { title: "People" };

export default async function PeoplePage() {
  const user = await requireUser("dispatcher");
  const depot = await currentDepot(user);
  return <People data={await peopleView()} me={user.id} depot={depot} />;
}
