import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [tailwindcss()],
  base: "./",
  build: {
    rollupOptions: { input: { main: "index.html", editor: "editor.html" } },
  },
  server: { proxy: { "/api": process.env.QUICCIE_TEST_URL || "http://127.0.0.1:18090" } },
});
