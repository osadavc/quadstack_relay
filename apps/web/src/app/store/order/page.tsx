import { requireUser } from "@/server/auth";
import { orderForm } from "@/server/queries/store";
import { OrderForm } from "./order-form";

export const metadata = { title: "Place order" };

export default async function PlaceOrderPage() {
  const user = await requireUser("store");
  const data = await orderForm(user);
  return <OrderForm data={data} />;
}
