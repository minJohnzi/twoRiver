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
    DEEPSEEK_BASE_URL: "https://api.deepseek.com",
    ANALYTICS_HASH_SECRET: "analytics-secret-at-least-32-characters"
  };
}

function createDatabasePath(): string {
  const directory = fsSync.mkdtempSync(path.join(os.tmpdir(), "tworiver-analytics-api-"));
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

describe("privacy-first analytics", () => {
  test("records page views without raw IPs and collapses minute duplicates", async () => {
    const app = await createTestApp();

    try {
      const payload = { path: "/posts/hello", contentType: "post", contentId: 1, locale: "zh" };
      const first = await app.inject({
        method: "POST",
        url: "/api/analytics/page-view",
        headers: {
          "user-agent": "Mozilla/5.0 Desktop",
          referer: "https://ref.example.com/from",
          "x-forwarded-for": "203.0.113.10"
        },
        payload
      });
      const duplicate = await app.inject({
        method: "POST",
        url: "/api/analytics/page-view",
        headers: {
          "user-agent": "Mozilla/5.0 Desktop",
          referer: "https://ref.example.com/again",
          "x-forwarded-for": "203.0.113.10"
        },
        payload
      });
      expect(first.statusCode).toBe(204);
      expect(duplicate.statusCode).toBe(204);

      const events = app.db.prepare("SELECT visitor_hash, path, referrer_domain, device_type FROM analytics_events").all() as Array<{
        visitor_hash: string;
        path: string;
        referrer_domain: string;
        device_type: string;
      }>;
      expect(events).toHaveLength(1);
      expect(JSON.stringify(events)).not.toContain("203.0.113.10");
      expect(events[0]).toEqual(
        expect.objectContaining({
          path: "/posts/hello",
          referrer_domain: "ref.example.com",
          device_type: "desktop"
        })
      );

      const daily = app.db.prepare("SELECT page_views, unique_visitors FROM analytics_daily").get() as {
        page_views: number;
        unique_visitors: number;
      };
      expect(daily).toEqual({ page_views: 1, unique_visitors: 1 });
    } finally {
      await app.close();
    }
  });

  test("ignores bots and admin paths, then exposes authenticated summary and CSV", async () => {
    const app = await createTestApp();

    try {
      await app.inject({
        method: "POST",
        url: "/api/analytics/page-view",
        headers: { "user-agent": "Googlebot" },
        payload: { path: "/posts/bot", contentType: "post", locale: "en" }
      });
      await app.inject({
        method: "POST",
        url: "/api/analytics/page-view",
        headers: { "user-agent": "Mozilla/5.0 Mobile" },
        payload: { path: "/admin", contentType: "home", locale: "en" }
      });
      await app.inject({
        method: "POST",
        url: "/api/analytics/page-view",
        headers: { "user-agent": "Mozilla/5.0 Mobile", referer: "https://social.example/post" },
        payload: { path: "/projects/river", contentType: "project", contentId: 7, locale: "en" }
      });

      expect(app.db.prepare("SELECT COUNT(*) AS count FROM analytics_events").get()).toEqual({ count: 1 });

      const auth = await loginWithCsrf(app);
      const summaryResponse = await app.inject({
        method: "GET",
        url: "/api/admin/analytics/summary?period=7",
        headers: { cookie: auth.cookie }
      });
      expect(summaryResponse.statusCode).toBe(200);
      expect(summaryResponse.json()).toEqual(
        expect.objectContaining({
          totals: { pageViews: 1, uniqueVisitors: 1 },
          topContent: [expect.objectContaining({ path: "/projects/river", pageViews: 1 })],
          referrers: [expect.objectContaining({ referrerDomain: "social.example", pageViews: 1 })],
          devices: [expect.objectContaining({ deviceType: "mobile", pageViews: 1 })]
        })
      );

      const csvResponse = await app.inject({
        method: "GET",
        url: "/api/admin/analytics/export.csv?period=7",
        headers: { cookie: auth.cookie }
      });
      expect(csvResponse.statusCode).toBe(200);
      expect(csvResponse.headers["content-type"]).toContain("text/csv");
      expect(csvResponse.body).toContain("date,pageViews,uniqueVisitors");
      expect(csvResponse.body).toContain(",1,1");
    } finally {
      await app.close();
    }
  });
});
