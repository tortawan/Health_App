import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"],
    setupFiles: ["src/test/setup.ts"],
    globals: true,
    env: {
      EMBEDDING_MODEL: "Xenova/all-MiniLM-L6-v2",
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "mock-key",
      SUPABASE_SERVICE_ROLE_KEY: "mock-service-key",
      USDA_API_KEY: "mock-usda-key",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
