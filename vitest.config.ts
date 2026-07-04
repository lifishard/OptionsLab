import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "client/src/**/__tests__/**/*.{test,spec}.ts",
      "server/**/__tests__/**/*.{test,spec}.ts",
    ],
    environment: "node",
  },
});
