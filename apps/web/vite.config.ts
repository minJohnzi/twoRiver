import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  envDir: "../..",
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:4000"
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          markdown: ["marked", "highlight.js", "dompurify"],
          react: ["react", "react-dom", "react-router-dom"]
        }
      }
    }
  },
  test: {
    environment: "jsdom"
  }
});
