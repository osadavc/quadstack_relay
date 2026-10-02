import { redirect } from "next/navigation";
import { currentUser, HOME } from "@/server/auth";

export default async function Home() {
  const user = await currentUser();
  redirect(user ? HOME[user.role] : "/login");
}
