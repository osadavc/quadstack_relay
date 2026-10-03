"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui";

export function PrintButton() {
  return (
    <Button
      variant="secondary"
      icon={Printer}
      className="ml-auto print:hidden max-md:ml-0"
      onClick={() => window.print()}
    >
      Print
    </Button>
  );
}
