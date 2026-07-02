import fs from "node:fs";
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
    DEEPSEEK_MODEL: "deepseek-chat"
  };
}

function createDatabasePath(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tworiver-integration-"));
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

async function login(app: FastifyInstance): Promise<{ cookie: string; csrfToken: string }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      username: "admin",
      password: "secret1234567"
    }
  });

  expect(response.statusCode).toBe(200);
  const sessionCookie = extractCookie(response.headers["set-cookie"], "tworiver_session");
  const csrfCookie = extractCookie(response.headers["set-cookie"], "tworiver_csrf");
  return {
    cookie: `${sessionCookie}; ${csrfCookie}`,
    csrfToken: csrfCookie.slice("tworiver_csrf=".length)
  };
}

async function createTag(app: FastifyInstance, cookie: string, csrfToken: string, slug: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/admin/tags",
    headers: { cookie, "x-csrf-token": csrfToken },
    payload: { slug, name: slug }
  });
  expect(response.statusCode).toBe(201);
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("publishing integration flow", () => {
  test("logs in, publishes a post, hides drafts, deletes published content, and blocks admin after logout", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await login(app);
      await createTag(app, cookie, csrfToken, "ops");

      const draftResponse = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "private-draft",
          status: "draft",
          publishedAt: null,
          tagSlugs: ["ops"],
          translations: [
            {
              locale: "en",
              title: "Private draft",
              summary: "",
              contentMarkdown: "Not public yet"
            }
          ]
        }
      });
      expect(draftResponse.statusCode).toBe(201);

      const hiddenDraftResponse = await app.inject({
        method: "GET",
        url: "/api/posts/private-draft"
      });
      expect(hiddenDraftResponse.statusCode).toBe(404);

      const publishedAt = new Date("2026-02-03T04:05:06.000Z").toISOString();
      const publishedResponse = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "published-flow",
          status: "published",
          publishedAt,
          tagSlugs: ["ops"],
          translations: [
            {
              locale: "en",
              title: "Published flow",
              summary: "Visible summary",
              contentMarkdown: "Visible body"
            }
          ]
        }
      });
      expect(publishedResponse.statusCode).toBe(201);

      const publicListResponse = await app.inject({
        method: "GET",
        url: "/api/posts"
      });
      expect(publicListResponse.json().posts.map((post: { slug: string }) => post.slug)).toEqual([
        "published-flow"
      ]);

      const publicDetailResponse = await app.inject({
        method: "GET",
        url: "/api/posts/published-flow"
      });
      expect(publicDetailResponse.statusCode).toBe(200);
      expect(publicDetailResponse.json().post.translations[0].title).toBe("Published flow");

      const publishedPostId = publishedResponse.json().post.id as number;
      const deleteResponse = await app.inject({
        method: "DELETE",
        url: `/api/admin/posts/${publishedPostId}`,
        headers: { cookie, "x-csrf-token": csrfToken }
      });
      expect(deleteResponse.statusCode).toBe(200);
      expect(deleteResponse.json()).toEqual({ ok: true });

      const deletedDetailResponse = await app.inject({
        method: "GET",
        url: "/api/posts/published-flow"
      });
      expect(deletedDetailResponse.statusCode).toBe(404);

      const logoutResponse = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { cookie, "x-csrf-token": csrfToken }
      });
      expect(logoutResponse.statusCode).toBe(200);

      const loggedOutAdminResponse = await app.inject({
        method: "GET",
        url: "/api/admin/posts",
        headers: { cookie }
      });
      expect(loggedOutAdminResponse.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});
