import { ArrowRight, CircleX } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RelayMark } from "@/components/brand";
import { currentUser } from "@/server/auth";
import { acceptLoad, DriverError } from "@/server/driver";

export const metadata = { title: "Accept the load" };

/*
 * The dock's QR code opens this link on the driver's phone. Signed in as the
 * vehicle's driver, it accepts the load and opens the run.
 */
export default async function HandoverLink({
  params,
}: PageProps<"/h/[token]">) {
  const { token } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/h/${token}`)}`);

  let problem: string;
  if (user.role !== "driver") {
    problem = "Sign in as the vehicle’s driver to accept this load.";
  } else {
    try {
      await acceptLoad(user, token);
      problem = "";
    } catch (e) {
      problem =
        e instanceof DriverError
          ? e.message
          : "The load couldn’t be accepted. Try the code instead.";
    }
  }
  if (!problem) redirect("/driver");

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-5">
      <div className="flex w-full max-w-[380px] flex-col gap-4 rounded-2xl border border-line bg-surface p-6 shadow-pop">
        <RelayMark size={32} />
        <div className="flex items-start gap-2.5">
          <CircleX
            size={20}
            strokeWidth={1.7}
            className="mt-0.5 shrink-0 text-danger-text"
            aria-hidden
          />
          <div className="flex flex-col gap-1">
            <h1 className="f-heading">Not accepted</h1>
            <p className="t-body text-fg-2">{problem}</p>
          </div>
        </div>
        <Link
          href="/driver"
          className="flex h-[46px] items-center justify-center gap-2 rounded-xl bg-inverse f-label text-fg-inverse transition-colors hover:bg-[#35322e] md:h-10 md:rounded-[10px]"
        >
          Open your run
          <ArrowRight size={18} strokeWidth={1.8} aria-hidden />
        </Link>
      </div>
    </div>
  );
}
