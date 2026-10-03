import { DriverApp } from "@/components/driver/driver-app";
import { requireUser } from "@/server/auth";
import { driverSnapshot } from "@/server/driver";

/* Every driver screen is this one page, switched on the client. */
export default async function DriverPage() {
  const user = await requireUser("driver");
  const snapshot = await driverSnapshot(user);
  return (
    <DriverApp
      initial={snapshot}
      userId={user.id}
      account={{ name: user.name, title: user.title, email: user.email }}
    />
  );
}
