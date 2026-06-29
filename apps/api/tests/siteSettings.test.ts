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
  const directory = fsSync.mkdtempSync(path.join(os.tmpdir(), "tworiver-site-api-"));
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

const siteSettingsInput = {
  logoUrl: "/uploads/resources/brand/logo.png",
  faviconUrl: "/uploads/resources/brand/favicon.png",
  robotsText: "User-agent: *\nDisallow: /private",
  theme: {
    primaryColor: "#2f855a",
    homeLayout: "bento",
    codeTheme: "github-light",
    fontSize: "large",
    allowReaderDarkMode: false
  },
  translations: [
    {
      locale: "en",
      siteName: "TwoRiver",
      subtitle: "A bilingual technical journal",
      seoTitle: "TwoRiver Blog",
      seoDescription: "Engineering notes",
      seoKeywords: ["blog", "engineering"]
    }
  ],
  socialLinks: [
    { label: "GitHub", url: "https://github.com/example", sortOrder: 2 },
    { label: "About", url: "/about", sortOrder: 1 }
  ]
};

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("site configuration routes", () => {
  test("manages navigation with safe URLs, localized labels, and reorder", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const invalidResponse = await app.inject({
        method: "POST",
        url: "/api/admin/navigation",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: {
          url: "javascript:alert(1)",
          sortOrder: 1,
          translations: [{ locale: "en", label: "Bad" }]
        }
      });
      expect(invalidResponse.statusCode).toBe(400);
      expect(invalidResponse.json()).toEqual({ message: "Invalid navigation input" });

      const firstResponse = await app.inject({
        method: "POST",
        url: "/api/admin/navigation",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: {
          url: "/projects",
          sortOrder: 2,
          enabled: true,
          openInNewWindow: false,
          translations: [
            { locale: "zh", label: "项目" },
            { locale: "en", label: "Projects" }
          ]
        }
      });
      const secondResponse = await app.inject({
        method: "POST",
        url: "/api/admin/navigation",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: {
          url: "https://example.com",
          sortOrder: 1,
          enabled: true,
          openInNewWindow: true,
          translations: [{ locale: "en", label: "External" }]
        }
      });
      expect(firstResponse.statusCode).toBe(201);
      expect(secondResponse.statusCode).toBe(201);
      const firstId = firstResponse.json().item.id as number;
      const secondId = secondResponse.json().item.id as number;

      const reorderResponse = await app.inject({
        method: "POST",
        url: "/api/admin/navigation/reorder",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { ids: [firstId, secondId] }
      });
      expect(reorderResponse.statusCode).toBe(200);
      expect(reorderResponse.json().items.map((item: { id: number; sortOrder: number }) => [item.id, item.sortOrder])).toEqual([
        [firstId, 1],
        [secondId, 2]
      ]);

      const siteResponse = await app.inject({ method: "GET", url: "/api/site?locale=zh" });
      expect(siteResponse.statusCode).toBe(200);
      expect(siteResponse.json().navigation).toEqual([
        expect.objectContaining({
          id: firstId,
          url: "/projects",
          label: "项目",
          translation: expect.objectContaining({ locale: "zh", label: "项目" })
        }),
        expect.objectContaining({
          id: secondId,
          url: "https://example.com",
          label: "External",
          requestedLocale: "zh",
          openInNewWindow: true,
          translation: expect.objectContaining({ locale: "en", label: "External" })
        })
      ]);
    } finally {
      await app.close();
    }
  });

  test("updates singleton site settings and exposes public fallback configuration", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const missingCsrfResponse = await app.inject({
        method: "PUT",
        url: "/api/admin/site-settings",
        headers: { cookie: auth.cookie },
        payload: siteSettingsInput
      });
      expect(missingCsrfResponse.statusCode).toBe(403);

      const invalidResponse = await app.inject({
        method: "PUT",
        url: "/api/admin/site-settings",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { ...siteSettingsInput, socialLinks: [{ label: "Unsafe", url: "ftp://example.com", sortOrder: 1 }] }
      });
      expect(invalidResponse.statusCode).toBe(400);
      expect(invalidResponse.json()).toEqual({ message: "Invalid site settings input" });

      const updateResponse = await app.inject({
        method: "PUT",
        url: "/api/admin/site-settings",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: siteSettingsInput
      });
      expect(updateResponse.statusCode).toBe(200);
      expect(updateResponse.json().site).toEqual(
        expect.objectContaining({
          logoUrl: "/uploads/resources/brand/logo.png",
          faviconUrl: "/uploads/resources/brand/favicon.png",
          robotsText: "User-agent: *\nDisallow: /private",
          theme: siteSettingsInput.theme,
          socialLinks: [
            expect.objectContaining({ label: "About", sortOrder: 1 }),
            expect.objectContaining({ label: "GitHub", sortOrder: 2 })
          ]
        })
      );

      const publicResponse = await app.inject({ method: "GET", url: "/api/site?locale=zh" });
      expect(publicResponse.statusCode).toBe(200);
      expect(publicResponse.json().site).toEqual(
        expect.objectContaining({
          requestedLocale: "zh",
          siteName: "TwoRiver",
          translation: expect.objectContaining({ locale: "en", siteName: "TwoRiver" }),
          theme: siteSettingsInput.theme,
          socialLinks: [
            expect.objectContaining({ label: "About", url: "/about" }),
            expect.objectContaining({ label: "GitHub", url: "https://github.com/example" })
          ]
        })
      );

      const robotsResponse = await app.inject({ method: "GET", url: "/robots.txt" });
      expect(robotsResponse.statusCode).toBe(200);
      expect(robotsResponse.headers["content-type"]).toContain("text/plain");
      expect(robotsResponse.body).toBe("User-agent: *\nDisallow: /private");
    } finally {
      await app.close();
    }
  });
});
