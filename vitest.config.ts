import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    // Threads pool: forked workers can fail to spawn in restricted
    // environments; threads are reliable.
    pool: "threads",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**"],
  },
});
