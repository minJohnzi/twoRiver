import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../src/config.js";
import { buildApp } from "../src/app.js";
import { openDatabase } from "../src/db/connection.js";
import { migrate } from "../src/db/migrate.js";
import { seedAdmin } from "../src/db/seedAdmin.js";

const tempDirectories: string[] = [];

function makeConfig(databasePath: string): AppConfig {
  return {
    NODE_ENV: "test",
    PORT: 0,
    DATABASE_PATH: databasePath,
    SESSION_SECRET: "test-session-secret-at-least-32-chars",
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD: "secret1234567",
    CORS_ALLOWED_ORIGINS: [],
    DEEPSEEK_BASE_URL: "https://api.deepseek.com"
  };
}

function createDatabasePath(): string {
  const directory = fsSync.mkdtempSync(path.join(os.tmpdir(), "tworiver-system-api-"));
  tempDirectories.push(directory);
  return path.join(directory, "blog.sqlite");
}

async function createTestApp(): Promise<FastifyInstance> {
  const databasePath = createDatabasePath();
  migrate(databasePath);
  const db = openDatabase(databasePath);
  await seedAdmin(db, "admin", "secret1234567");
  return buildApp({ config: makeConfig(databasePath), db });
}

function extractCookie(setCookie: string | string[] | undefined, name: string): string {
  const cookies = Array.isArray(setCookie) ? setCookie : [String(setCookie ?? "")];
  const cookie = cookies.find((value) => value.startsWith(`${name}=`));
  const cookieHeader = cookie?.split(";")[0];
  if (!cookieHeader) {
    throw new Error(`Expected ${name} cookie to be set.`);
  }
  return cookieHeader;
}

async function loginWithCsrf(app: FastifyInstance): Promise<{ cookie: string; csrfToken: string }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "admin", password: "secret1234567" }
  });

  expect(response.statusCode).toBe(200);
  const sessionCookie = extractCookie(response.headers["set-cookie"], "tworiver_session");
  const csrfCookie = extractCookie(response.headers["set-cookie"], "tworiver_csrf");
  return {
    cookie: `${sessionCookie}; ${csrfCookie}`,
    csrfToken: csrfCookie.slice("tworiver_csrf=".length)
  };
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("system health and maintenance", () => {
  test("reports real health fields and runs scoped maintenance actions", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      app.db
        .prepare("INSERT INTO sessions (id, user_id, csrf_token, expires_at) VALUES ('expired', 1, 'token', ?)")
        .run("2020-01-01T00:00:00.000Z");

      const healthResponse = await app.inject({
        method: "GET",
        url: "/api/admin/system/health",
        headers: { cookie: auth.cookie }
      });
      expect(healthResponse.statusCode).toBe(200);
      expect(healthResponse.json()).toEqual(
        expect.objectContaining({
          database: expect.objectContaining({ ok: true, path: expect.stringContaining("blog.sqlite") }),
          uploads: expect.objectContaining({ ok: true }),
          backups: expect.objectContaining({ total: 0 }),
          sessions: expect.objectContaining({ expired: 1 })
        })
      );

      const maintenanceResponse = await app.inject({
        method: "POST",
        url: "/api/admin/system/maintenance",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { action: "expired-sessions" }
      });
      expect(maintenanceResponse.statusCode).toBe(200);
      expect(maintenanceResponse.json()).toEqual({ action: "expired-sessions", count: 1 });
    } finally {
      await app.close();
    }
  });
});
