"use client";

import type { ReactNode } from "react";

/* ================= Mobile shell =================
 * For screens made for a phone first. On a phone the app fills the
 * viewport; on a wider screen the header spans the window and the content
 * sits in a centred column. Sheets render into #phone-portal: a bottom
 * sheet on a phone, a centred dialog from tablet width up.
 */

export function MobileShell({
  header,
  children,
}: {
  header?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      {header}
      <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col">
        {children}
      </main>
      <div
        id="phone-portal"
        className="pointer-events-none fixed inset-0 z-40 md:[&>div]:items-center md:[&>div]:justify-center md:[&>div]:p-6 md:[&_[role=dialog]]:w-full md:[&_[role=dialog]]:max-w-[440px] md:[&_[role=dialog]]:rounded-2xl md:[&_[role=dialog]]:pt-2 md:[&_[role=dialog]>div:first-child]:hidden"
      />
    </div>
  );
}
