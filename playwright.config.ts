import { defineConfig } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

// Cargar vars del entorno de prueba antes de que arranque el webServer
const testEnv = dotenv.config({ path: path.resolve(__dirname, ".env.test") }).parsed ?? {};

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "html",
  fullyParallel: false, // Las pruebas de auth comparten estado en BD

  use: {
    baseURL: "http://localhost:3001",
    extraHTTPHeaders: { "Content-Type": "application/json" },
  },

  projects: [
    { name: "api" }, // Sin browser — solo request fixture
  ],

  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",

  webServer: {
    command: "next dev -p 3001",
    url: "http://localhost:3001/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      ...testEnv,
      // PgBouncer (pooler de Supabase) no soporta prepared statements de Prisma.
      // Se usa DIRECT_URL como DATABASE_URL para que el servidor de test
      // conecte directo a PostgreSQL sin pasar por el pooler.
      DATABASE_URL: testEnv.DIRECT_URL ?? testEnv.DATABASE_URL,
      PORT: "3001",
    },
  },
});
