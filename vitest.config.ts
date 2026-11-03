import path from "node:path";

import {
  defineConfig,
} from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "tests/unit/**/*.{test,spec}.ts",
    ],
    exclude: [
      "tests/e2e/**",
      "node_modules/**",
      ".next/**",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
