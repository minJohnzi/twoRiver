import path from "node:path";
import type { FullConfig } from "@playwright/test";
import { buildApp } from "../../apps/api/src/app";
import { loadConfig } from "../../apps/api/src/config";
import { openDatabase } from "../../apps/api/src/db/connection";
import { migrate } from "../../apps/api/src/db/migrate";
import { seedAdmin } from "../../apps/api/src/db/seedAdmin";

async function waitForUrl(url: string): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < 30_000) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${url}: ${String(lastError)}`);
}

export default async function globalSetup(_config: FullConfig) {
  process.env.NODE_ENV = "test";
  process.env.PORT = "4000";
  process.env.DATABASE_PATH = path.resolve("tests/e2e/e2e.sqlite");
  process.env.SESSION_SECRET = "e2e-session-secret-at-least-32-chars";
  process.env.ADMIN_USERNAME = "admin";
  process.env.ADMIN_PASSWORD = "secret1234567";
  process.env.CORS_ALLOWED_ORIGINS = "http://127.0.0.1:5173";
  process.env.DEEPSEEK_BASE_URL = "https://api.deepseek.com";
  process.env.VITE_API_BASE_URL = "http://127.0.0.1:4000";

  migrate(process.env.DATABASE_PATH);
  const db = openDatabase(process.env.DATABASE_PATH);
  await seedAdmin(db, process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD);
  const app = buildApp({ config: loadConfig(), db });
  await app.listen({ port: 4000, host: "127.0.0.1" });
  await waitForUrl("http://127.0.0.1:4000/api/health");

  const { createServer } = await import("../../apps/web/node_modules/vite/dist/node/index.js");
  const vite = await createServer({
    configFile: path.resolve("apps/web/vite.config.ts"),
    root: path.resolve("apps/web"),
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true
    }
  });
  await vite.listen();
  await waitForUrl("http://127.0.0.1:5173");

  return async () => {
    await vite.close();
    await app.close();
  };
}
