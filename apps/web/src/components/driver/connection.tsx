"use client";

import { hhmm } from "@relay/domain";
import { CloudOff, Inbox, RefreshCw } from "lucide-react";
import { PhoneSheet } from "@/components/interact";
import { Button, Dot } from "@/components/ui";
import { useNav } from "@/lib/driver/nav";
import { browserOnline, isOffline, useDriver } from "@/lib/driver/store";
import { ActionButton, records } from "./frame";

export function ConnectionSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const s = useDriver();
  const go = useNav((n) => n.go);
  const offline = isOffline(s);
  const waiting = s.outbox.length;
  const synced = s.lastSync ? hhmm(s.lastSync) : "";
  return (
    <PhoneSheet
      open={open}
      onClose={onClose}
      title={offline ? "Offline" : "Online"}
      description={
        waiting
          ? `${records(waiting)} ${offline ? "waiting to send" : "sending now"}`
          : `All records sent · last synced ${synced}`
      }
      actions={<ActionButton onClick={onClose}>Done</ActionButton>}
    >
      <div className="flex flex-col gap-3 pb-2">
        <p className="flex items-center gap-2 t-small-m">
          {offline ? (
            <CloudOff
              size={16}
              strokeWidth={1.7}
              className="text-warning-text"
              aria-hidden
            />
          ) : (
            <Dot tone="success" />
          )}
          {offline
            ? s.outage
              ? `No connection since ${hhmm(s.outage.since)}`
              : "No connection"
            : `Connected · synced ${synced}`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="lg"
            icon={Inbox}
            onClick={() => {
              onClose();
              go("/driver/outbox");
            }}
          >
            Outbox
          </Button>
          {(waiting > 0 || offline) && (
            <Button
              size="lg"
              icon={RefreshCw}
              onClick={() => void s.sync()}
              disabled={s.syncing || !browserOnline()}
            >
              {offline ? "Try again" : "Send now"}
            </Button>
          )}
        </div>
      </div>
    </PhoneSheet>
  );
}
