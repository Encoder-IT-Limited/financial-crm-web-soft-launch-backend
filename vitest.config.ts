import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "src/modules/**/__tests__/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    testTimeout: 20000,
  },
});
