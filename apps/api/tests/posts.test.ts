import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
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

function makeConfigWithAi(databasePath: string): AppConfig {
  return {
    ...makeConfig(databasePath),
    DEEPSEEK_API_KEY: "test-api-key"
  };
}

function createDatabasePath(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tworiver-posts-"));
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

async function createTestAppWithConfig(configFactory: (databasePath: string) => AppConfig): Promise<FastifyInstance> {
  const databasePath = createDatabasePath();
  migrate(databasePath);
  const db = openDatabase(databasePath);
  await seedAdmin(db, "admin", "secret1234567");

  return buildApp({ config: configFactory(databasePath), db });
}

async function login(app: FastifyInstance): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      username: "admin",
      password: "secret1234567"
    }
  });

  expect(response.statusCode).toBe(200);
  const setCookie = response.headers["set-cookie"];
  const sessionCookie = Array.isArray(setCookie) ? setCookie[0] : String(setCookie ?? "");
  expect(sessionCookie).toContain("tworiver_session=");
  const cookieHeader = sessionCookie?.split(";")[0];
  if (!cookieHeader) {
    throw new Error("Expected login response to set a session cookie.");
  }
  return cookieHeader;
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
    payload: {
      username: "admin",
      password: "secret1234567"
    }
  });

  expect(response.statusCode).toBe(200);
  const sessionCookie = extractCookie(response.headers["set-cookie"], "tworiver_session");
  const csrfCookie = extractCookie(response.headers["set-cookie"], "tworiver_csrf");
  const csrfToken = csrfCookie.slice("tworiver_csrf=".length);

  return {
    cookie: `${sessionCookie}; ${csrfCookie}`,
    csrfToken
  };
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("post routes", () => {
  test("returns 503 when translation is requested without AI configuration", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/posts/translate-draft",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          source: {
            locale: "en",
            title: "Source",
            summary: "",
            contentMarkdown: "Body"
          },
          targetLocale: "zh"
        }
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ message: "AI translation is not configured" });
    } finally {
      await app.close();
    }
  });

  test("drafts a post translation without writing a post", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "中文标题",
                  summary: "中文摘要",
                  contentMarkdown: "中文正文"
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const app = await createTestAppWithConfig(makeConfigWithAi);

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/posts/translate-draft",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          source: {
            locale: "en",
            title: "English title",
            summary: "English summary",
            contentMarkdown: "English body"
          },
          targetLocale: "zh"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        translation: {
          locale: "zh",
          title: "中文标题",
          summary: "中文摘要",
          contentMarkdown: "中文正文",
          seoTitle: null,
          seoDescription: null
        },
        warnings: []
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.deepseek.com/chat/completions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-api-key",
            "Content-Type": "application/json"
          })
        })
      );
    } finally {
      fetchMock.mockRestore();
      await app.close();
    }
  });

  test("returns an actionable message when the AI provider reports quota exhaustion", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Insufficient balance" } }), {
        status: 429,
        headers: { "Content-Type": "application/json" }
      })
    );
    const app = await createTestAppWithConfig(makeConfigWithAi);

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/posts/translate-draft",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          source: {
            locale: "en",
            title: "English title",
            summary: "",
            contentMarkdown: "English body"
          },
          targetLocale: "zh"
        }
      });

      expect(response.statusCode).toBe(429);
      expect(response.json()).toEqual({
        message: "AI quota or rate limit reached. Check the API key balance or try again later."
      });
    } finally {
      fetchMock.mockRestore();
      await app.close();
    }
  });

  test("rejects authenticated admin post mutations without a CSRF header", async () => {
    const app = await createTestApp();

    try {
      const cookie = await login(app);
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie },
        payload: {
          slug: "csrf-missing",
          status: "draft",
          publishedAt: null,
          tagSlugs: [],
          translations: [
            {
              locale: "en",
              title: "Missing CSRF",
              summary: "",
              contentMarkdown: ""
            }
          ]
        }
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ message: "Invalid CSRF token" });
    } finally {
      await app.close();
    }
  });

  test("hides drafts from public list", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "draft-post",
          status: "draft",
          publishedAt: null,
          tagSlugs: ["news"],
          translations: [
            {
              locale: "en",
              title: "Draft post",
              summary: "Hidden draft",
              contentMarkdown: "Draft body"
            }
          ]
        }
      });

      expect(createResponse.statusCode).toBe(201);
      const originalUid = createResponse.json().post.uid;
      expect(originalUid).toMatch(/^p_[0-9a-f-]{36}$/);

      const updateResponse = await app.inject({
        method: "PUT",
        url: `/api/admin/posts/${createResponse.json().post.id}`,
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "renamed-post",
          status: "draft",
          publishedAt: null,
          tagSlugs: [],
          translations: [{ locale: "en", title: "Renamed", summary: "", contentMarkdown: "" }]
        }
      });

      expect(updateResponse.statusCode).toBe(200);
      expect(updateResponse.json().post.uid).toBe(originalUid);

      const listResponse = await app.inject({
        method: "GET",
        url: "/api/posts"
      });

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()).toEqual({ posts: [], total: 0, page: 1, limit: 20 });
    } finally {
      await app.close();
    }
  });

  test("creates and reads a published bilingual post", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);
      const publishedAt = new Date("2026-01-02T03:04:05.000Z").toISOString();
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "published-bilingual",
          status: "published",
          publishedAt,
          categorySlug: "engineering",
          tagSlugs: ["culture", "river"],
          translations: [
            {
              locale: "en",
              title: "Published bilingual post",
              summary: "English summary",
              contentMarkdown: "English body",
              seoTitle: "English SEO",
              seoDescription: "English description"
            },
            {
              locale: "zh",
              title: "雙語文章",
              summary: "中文摘要",
              contentMarkdown: "中文內容",
              seoTitle: "中文 SEO",
              seoDescription: "中文描述"
            }
          ]
        }
      });

      expect(createResponse.statusCode).toBe(201);
      const createdPost = createResponse.json().post;
      expect(createdPost.uid).toMatch(/^p_[0-9a-f-]{36}$/);

      const detailResponse = await app.inject({
        method: "GET",
        url: "/api/posts/published-bilingual"
      });

      expect(detailResponse.statusCode).toBe(200);
      const body = detailResponse.json();
      expect(body.post.uid).toBe(createdPost.uid);
      expect(body.post.slug).toBe("published-bilingual");
      expect(body.post.publishedAt).toBe(publishedAt);
      expect(body.post.category).toEqual(expect.objectContaining({ slug: "engineering", name: "engineering" }));
      expect(body.post.tags.map((tag: { slug: string }) => tag.slug)).toEqual(["culture", "river"]);
      expect(body.post.translations).toHaveLength(2);
      expect(body.post.translations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            locale: "en",
            title: "Published bilingual post",
            contentMarkdown: "English body"
          }),
          expect.objectContaining({
            locale: "zh",
            title: "雙語文章",
            contentMarkdown: "中文內容"
          })
        ])
      );
    } finally {
      await app.close();
    }
  });

  test("returns conflict for duplicate post slugs on create and update", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);
      const firstPostResponse = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "duplicate-post",
          status: "draft",
          publishedAt: null,
          tagSlugs: [],
          translations: [
            {
              locale: "en",
              title: "First post",
              summary: "",
              contentMarkdown: ""
            }
          ]
        }
      });
      expect(firstPostResponse.statusCode).toBe(201);

      const secondPostResponse = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "second-post",
          status: "draft",
          publishedAt: null,
          tagSlugs: [],
          translations: [
            {
              locale: "en",
              title: "Second post",
              summary: "",
              contentMarkdown: ""
            }
          ]
        }
      });
      expect(secondPostResponse.statusCode).toBe(201);

      const duplicateCreateResponse = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "duplicate-post",
          status: "draft",
          publishedAt: null,
          tagSlugs: [],
          translations: [
            {
              locale: "en",
              title: "Duplicate post",
              summary: "",
              contentMarkdown: ""
            }
          ]
        }
      });
      expect(duplicateCreateResponse.statusCode).toBe(409);
      expect(duplicateCreateResponse.json()).toEqual({ message: "Post slug already exists" });

      const secondPostBody = secondPostResponse.json();
      const duplicateUpdateResponse = await app.inject({
        method: "PUT",
        url: `/api/admin/posts/${secondPostBody.post.id}`,
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "duplicate-post",
          status: "draft",
          publishedAt: null,
          tagSlugs: [],
          translations: [
            {
              locale: "en",
              title: "Updated duplicate post",
              summary: "",
              contentMarkdown: ""
            }
          ]
        }
      });
      expect(duplicateUpdateResponse.statusCode).toBe(409);
      expect(duplicateUpdateResponse.json()).toEqual({ message: "Post slug already exists" });
    } finally {
      await app.close();
    }
  });

  test("rejects duplicate translation locales before creating a post", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "duplicate-locales",
          status: "draft",
          publishedAt: null,
          tagSlugs: [],
          translations: [
            {
              locale: "en",
              title: "English one",
              summary: "",
              contentMarkdown: ""
            },
            {
              locale: "en",
              title: "English two",
              summary: "",
              contentMarkdown: ""
            }
          ]
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: "Invalid post input" });

      const listResponse = await app.inject({
        method: "GET",
        url: "/api/admin/posts",
        headers: { cookie }
      });
      expect(listResponse.json()).toEqual({ posts: [] });
    } finally {
      await app.close();
    }
  });

  test("rejects post tag slugs that normalize to empty strings", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "empty-tag-slug",
          status: "draft",
          publishedAt: null,
          tagSlugs: ["!!!"],
          translations: [
            {
              locale: "en",
              title: "Empty tag slug",
              summary: "",
              contentMarkdown: ""
            }
          ]
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: "Invalid post input" });
    } finally {
      await app.close();
    }
  });

  test("returns 404 when deleting a missing admin post", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);
      const response = await app.inject({
        method: "DELETE",
        url: "/api/admin/posts/999",
        headers: { cookie, "x-csrf-token": csrfToken }
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ message: "Post not found" });
    } finally {
      await app.close();
    }
  });

  test("hides a published post from public routes without clearing its publish history", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);
      const publishedAt = "2026-02-03T04:05:06.000Z";
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "temporarily-hidden",
          status: "published",
          publishedAt,
          tagSlugs: [],
          translations: [{ locale: "en", title: "Temporarily hidden", summary: "", contentMarkdown: "Visible body" }]
        }
      });

      expect(createResponse.statusCode).toBe(201);
      const postId = createResponse.json().post.id;

      const hideResponse = await app.inject({
        method: "PUT",
        url: `/api/admin/posts/${postId}`,
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "temporarily-hidden",
          status: "hidden",
          publishedAt,
          tagSlugs: [],
          translations: [{ locale: "en", title: "Temporarily hidden", summary: "", contentMarkdown: "Hidden body" }]
        }
      });

      expect(hideResponse.statusCode).toBe(200);
      expect(hideResponse.json().post.status).toBe("hidden");
      expect(hideResponse.json().post.publishedAt).toBe(publishedAt);

      const publicDetailResponse = await app.inject({ method: "GET", url: "/api/posts/temporarily-hidden" });
      expect(publicDetailResponse.statusCode).toBe(404);

      const publicListResponse = await app.inject({ method: "GET", url: "/api/posts" });
      expect(publicListResponse.statusCode).toBe(200);
      expect(publicListResponse.json()).toEqual({ posts: [], total: 0, page: 1, limit: 20 });

      const republishResponse = await app.inject({
        method: "PUT",
        url: `/api/admin/posts/${postId}`,
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "temporarily-hidden",
          status: "published",
          publishedAt,
          tagSlugs: [],
          translations: [{ locale: "en", title: "Temporarily hidden", summary: "", contentMarkdown: "Visible again" }]
        }
      });

      expect(republishResponse.statusCode).toBe(200);
      expect(republishResponse.json().post.status).toBe("published");
      expect(republishResponse.json().post.publishedAt).toBe(publishedAt);

      const visibleDetailResponse = await app.inject({ method: "GET", url: "/api/posts/temporarily-hidden" });
      expect(visibleDetailResponse.statusCode).toBe(200);
      expect(visibleDetailResponse.json().post.publishedAt).toBe(publishedAt);
    } finally {
      await app.close();
    }
  });

  test("paginates public post lists with stable metadata", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);
      for (const index of [1, 2, 3]) {
        const response = await app.inject({
          method: "POST",
          url: "/api/admin/posts",
          headers: { cookie, "x-csrf-token": csrfToken },
          payload: {
            slug: `published-page-${index}`,
            status: "published",
            publishedAt: new Date(`2026-04-0${index}T00:00:00.000Z`).toISOString(),
            tagSlugs: [],
            translations: [{ locale: "en", title: `Published ${index}`, summary: "", contentMarkdown: "" }]
          }
        });
        expect(response.statusCode).toBe(201);
      }

      const pageResponse = await app.inject({
        method: "GET",
        url: "/api/posts?page=2&limit=2"
      });

      expect(pageResponse.statusCode).toBe(200);
      expect(pageResponse.json()).toEqual(
        expect.objectContaining({
          total: 3,
          page: 2,
          limit: 2
        })
      );
      expect(pageResponse.json().posts.map((post: { slug: string }) => post.slug)).toEqual(["published-page-1"]);
    } finally {
      await app.close();
    }
  });
});

