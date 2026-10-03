import { Products } from "@/components/dispatcher/products";
import { requireUser } from "@/server/auth";
import { productsView } from "@/server/products";

export const metadata = { title: "Products" };

export default async function ProductsPage() {
  await requireUser("dispatcher");
  return <Products products={await productsView()} />;
}
