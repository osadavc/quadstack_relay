import { OrderQueue } from "@/components/dispatcher/order-queue";
import { phoneOrderView } from "@/server/admin";
import { requireUser } from "@/server/auth";
import { workingDay } from "@/server/clock";
import { currentDepot } from "@/server/depot";
import { latestPlan } from "@/server/planning";
import { orderDrawer, ordersQueue } from "@/server/queries/dispatch";

export const metadata = { title: "Orders" };

export default async function OrdersPage({
  searchParams,
}: PageProps<"/dispatcher/orders">) {
  const user = await requireUser("dispatcher");
  const depot = await currentDepot(user);
  const day = await workingDay(depot);
  const [q, plan, phone] = await Promise.all([
    ordersQueue(depot),
    latestPlan(day, depot),
    phoneOrderView(depot),
  ]);
  const sp = await searchParams;
  const wanted = typeof sp.order === "string" ? sp.order : null;
  // On a desktop, open the most urgent order by default: the first protected one.
  const selectedId =
    wanted ??
    q.rows.find((r) => r.skips >= 2 && r.temp === "chilled")?.id ??
    q.rows.find((r) => r.skips >= 2)?.id ??
    null;
  const drawer =
    selectedId && q.rows.some((r) => r.id === selectedId)
      ? await orderDrawer(selectedId)
      : null;
  return (
    <OrderQueue
      q={q}
      depot={depot}
      hasPlan={Boolean(plan)}
      selectedId={selectedId}
      auto={!wanted}
      drawer={drawer}
      phone={phone}
    />
  );
}
