/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: "es" },
  build: { chunkSizeWarningLimit: 2500 }, // NiiVue + ORT are large but load once and cache
  optimizeDeps: { exclude: ["onnxruntime-web"] },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
