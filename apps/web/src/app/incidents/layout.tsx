import type { ReactNode } from "react";

import { SyntheticLabNotice } from "@/components/v2/platform/SyntheticLabNotice";

export default function SyntheticLabLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SyntheticLabNotice />
      {children}
    </>
  );
}
