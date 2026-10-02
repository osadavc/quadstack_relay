import { redirect } from "next/navigation";

export default function DispatcherHome() {
  redirect("/dispatcher/orders");
}
