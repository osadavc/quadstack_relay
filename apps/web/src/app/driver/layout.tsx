import type { Metadata } from "next";
import { requireUser } from "@/server/auth";

export const metadata: Metadata = { title: "Driver" };

export default async function DriverLayout({
  children,
}: LayoutProps<"/driver">) {
  await requireUser("driver");
  return children;
}
