import { LiveRefresh } from "@/components/live-refresh";
import { StoreShell } from "@/components/shells";
import { requireUser } from "@/server/auth";
import { revision } from "@/server/clock";
import { storeHeader } from "@/server/queries/store";

export default async function StoreLayout({ children }: LayoutProps<"/store">) {
  const user = await requireUser("store");
  const [rev, header] = await Promise.all([revision(), storeHeader(user)]);
  return (
    <StoreShell
      user={{ name: user.name, title: user.title, email: user.email }}
      header={header}
    >
      <LiveRefresh revision={rev} />
      {children}
    </StoreShell>
  );
}
