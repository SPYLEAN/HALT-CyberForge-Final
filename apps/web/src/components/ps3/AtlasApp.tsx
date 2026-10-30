"use client";

import { AtlasView } from "./AtlasView";
import { useUrlAtlas } from "./hooks";

/** /atlas: the Connector Atlas with its state in the URL. */
export function AtlasApp() {
  const store = useUrlAtlas("/atlas");
  return <AtlasView store={store} />;
}
