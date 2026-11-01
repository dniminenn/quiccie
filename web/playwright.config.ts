import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  use: {
    baseURL: process.env.QUICCIE_TEST_URL || "http://127.0.0.1:18090",
    viewport: { width: 1440, height: 960 },
  },
  reporter: "list",
  workers: 1,
  timeout: 60000,
});
