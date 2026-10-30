import { Suspense } from "react";

import { AtlasApp } from "@/components/ps3/AtlasApp";

export default function AtlasPage() {
  return (
    <Suspense fallback={<p className="ps3-body" style={{ padding: 24 }}>Loading the Connector Atlas…</p>}>
      <AtlasApp />
    </Suspense>
  );
}