describe("post migrations", () => {
  test("backfills stable post uids for existing databases", () => {
    const databasePath = createDatabasePath();
    const db = openDatabase(databasePath);
    db.exec(`
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
        category_id INTEGER,
        published_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT INTO posts (slug, status, category_id, published_at, created_at, updated_at)
      VALUES
        ('legacy-one', 'draft', NULL, NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
        ('legacy-two', 'published', NULL, '2026-01-02T00:00:00.000Z', '2026-01-02T00:00:00.000Z', '2026-01-02T00:00:00.000Z');
    `);
    db.close();

    migrate(databasePath);

    const migratedDb = openDatabase(databasePath);
    try {
      const columns = migratedDb.prepare("PRAGMA table_info(posts)").all() as Array<{ name: string }>;
      const rows = migratedDb.prepare("SELECT uid FROM posts ORDER BY id ASC").all() as Array<{ uid: string | null }>;
      const indexes = migratedDb.prepare("PRAGMA index_list(posts)").all() as Array<{ name: string; unique: number }>;

      expect(columns.some((column) => column.name === "uid")).toBe(true);
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.uid)).toEqual([
        expect.stringMatching(/^p_[0-9a-f-]{36}$/),
        expect.stringMatching(/^p_[0-9a-f-]{36}$/)
      ]);
      expect(new Set(rows.map((row) => row.uid)).size).toBe(2);
      expect(indexes).toEqual(expect.arrayContaining([expect.objectContaining({ name: "idx_posts_uid", unique: 1 })]));
    } finally {
      migratedDb.close();
    }
  });

  test("rejects missing and empty post uids after migrating existing databases", () => {
    const databasePath = createDatabasePath();
    const db = openDatabase(databasePath);
    db.exec(`
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
        category_id INTEGER,
        published_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT INTO posts (slug, status, category_id, published_at, created_at, updated_at)
      VALUES ('legacy-one', 'draft', NULL, NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    `);
    db.close();

    migrate(databasePath);

    const migratedDb = openDatabase(databasePath);
    try {
      expect(() =>
        migratedDb
          .prepare(
            `INSERT INTO posts (slug, status, category_id, published_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run("missing-uid", "draft", null, null, "2026-01-03T00:00:00.000Z", "2026-01-03T00:00:00.000Z")
      ).toThrow();
      expect(() =>
        migratedDb
          .prepare(
            `INSERT INTO posts (uid, slug, status, category_id, published_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(null, "null-uid", "draft", null, null, "2026-01-04T00:00:00.000Z", "2026-01-04T00:00:00.000Z")
      ).toThrow();
      expect(() =>
        migratedDb
          .prepare(
            `INSERT INTO posts (uid, slug, status, category_id, published_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run("", "empty-uid", "draft", null, null, "2026-01-05T00:00:00.000Z", "2026-01-05T00:00:00.000Z")
      ).toThrow();
      expect(() => migratedDb.prepare("UPDATE posts SET uid = NULL WHERE slug = ?").run("legacy-one")).toThrow();
      expect(() => migratedDb.prepare("UPDATE posts SET uid = '' WHERE slug = ?").run("legacy-one")).toThrow();
    } finally {
      migratedDb.close();
    }
  });

  test("allows hidden status after migrating existing post status constraints", () => {
    const databasePath = createDatabasePath();
    const db = openDatabase(databasePath);
    db.exec(`
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
        category_id INTEGER,
        published_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT INTO posts (slug, status, category_id, published_at, created_at, updated_at)
      VALUES ('legacy-published', 'published', NULL, '2026-01-02T00:00:00.000Z', '2026-01-02T00:00:00.000Z', '2026-01-02T00:00:00.000Z');
    `);
    db.close();

    migrate(databasePath);

    const migratedDb = openDatabase(databasePath);
    try {
      expect(() =>
        migratedDb
          .prepare(
            `UPDATE posts
             SET status = 'hidden'
             WHERE slug = ?`
          )
          .run("legacy-published")
      ).not.toThrow();
      expect(migratedDb.prepare("SELECT status, published_at FROM posts WHERE slug = ?").get("legacy-published")).toEqual({
        status: "hidden",
        published_at: "2026-01-02T00:00:00.000Z"
      });
    } finally {
      migratedDb.close();
    }
  });
});

describe("tag routes", () => {
  test("rejects admin tag mutations with missing or invalid CSRF tokens", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/admin/tags",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: { slug: "security", name: "Security" }
      });
      expect(createResponse.statusCode).toBe(201);
      const tagId = createResponse.json().tag.id as number;

      for (const request of [
        {
          method: "POST" as const,
          url: "/api/admin/tags",
          payload: { slug: "missing-token", name: "Missing token" }
        },
        {
          method: "PUT" as const,
          url: `/api/admin/tags/${tagId}`,
          payload: { name: "Missing token" }
        },
        {
          method: "DELETE" as const,
          url: `/api/admin/tags/${tagId}`
        }
      ]) {
        const response = await app.inject({
          ...request,
          headers: { cookie }
        });
        expect(response.statusCode).toBe(403);
        expect(response.json()).toEqual({ message: "Invalid CSRF token" });
      }

      const wrongTokenResponse = await app.inject({
        method: "DELETE",
        url: `/api/admin/tags/${tagId}`,
        headers: { cookie, "x-csrf-token": "wrong-token" }
      });
      expect(wrongTokenResponse.statusCode).toBe(403);
      expect(wrongTokenResponse.json()).toEqual({ message: "Invalid CSRF token" });
    } finally {
      await app.close();
    }
  });

  test("authenticated admin tag list, create, and update return envelopes", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);

      const initialListResponse = await app.inject({
        method: "GET",
        url: "/api/admin/tags",
        headers: { cookie }
      });
      expect(initialListResponse.statusCode).toBe(200);
      expect(initialListResponse.json()).toEqual({ tags: [] });

      const createResponse = await app.inject({
        method: "POST",
        url: "/api/admin/tags",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "Type   Script!!! Guide",
          name: "Zulu"
        }
      });
      expect(createResponse.statusCode).toBe(201);
      const createdBody = createResponse.json();
      expect(createdBody.tag).toEqual(
        expect.objectContaining({
          slug: "type-script-guide",
          name: "Zulu"
        })
      );

      const updateResponse = await app.inject({
        method: "PUT",
        url: `/api/admin/tags/${createdBody.tag.id}`,
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          name: "Alpha"
        }
      });
      expect(updateResponse.statusCode).toBe(200);
      expect(updateResponse.json()).toEqual({
        tag: expect.objectContaining({
          id: createdBody.tag.id,
          slug: "type-script-guide",
          name: "Alpha"
        })
      });

      const listResponse = await app.inject({
        method: "GET",
        url: "/api/admin/tags",
        headers: { cookie }
      });
      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()).toEqual({
        tags: [
          expect.objectContaining({
            id: createdBody.tag.id,
            slug: "type-script-guide",
            name: "Alpha"
          })
        ]
      });
    } finally {
      await app.close();
    }
  });

  test("public tags return an envelope sorted by display name", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);

      await app.inject({
        method: "POST",
        url: "/api/admin/tags",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "a-slug",
          name: "Zulu"
        }
      });
      await app.inject({
        method: "POST",
        url: "/api/admin/tags",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "z-slug",
          name: "Alpha"
        }
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/tags"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        tags: [
          expect.objectContaining({
            slug: "z-slug",
            name: "Alpha"
          }),
          expect.objectContaining({
            slug: "a-slug",
            name: "Zulu"
          })
        ]
      });
    } finally {
      await app.close();
    }
  });

  test("returns tag detail with only published posts in that tag", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);

      await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "published-release",
          status: "published",
          publishedAt: new Date("2026-03-03T00:00:00.000Z").toISOString(),
          tagSlugs: ["release"],
          translations: [{ locale: "en", title: "Published Release", summary: "", contentMarkdown: "" }]
        }
      });
      await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "draft-release",
          status: "draft",
          publishedAt: null,
          tagSlugs: ["release"],
          translations: [{ locale: "en", title: "Draft Release", summary: "", contentMarkdown: "" }]
        }
      });
      await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "published-other",
          status: "published",
          publishedAt: new Date("2026-03-04T00:00:00.000Z").toISOString(),
          tagSlugs: ["other"],
          translations: [{ locale: "en", title: "Published Other", summary: "", contentMarkdown: "" }]
        }
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/tags/release"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().tag).toEqual(expect.objectContaining({ slug: "release" }));
      expect(response.json().posts.map((post: { slug: string }) => post.slug)).toEqual(["published-release"]);

      const missingResponse = await app.inject({
        method: "GET",
        url: "/api/tags/missing"
      });
      expect(missingResponse.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  test("post tag creation upserts display names for matching normalized slugs", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);

      const firstPostResponse = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "first-tag-post",
          status: "draft",
          publishedAt: null,
          tagSlugs: ["TypeScript"],
          translations: [
            {
              locale: "en",
              title: "First tag post",
              summary: "",
              contentMarkdown: ""
            }
          ]
        }
      });
      expect(firstPostResponse.statusCode).toBe(201);

      const secondPostResponse = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "second-tag-post",
          status: "draft",
          publishedAt: null,
          tagSlugs: ["typeSCRIPT"],
          translations: [
            {
              locale: "en",
              title: "Second tag post",
              summary: "",
              contentMarkdown: ""
            }
          ]
        }
      });
      expect(secondPostResponse.statusCode).toBe(201);

      const response = await app.inject({
        method: "GET",
        url: "/api/tags"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        tags: [
          expect.objectContaining({
            slug: "typescript",
            name: "typeSCRIPT"
          })
        ]
      });
    } finally {
      await app.close();
    }
  });

  test("returns conflict when creating a duplicate admin tag", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/admin/tags",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "TypeScript",
          name: "TypeScript"
        }
      });
      expect(createResponse.statusCode).toBe(201);

      const duplicateResponse = await app.inject({
        method: "POST",
        url: "/api/admin/tags",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "typeSCRIPT",
          name: "Different display"
        }
      });
      expect(duplicateResponse.statusCode).toBe(409);
      expect(duplicateResponse.json()).toEqual({ message: "Tag already exists" });
    } finally {
      await app.close();
    }
  });

  test("returns conflict when updating an admin tag to an existing slug", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);
      const firstTagResponse = await app.inject({
        method: "POST",
        url: "/api/admin/tags",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "first-tag",
          name: "First"
        }
      });
      expect(firstTagResponse.statusCode).toBe(201);

      const secondTagResponse = await app.inject({
        method: "POST",
        url: "/api/admin/tags",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "second-tag",
          name: "Second"
        }
      });
      expect(secondTagResponse.statusCode).toBe(201);

      const secondTagBody = secondTagResponse.json();
      const updateResponse = await app.inject({
        method: "PUT",
        url: `/api/admin/tags/${secondTagBody.tag.id}`,
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "first-tag"
        }
      });
      expect(updateResponse.statusCode).toBe(409);
      expect(updateResponse.json()).toEqual({ message: "Tag already exists" });
    } finally {
      await app.close();
    }
  });

  test("returns 404 when deleting a missing admin tag", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);
      const response = await app.inject({
        method: "DELETE",
        url: "/api/admin/tags/999",
        headers: { cookie, "x-csrf-token": csrfToken }
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ message: "Tag not found" });
    } finally {
      await app.close();
    }
  });
});
