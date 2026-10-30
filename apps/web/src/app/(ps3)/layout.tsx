import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@/styles/ps3.css";

// PS3 Connector Atlas: contract-isolated (docs/PS3_PRODUCT_RFC.md). No incident providers, no API connection.
export const metadata: Metadata = {
  title: "Connector Atlas · HALT",
  description: "Connect any security tool. Write configuration, not connector code.",
};

export default function Ps3Layout({ children }: { children: ReactNode }) {
  return children;
}
