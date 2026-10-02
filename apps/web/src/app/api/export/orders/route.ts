import { userOrThrow } from "@/server/auth";
import { currentDepot } from "@/server/depot";
import { ordersQueue } from "@/server/queries/dispatch";

/* The order queue as CSV, for the dispatcher's own records. */
export async function GET() {
  try {
    const user = await userOrThrow("dispatcher");
    const depot = await currentDepot(user);
    const q = await ordersQueue(depot);
    const rows = [
      [
        "Order",
        "Outlet",
        "Name",
        "Brand",
        "District",
        "Temp",
        "Cases",
        "Kg",
        "m3",
        "Window",
        "Access",
        "Placed",
        "Status",
      ],
      ...q.rows.map((r) => [
        r.id,
        r.outletId,
        r.outlet,
        r.brand,
        r.district,
        r.temp,
        r.units,
        Math.round(r.weightKg),
        r.volumeM3.toFixed(2),
        r.window,
        r.access,
        r.placed,
        r.status,
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="relay-orders-${q.day}-${depot.toLowerCase()}.csv"`,
      },
    });
  } catch {
    return new Response("Sign in as a dispatcher", { status: 401 });
  }
}
