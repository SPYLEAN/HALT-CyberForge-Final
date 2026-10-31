import type { Metadata } from "next";

import { ProductLanding } from "@/components/landing/ProductLanding";

export const metadata: Metadata = { title: "HALT · Proof-Carrying Kill Chain Intelligence" };

export default function Home() {
  return <ProductLanding />;
}
