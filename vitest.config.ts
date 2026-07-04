import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  test: {
    include: [
      "client/src/**/__tests__/**/*.{test,spec}.ts",
      "client/src/**/*.{test,spec}.ts",
      "server/**/__tests__/**/*.{test,spec}.ts",
    ],
    environment: "node",
  },
});
