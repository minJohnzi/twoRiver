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
  const directory = fsSync.mkdtempSync(path.join(os.tmpdir(), "tworiver-pages-api-"));
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

const bilingualPageInput = {
  slug: "story",
  status: "draft",
  sortOrder: 7,
  translations: [
    {
      locale: "zh",
      title: "河流记",
      contentMarkdown: "中文正文",
      seoTitle: "河流 SEO",
      seoDescription: "中文描述"
    },
    {
      locale: "en",
      title: "River Story",
      contentMarkdown: "English body",
      seoTitle: "River SEO",
      seoDescription: "English description"
    }
  ]
};

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("custom page routes", () => {
  test("supports authenticated bilingual page CRUD", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/admin/pages",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: bilingualPageInput
      });
      expect(createResponse.statusCode).toBe(201);
      expect(createResponse.json().page).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          slug: "story",
          status: "draft",
          sortOrder: 7,
          deletedAt: null,
          translations: expect.arrayContaining([
            expect.objectContaining({ locale: "zh", title: "河流记" }),
            expect.objectContaining({ locale: "en", title: "River Story" })
          ])
        })
      );
      const pageId = createResponse.json().page.id as number;

      const updateResponse = await app.inject({
        method: "PUT",
        url: `/api/admin/pages/${pageId}`,
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: {
          slug: "story-updated",
          status: "published",
          sortOrder: 2,
          translations: [
            {
              locale: "en",
              title: "Updated Story",
              contentMarkdown: "Updated body",
              seoTitle: null,
              seoDescription: null
            }
          ]
        }
      });
      expect(updateResponse.statusCode).toBe(200);
      expect(updateResponse.json().page).toEqual(
        expect.objectContaining({
          slug: "story-updated",
          status: "published",
          sortOrder: 2,
          translations: [expect.objectContaining({ locale: "en", title: "Updated Story" })]
        })
      );

      const listResponse = await app.inject({
        method: "GET",
        url: "/api/admin/pages",
        headers: { cookie: auth.cookie }
      });
      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json().pages).toEqual([
        expect.objectContaining({ id: pageId, slug: "story-updated" })
      ]);
    } finally {
      await app.close();
    }
  });

  test("rejects invalid input, duplicate slugs, and missing CSRF tokens", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const missingCsrfResponse = await app.inject({
        method: "POST",
        url: "/api/admin/pages",
        headers: { cookie: auth.cookie },
        payload: bilingualPageInput
      });
      expect(missingCsrfResponse.statusCode).toBe(403);

      const reservedResponse = await app.inject({
        method: "POST",
        url: "/api/admin/pages",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { ...bilingualPageInput, slug: "admin" }
      });
      expect(reservedResponse.statusCode).toBe(400);
      expect(reservedResponse.json()).toEqual({ message: "Invalid page input" });

      const createResponse = await app.inject({
        method: "POST",
        url: "/api/admin/pages",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: bilingualPageInput
      });
      expect(createResponse.statusCode).toBe(201);

      const duplicateResponse = await app.inject({
        method: "POST",
        url: "/api/admin/pages",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { ...bilingualPageInput, translations: [{ locale: "en", title: "Other", contentMarkdown: "" }] }
      });
      expect(duplicateResponse.statusCode).toBe(409);
      expect(duplicateResponse.json()).toEqual({ message: "Page slug already exists" });
    } finally {
      await app.close();
    }
  });

  test("publishes pages publicly with locale fallback and hides drafts", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      await app.inject({
        method: "POST",
        url: "/api/admin/pages",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: bilingualPageInput
      });
      await app.inject({
        method: "POST",
        url: "/api/admin/pages",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: {
          slug: "published",
          status: "published",
          sortOrder: 1,
          translations: bilingualPageInput.translations
        }
      });
      await app.inject({
        method: "POST",
        url: "/api/admin/pages",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: {
          slug: "english-only",
          status: "published",
          translations: [{ locale: "en", title: "English Only", contentMarkdown: "Fallback body" }]
        }
      });

      const draftResponse = await app.inject({ method: "GET", url: "/api/pages/story?locale=zh" });
      expect(draftResponse.statusCode).toBe(404);

      const zhResponse = await app.inject({ method: "GET", url: "/api/pages/published?locale=zh" });
      expect(zhResponse.statusCode).toBe(200);
      expect(zhResponse.json().page.translation).toEqual(
        expect.objectContaining({ locale: "zh", title: "河流记", contentMarkdown: "中文正文" })
      );

      const fallbackResponse = await app.inject({ method: "GET", url: "/api/pages/english-only?locale=zh" });
      expect(fallbackResponse.statusCode).toBe(200);
      expect(fallbackResponse.json().page).toEqual(
        expect.objectContaining({
          requestedLocale: "zh",
          translation: expect.objectContaining({ locale: "en", title: "English Only" })
        })
      );
    } finally {
      await app.close();
    }
  });

  test("soft deletes pages and removes them from public access", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/admin/pages",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { ...bilingualPageInput, status: "published" }
      });
      const pageId = createResponse.json().page.id as number;

      const deleteResponse = await app.inject({
        method: "DELETE",
        url: `/api/admin/pages/${pageId}`,
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken }
      });
      expect(deleteResponse.statusCode).toBe(200);
      expect(deleteResponse.json()).toEqual({ ok: true });
      expect(app.db.prepare("SELECT deleted_at FROM pages WHERE id = ?").get(pageId)).toEqual({
        deleted_at: expect.any(String)
      });

      const publicResponse = await app.inject({ method: "GET", url: "/api/pages/story?locale=en" });
      expect(publicResponse.statusCode).toBe(404);
      const adminResponse = await app.inject({
        method: "GET",
        url: `/api/admin/pages/${pageId}`,
        headers: { cookie: auth.cookie }
      });
      expect(adminResponse.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
