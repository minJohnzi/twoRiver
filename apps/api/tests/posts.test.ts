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
    DEEPSEEK_BASE_URL: "https://api.deepseek.com"
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

      const listResponse = await app.inject({
        method: "GET",
        url: "/api/posts"
      });

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()).toEqual({ posts: [] });
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

      const detailResponse = await app.inject({
        method: "GET",
        url: "/api/posts/published-bilingual"
      });

      expect(detailResponse.statusCode).toBe(200);
      const body = detailResponse.json();
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
