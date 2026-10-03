"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acknowledgeAction } from "@/app/actions/store";
import {
  CallDialog,
  CallSheet,
  type Contact,
  toast,
  useDisclosure,
} from "@/components/interact";
import { useIsPhone } from "@/components/store/bits";
import { Button, cx } from "@/components/ui";

export function NoticeActions({
  noticeId,
  acknowledged,
  contact,
}: {
  noticeId: string | null;
  acknowledged: boolean;
  contact: Contact;
}) {
  const router = useRouter();
  const call = useDisclosure();
  const [done, setDone] = useState(acknowledged);
  const [pending, start] = useTransition();
  const phone = useIsPhone();
  const canCall = Boolean(contact.phone);
  // Nothing to do here without a number to call or a notice to acknowledge.
  if (!canCall && !noticeId) return null;
  return (
    <>
      <div
        className={cx(
          "grid gap-2.5",
          canCall && noticeId ? "grid-cols-2" : "grid-cols-1",
        )}
      >
        {canCall && (
          <Button
            variant="secondary"
            size="xl"
            className="md:h-10"
            onClick={call.onOpen}
          >
            Call dispatch
          </Button>
        )}
        {noticeId &&
          (done ? (
            <span
              aria-live="polite"
              className="inline-flex h-[46px] items-center justify-center gap-2 rounded-xl bg-success-tint f-label text-success-text md:h-10"
            >
              <Check size={18} strokeWidth={2} aria-hidden />
              Noted
            </span>
          ) : (
            <Button
              variant="primary"
              size="xl"
              className="md:h-10"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await acknowledgeAction(noticeId);
                  if (!res.ok) return toast(res.error, { tone: "warning" });
                  setDone(true);
                  router.refresh();
                })
              }
            >
              Understood
            </Button>
          ))}
      </div>
      {canCall &&
        (phone ? (
          <CallSheet
            open={call.open}
            onClose={call.onClose}
            contact={contact}
          />
        ) : (
          <CallDialog
            open={call.open}
            onClose={call.onClose}
            contact={contact}
          />
        ))}
    </>
  );
}
