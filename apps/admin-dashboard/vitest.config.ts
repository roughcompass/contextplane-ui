import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: ["src/**/*.test.{ts,tsx}", "src/setupTests.ts"],
      include: ["src/**/*.{ts,tsx}"],
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "./coverage",
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "http://localhost/",
      },
    },
    hookTimeout: 30_000,
    setupFiles: ["./src/setupTests.ts"],
    // Shell tests chain multiple lazy-route awaits; the default 5s is a
    // false failure on CI, not a hang. A genuine hang still fails here.
    testTimeout: 30_000,
  },
});
