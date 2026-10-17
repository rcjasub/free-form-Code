import { defineConfig } from "vitest/config";
import path from "path";

// Kept apart from vite.config.ts so tests don't load the app's build plugins
// (Tailwind, the React compiler) — they only need the "@" alias and a DOM.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
  },
});
