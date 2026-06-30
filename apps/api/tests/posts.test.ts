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
import { PostUpdateConflictError, updatePost } from "../src/repositories/postsRepository.js";

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

async function createTag(app: FastifyInstance, cookie: string, csrfToken: string, slug: string, name = slug) {
  const response = await app.inject({
    method: "POST",
    url: "/api/admin/tags",
    headers: { cookie, "x-csrf-token": csrfToken },
    payload: { slug, name }
  });
  expect(response.statusCode).toBe(201);
  return response.json().tag;
}

const tiptapContent = {
  format: "tiptap" as const,
  schemaVersion: 1,
  doc: {
    type: "doc" as const,
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Intro" }]
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Body" }]
      }
    ]
  }
};

const unsafeTiptapContent = {
  format: "tiptap" as const,
  schemaVersion: 1,
  doc: {
    type: "doc" as const,
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Unsafe",
            marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }]
          }
        ]
      }
    ]
  }
};

async function createCategory(app: FastifyInstance, cookie: string, csrfToken: string, slug: string, name = slug) {
  const response = await app.inject({
    method: "POST",
    url: "/api/admin/categories",
    headers: { cookie, "x-csrf-token": csrfToken },
    payload: { slug, name }
  });
  expect(response.statusCode).toBe(201);
  return response.json().category;
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
      await createTag(app, cookie, csrfToken, "news");
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
      await createCategory(app, cookie, csrfToken, "engineering");
      await createTag(app, cookie, csrfToken, "culture");
      await createTag(app, cookie, csrfToken, "river");
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

  test("persists canonical article content and upserts translations by locale", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "canonical-content",
          status: "draft",
          publishedAt: null,
          tagSlugs: [],
          translations: [
            {
              locale: "en",
              title: "Canonical",
              summary: "",
              content: tiptapContent
            },
            {
              locale: "zh",
              title: "Legacy translation",
              summary: "",
              contentMarkdown: "Legacy body"
            }
          ]
        }
      });

      expect(createResponse.statusCode).toBe(201);
      const createdPost = createResponse.json().post;
      const createdTranslation = createdPost.translations.find(
        (translation: { locale: string }) => translation.locale === "en"
      );
      expect(createdTranslation).toEqual(
        expect.objectContaining({
          content: expect.objectContaining({
            format: "tiptap",
            schemaVersion: 1,
            doc: expect.objectContaining({ type: "doc" })
          }),
          contentMarkdown: expect.stringContaining("## Intro")
        })
      );
      expect(createdTranslation.content.doc.content[0].attrs.id).toMatch(/^h_/);

      const stored = app.db
        .prepare(
          `SELECT
            content_format,
            content_json,
            content_schema_version,
            content_text,
            created_at,
            migration_source_markdown,
            migration_source_created_at
           FROM post_translations
           WHERE post_id = ? AND locale = 'en'`
        )
        .get(createdPost.id) as {
        content_format: string;
        content_json: string;
        content_schema_version: number;
        content_text: string;
        created_at: string;
        migration_source_markdown: string | null;
        migration_source_created_at: string | null;
      };
      expect(stored).toEqual(
        expect.objectContaining({
          content_format: "tiptap",
          content_schema_version: 1,
          content_text: expect.stringContaining("Intro"),
          migration_source_markdown: null,
          migration_source_created_at: null
        })
      );
      expect(JSON.parse(stored.content_json).content[0].attrs.id).toMatch(/^h_/);

      app.db
        .prepare(
          `UPDATE post_translations
           SET migration_source_markdown = ?, migration_source_created_at = ?
           WHERE post_id = ? AND locale = 'en'`
        )
        .run("Original Markdown", "2026-06-30T00:00:00.000Z", createdPost.id);

      const updateResponse = await app.inject({
        method: "PUT",
        url: `/api/admin/posts/${createdPost.id}`,
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "canonical-content",
          status: "draft",
          publishedAt: null,
          tagSlugs: [],
          expectedUpdatedAt: createdPost.updatedAt,
          translations: [
            {
              locale: "en",
              title: "Canonical updated",
              summary: "",
              content: {
                ...tiptapContent,
                doc: {
                  ...tiptapContent.doc,
                  content: [
                    {
                      type: "heading",
                      attrs: { level: 2 },
                      content: [{ type: "text", text: "Updated intro" }]
                    }
                  ]
                }
              }
            }
          ]
        }
      });

      expect(updateResponse.statusCode).toBe(200);
      const updatedStored = app.db
        .prepare(
          `SELECT content_format, content_text, created_at, migration_source_markdown, migration_source_created_at
           FROM post_translations
           WHERE post_id = ? AND locale = 'en'`
        )
        .get(createdPost.id);
      expect(updatedStored).toEqual(
        expect.objectContaining({
          content_format: "tiptap",
          content_text: "Updated intro",
          created_at: stored.created_at,
          migration_source_markdown: "Original Markdown",
          migration_source_created_at: "2026-06-30T00:00:00.000Z"
        })
      );
      expect(
        app.db
          .prepare("SELECT COUNT(*) AS count FROM post_translations WHERE post_id = ? AND locale = 'zh'")
          .get(createdPost.id)
      ).toEqual({ count: 0 });

      expect(() =>
        updatePost(app.db, createdPost.id, {
          slug: "canonical-content",
          status: "draft",
          publishedAt: null,
          tagSlugs: [],
          expectedUpdatedAt: createdPost.updatedAt,
          translations: [{ locale: "en", title: "Stale", summary: "", content: tiptapContent }]
        })
      ).toThrow(PostUpdateConflictError);
    } finally {
      await app.close();
    }
  });

  test("maps article content and stale update errors to safe responses", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);
      const invalidContentResponse = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "invalid-content",
          status: "draft",
          publishedAt: null,
          tagSlugs: [],
          translations: [{ locale: "en", title: "Invalid", summary: "", content: unsafeTiptapContent }]
        }
      });

      expect(invalidContentResponse.statusCode).toBe(400);
      expect(invalidContentResponse.json()).toEqual({
        message: "Article content is invalid",
        code: "unsafe-link",
        path: ["content", 0, "content", 0, "marks", 0, "attrs", "href"]
      });

      const createResponse = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "stale-update",
          status: "draft",
          publishedAt: null,
          tagSlugs: [],
          translations: [{ locale: "en", title: "Original", summary: "", contentMarkdown: "Body" }]
        }
      });
      expect(createResponse.statusCode).toBe(201);
      const createdPost = createResponse.json().post;

      const firstUpdateResponse = await app.inject({
        method: "PUT",
        url: `/api/admin/posts/${createdPost.id}`,
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "stale-update",
          status: "draft",
          publishedAt: null,
          tagSlugs: [],
          expectedUpdatedAt: createdPost.updatedAt,
          translations: [{ locale: "en", title: "Updated", summary: "", contentMarkdown: "Body" }]
        }
      });
      expect(firstUpdateResponse.statusCode).toBe(200);

      const staleUpdateResponse = await app.inject({
        method: "PUT",
        url: `/api/admin/posts/${createdPost.id}`,
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "stale-update",
          status: "draft",
          publishedAt: null,
          tagSlugs: [],
          expectedUpdatedAt: createdPost.updatedAt,
          translations: [{ locale: "en", title: "Stale", summary: "", contentMarkdown: "Body" }]
        }
      });

      expect(staleUpdateResponse.statusCode).toBe(409);
      expect(staleUpdateResponse.json()).toEqual({ message: "Post was updated elsewhere" });
    } finally {
      await app.close();
    }
  });

  test("rejects publishing TipTap content until the server gate is enabled", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "blocked-tiptap-publish",
          status: "published",
          publishedAt: "2026-06-30T00:00:00.000Z",
          tagSlugs: [],
          translations: [{ locale: "en", title: "Blocked", summary: "", content: tiptapContent }]
        }
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ message: "TipTap publishing is not enabled" });
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

  test("archives a published post without clearing its publish history", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);
      const publishedAt = "2026-02-03T04:05:06.000Z";
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "temporarily-archived",
          status: "published",
          publishedAt,
          tagSlugs: [],
          translations: [{ locale: "en", title: "Temporarily archived", summary: "", contentMarkdown: "Visible body" }]
        }
      });

      expect(createResponse.statusCode).toBe(201);
      const postId = createResponse.json().post.id;

      const archiveResponse = await app.inject({
        method: "PUT",
        url: `/api/admin/posts/${postId}`,
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "temporarily-archived",
          status: "archived",
          publishedAt,
          tagSlugs: [],
          translations: [{ locale: "en", title: "Temporarily archived", summary: "", contentMarkdown: "Archived body" }]
        }
      });

      expect(archiveResponse.statusCode).toBe(200);
      expect(archiveResponse.json().post.status).toBe("archived");
      expect(archiveResponse.json().post.publishedAt).toBe(publishedAt);

      const publicDetailResponse = await app.inject({ method: "GET", url: "/api/posts/temporarily-archived" });
      expect(publicDetailResponse.statusCode).toBe(404);

      const publicListResponse = await app.inject({ method: "GET", url: "/api/posts" });
      expect(publicListResponse.statusCode).toBe(200);
      expect(publicListResponse.json()).toEqual({ posts: [], total: 0, page: 1, limit: 20 });

      const republishResponse = await app.inject({
        method: "PUT",
        url: `/api/admin/posts/${postId}`,
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "temporarily-archived",
          status: "published",
          publishedAt,
          tagSlugs: [],
          translations: [{ locale: "en", title: "Temporarily archived", summary: "", contentMarkdown: "Visible again" }]
        }
      });

      expect(republishResponse.statusCode).toBe(200);
      expect(republishResponse.json().post.status).toBe("published");
      expect(republishResponse.json().post.publishedAt).toBe(publishedAt);

      const visibleDetailResponse = await app.inject({ method: "GET", url: "/api/posts/temporarily-archived" });
      expect(visibleDetailResponse.statusCode).toBe(200);
      expect(visibleDetailResponse.json().post.publishedAt).toBe(publishedAt);
    } finally {
      await app.close();
    }
  });

  test("rejects unknown categories instead of creating them while saving posts", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: {
          slug: "unknown-category-post",
          status: "draft",
          publishedAt: null,
          categorySlug: "missing-category",
          tagSlugs: [],
          translations: [{ locale: "en", title: "Unknown category", summary: "", contentMarkdown: "" }]
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: 'Category "missing-category" does not exist' });
      const categoriesResponse = await app.inject({ method: "GET", url: "/api/categories" });
      expect(categoriesResponse.json()).toEqual({ categories: [] });
    } finally {
      await app.close();
    }
  });

  test("rejects unknown tags instead of creating them while saving posts", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: {
          slug: "unknown-tag-post",
          status: "draft",
          publishedAt: null,
          categorySlug: null,
          tagSlugs: ["missing-tag"],
          translations: [{ locale: "en", title: "Unknown tag", summary: "", contentMarkdown: "" }]
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: 'Tag "missing-tag" does not exist' });
      const tagsResponse = await app.inject({ method: "GET", url: "/api/tags" });
      expect(tagsResponse.json()).toEqual({ tags: [] });
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
  test("persists lifecycle metadata and orders pinned public posts first", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const createPost = async (slug: string, publishedAt: string, isPinned: boolean) =>
        app.inject({
          method: "POST",
          url: "/api/admin/posts",
          headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
          payload: {
            slug,
            status: "published",
            publishedAt,
            tagSlugs: [],
            isPinned,
            isFeatured: isPinned,
            coverUrl: isPinned ? "/uploads/covers/pinned.webp" : "",
            translations: [{ locale: "en", title: slug, summary: "", contentMarkdown: "" }]
          }
        });

      const pinnedResponse = await createPost("older-pinned", "2026-01-01T00:00:00.000Z", true);
      const recentResponse = await createPost("newer-regular", "2026-05-01T00:00:00.000Z", false);
      expect(pinnedResponse.statusCode).toBe(201);
      expect(recentResponse.statusCode).toBe(201);
      expect(pinnedResponse.json().post).toEqual(
        expect.objectContaining({
          isPinned: true,
          isFeatured: true,
          coverUrl: "/uploads/covers/pinned.webp",
          deletedAt: null
        })
      );

      const listResponse = await app.inject({ method: "GET", url: "/api/posts" });
      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json().posts.map((post: { slug: string }) => post.slug)).toEqual([
        "older-pinned",
        "newer-regular"
      ]);

      const lifecycleResponse = await app.inject({
        method: "PATCH",
        url: `/api/admin/posts/${pinnedResponse.json().post.id}/lifecycle`,
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { status: "archived", isPinned: false, coverUrl: "" }
      });
      expect(lifecycleResponse.statusCode).toBe(200);
      expect(lifecycleResponse.json().post).toEqual(
        expect.objectContaining({ status: "archived", isPinned: false, isFeatured: true, coverUrl: "" })
      );
      expect((await app.inject({ method: "GET", url: "/api/posts/older-pinned" })).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  test("moves posts through trash, restore, and guarded permanent deletion", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: {
          slug: "trash-lifecycle",
          status: "published",
          publishedAt: "2026-01-01T00:00:00.000Z",
          tagSlugs: [],
          translations: [{ locale: "en", title: "Trash lifecycle", summary: "", contentMarkdown: "" }]
        }
      });
      const postId = createResponse.json().post.id as number;

      const trashResponse = await app.inject({
        method: "DELETE",
        url: `/api/admin/posts/${postId}`,
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken }
      });
      expect(trashResponse.statusCode).toBe(200);
      expect((await app.inject({ method: "GET", url: "/api/posts/trash-lifecycle" })).statusCode).toBe(404);

      const editTrashedResponse = await app.inject({
        method: "PUT",
        url: `/api/admin/posts/${postId}`,
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: {
          slug: "trash-lifecycle-edited",
          status: "draft",
          publishedAt: null,
          tagSlugs: [],
          translations: [{ locale: "en", title: "Should not change", summary: "", contentMarkdown: "" }]
        }
      });
      expect(editTrashedResponse.statusCode).toBe(404);

      const adminList = await app.inject({ method: "GET", url: "/api/admin/posts", headers: { cookie: auth.cookie } });
      expect(adminList.json()).toEqual({ posts: [] });
      const trashList = await app.inject({
        method: "GET",
        url: "/api/admin/posts/trash",
        headers: { cookie: auth.cookie }
      });
      expect(trashList.statusCode).toBe(200);
      expect(trashList.json().posts[0]).toEqual(expect.objectContaining({ id: postId, deletedAt: expect.any(String) }));

      const earlyDelete = await app.inject({
        method: "DELETE",
        url: `/api/admin/posts/${postId}/permanent`,
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken }
      });
      expect(earlyDelete.statusCode).toBe(409);

      const restoreResponse = await app.inject({
        method: "POST",
        url: `/api/admin/posts/${postId}/restore`,
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken }
      });
      expect(restoreResponse.statusCode).toBe(200);
      expect(restoreResponse.json().post.deletedAt).toBeNull();

      await app.inject({
        method: "DELETE",
        url: `/api/admin/posts/${postId}`,
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken }
      });
      app.db.prepare("UPDATE posts SET deleted_at = ? WHERE id = ?").run("2026-01-01T00:00:00.000Z", postId);

      const permanentDelete = await app.inject({
        method: "DELETE",
        url: `/api/admin/posts/${postId}/permanent`,
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken }
      });
      expect(permanentDelete.statusCode).toBe(200);
      expect(permanentDelete.json()).toEqual({ ok: true });
      expect(app.db.prepare("SELECT id FROM posts WHERE id = ?").get(postId)).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  test("applies bulk lifecycle changes transactionally", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const ids: number[] = [];
      for (const slug of ["bulk-one", "bulk-two"]) {
        const response = await app.inject({
          method: "POST",
          url: "/api/admin/posts",
          headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
          payload: {
            slug,
            status: "published",
            publishedAt: "2026-02-01T00:00:00.000Z",
            tagSlugs: [],
            translations: [{ locale: "en", title: slug, summary: "", contentMarkdown: "" }]
          }
        });
        ids.push(response.json().post.id);
      }

      const failedBulk = await app.inject({
        method: "POST",
        url: "/api/admin/posts/bulk",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { ids: [ids[0], 999999], action: "archive" }
      });
      expect(failedBulk.statusCode).toBe(404);
      expect(app.db.prepare("SELECT status FROM posts WHERE id = ?").get(ids[0])).toEqual({ status: "published" });

      const archiveResponse = await app.inject({
        method: "POST",
        url: "/api/admin/posts/bulk",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { ids, action: "archive" }
      });
      expect(archiveResponse.statusCode).toBe(200);
      expect(archiveResponse.json()).toEqual({ updated: 2 });

      const trashResponse = await app.inject({
        method: "POST",
        url: "/api/admin/posts/bulk",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { ids, action: "trash" }
      });
      expect(trashResponse.statusCode).toBe(200);
      expect(trashResponse.json()).toEqual({ updated: 2 });

      const restoreResponse = await app.inject({
        method: "POST",
        url: "/api/admin/posts/bulk",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { ids, action: "restore" }
      });
      expect(restoreResponse.statusCode).toBe(200);
      expect(restoreResponse.json()).toEqual({ updated: 2 });
    } finally {
      await app.close();
    }
  });

  test("rejects the retired hidden post status", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: {
          slug: "retired-hidden",
          status: "hidden",
          publishedAt: null,
          tagSlugs: [],
          translations: [{ locale: "en", title: "Retired hidden", summary: "", contentMarkdown: "" }]
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: "Invalid post input" });
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

  test("rejects retired hidden status after migrating existing post status constraints", () => {
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
      ).toThrow();
      expect(migratedDb.prepare("SELECT status, published_at FROM posts WHERE slug = ?").get("legacy-published")).toEqual({
        status: "published",
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
      await createTag(app, cookie, csrfToken, "release");
      await createTag(app, cookie, csrfToken, "other");

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

  test("post saves preserve existing tag display names for matching normalized slugs", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);

      const createTagResponse = await app.inject({
        method: "POST",
        url: "/api/admin/tags",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: { slug: "typescript", name: "TypeScript" }
      });
      expect(createTagResponse.statusCode).toBe(201);

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
            name: "TypeScript"
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

  test("reports active tag usage and blocks deleting referenced tags", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const createTagResponse = await app.inject({
        method: "POST",
        url: "/api/admin/tags",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { slug: "protected-tag", name: "Protected" }
      });
      expect(createTagResponse.statusCode).toBe(201);
      expect(createTagResponse.json().tag).toEqual(expect.objectContaining({ postCount: 0 }));

      const createPostResponse = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: {
          slug: "tag-reference",
          status: "draft",
          publishedAt: null,
          tagSlugs: ["protected-tag"],
          translations: [{ locale: "en", title: "Tag reference", summary: "", contentMarkdown: "" }]
        }
      });
      expect(createPostResponse.statusCode).toBe(201);

      const listResponse = await app.inject({
        method: "GET",
        url: "/api/admin/tags",
        headers: { cookie: auth.cookie }
      });
      expect(listResponse.json().tags).toEqual([
        expect.objectContaining({
          slug: "protected-tag",
          postCount: 1,
          activePostCount: 1,
          trashedPostCount: 0,
          totalPostCount: 1
        })
      ]);

      const blockedResponse = await app.inject({
        method: "DELETE",
        url: `/api/admin/tags/${createTagResponse.json().tag.id}`,
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken }
      });
      expect(blockedResponse.statusCode).toBe(409);
      expect(blockedResponse.json()).toEqual({ message: "Tag is referenced by posts" });

      await app.inject({
        method: "DELETE",
        url: `/api/admin/posts/${createPostResponse.json().post.id}`,
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken }
      });
      const afterTrashResponse = await app.inject({
        method: "GET",
        url: "/api/admin/tags",
        headers: { cookie: auth.cookie }
      });
      expect(afterTrashResponse.json().tags[0]).toEqual(
        expect.objectContaining({
          postCount: 0,
          activePostCount: 0,
          trashedPostCount: 1,
          totalPostCount: 1
        })
      );
    } finally {
      await app.close();
    }
  });

  test("returns conflict for normalized duplicate tag names", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const firstResponse = await app.inject({
        method: "POST",
        url: "/api/admin/tags",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { slug: "typescript", name: "TypeScript" }
      });
      expect(firstResponse.statusCode).toBe(201);

      const duplicateResponse = await app.inject({
        method: "POST",
        url: "/api/admin/tags",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { slug: "typescript-guides", name: " typescript " }
      });

      expect(duplicateResponse.statusCode).toBe(409);
      expect(duplicateResponse.json()).toEqual({ message: "Tag already exists" });

      const other = await createTag(app, auth.cookie, auth.csrfToken, "react", "React");
      const updateResponse = await app.inject({
        method: "PUT",
        url: `/api/admin/tags/${other.id}`,
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { name: "TYPESCRIPT" }
      });
      expect(updateResponse.statusCode).toBe(409);
      expect(updateResponse.json()).toEqual({ message: "Tag already exists" });
    } finally {
      await app.close();
    }
  });

  test("lists tag references and selectively detaches chosen posts", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const tagResponse = await app.inject({
        method: "POST",
        url: "/api/admin/tags",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { slug: "typescript", name: "TypeScript" }
      });
      expect(tagResponse.statusCode).toBe(201);
      const tagId = tagResponse.json().tag.id as number;
      const postIds: number[] = [];

      for (const [slug, title] of [
        ["active-tag-reference", "Active tag reference"],
        ["trashed-tag-reference", "Trashed tag reference"]
      ]) {
        const response = await app.inject({
          method: "POST",
          url: "/api/admin/posts",
          headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
          payload: {
            slug,
            status: "draft",
            publishedAt: null,
            categorySlug: null,
            tagSlugs: ["typescript"],
            translations: [{ locale: "en", title, summary: "", contentMarkdown: "" }]
          }
        });
        expect(response.statusCode).toBe(201);
        postIds.push(response.json().post.id as number);
      }

      await app.inject({
        method: "DELETE",
        url: `/api/admin/posts/${postIds[1]}`,
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken }
      });

      const referencesResponse = await app.inject({
        method: "GET",
        url: `/api/admin/tags/${tagId}/references`,
        headers: { cookie: auth.cookie }
      });
      expect(referencesResponse.statusCode).toBe(200);
      expect(referencesResponse.json()).toEqual({
        references: [
          expect.objectContaining({ id: postIds[0], deletedAt: null, titles: { en: "Active tag reference" } }),
          expect.objectContaining({
            id: postIds[1],
            deletedAt: expect.any(String),
            titles: { en: "Trashed tag reference" }
          })
        ],
        activePostCount: 1,
        trashedPostCount: 1,
        totalPostCount: 2
      });

      const detachResponse = await app.inject({
        method: "POST",
        url: `/api/admin/tags/${tagId}/detach`,
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { postIds: [postIds[0]] }
      });
      expect(detachResponse.statusCode).toBe(200);
      expect(detachResponse.json()).toEqual({
        detachedCount: 1,
        activePostCount: 0,
        trashedPostCount: 1,
        totalPostCount: 1
      });
    } finally {
      await app.close();
    }
  });
});
