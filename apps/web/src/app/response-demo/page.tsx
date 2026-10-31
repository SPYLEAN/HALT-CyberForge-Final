import type { Metadata } from "next";

import { Landing } from "@/components/landing/Landing";
import { SyntheticLabNotice } from "@/components/v2/platform/SyntheticLabNotice";

export const metadata: Metadata = { title: "Response demo · HALT" };

// The earlier authored response story, preserved unchanged. The home page now presents log analysis.
export default function ResponseDemoPage() {
  return (
    <>
      <SyntheticLabNotice />
      <Landing />
    </>
  );
}
