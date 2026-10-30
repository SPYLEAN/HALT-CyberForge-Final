import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    // The first render of a view in a file loads the whole Command Center into jsdom; on a loaded machine
    // that alone can pass the 5 s default. A time budget, not an assertion: expectations are unchanged.
    testTimeout: 15_000,
  },
});
