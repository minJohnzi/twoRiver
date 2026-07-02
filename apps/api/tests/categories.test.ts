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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tworiver-categories-"));
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

async function createCategory(app: FastifyInstance, cookie: string, csrfToken: string, slug: string, name: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/admin/categories",
    headers: { cookie, "x-csrf-token": csrfToken },
    payload: { slug, name }
  });
  expect(response.statusCode).toBe(201);
  return response.json().category as { id: number; slug: string; name: string };
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

describe("category routes", () => {
  test("rejects admin category mutations with missing or invalid CSRF tokens", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);
      const category = await createCategory(app, cookie, csrfToken, "security", "Security");

      for (const request of [
        {
          method: "POST" as const,
          url: "/api/admin/categories",
          payload: { slug: "missing-token", name: "Missing token" }
        },
        {
          method: "PUT" as const,
          url: `/api/admin/categories/${category.id}`,
          payload: { name: "Missing token" }
        },
        {
          method: "DELETE" as const,
          url: `/api/admin/categories/${category.id}`
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
        method: "PUT",
        url: `/api/admin/categories/${category.id}`,
        headers: { cookie, "x-csrf-token": "wrong-token" },
        payload: { name: "Wrong token" }
      });
      expect(wrongTokenResponse.statusCode).toBe(403);
      expect(wrongTokenResponse.json()).toEqual({ message: "Invalid CSRF token" });
    } finally {
      await app.close();
    }
  });

  test("supports public and admin category CRUD with slug uniqueness and missing 404s", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);
      const category = await createCategory(app, cookie, csrfToken, "Engineering", "Engineering");

      const duplicateResponse = await app.inject({
        method: "POST",
        url: "/api/admin/categories",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: { slug: "engineering", name: "Duplicate" }
      });
      expect(duplicateResponse.statusCode).toBe(409);
      expect(duplicateResponse.json()).toEqual({ message: "Category already exists" });

      const updateResponse = await app.inject({
        method: "PUT",
        url: `/api/admin/categories/${category.id}`,
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: { slug: "platform", name: "Platform" }
      });
      expect(updateResponse.statusCode).toBe(200);
      expect(updateResponse.json().category).toEqual(
        expect.objectContaining({
          id: category.id,
          slug: "platform",
          name: "Platform"
        })
      );

      const publicListResponse = await app.inject({
        method: "GET",
        url: "/api/categories"
      });
      expect(publicListResponse.statusCode).toBe(200);
      expect(publicListResponse.json()).toEqual({
        categories: [expect.objectContaining({ slug: "platform", name: "Platform" })]
      });

      const missingPublicResponse = await app.inject({
        method: "GET",
        url: "/api/categories/missing"
      });
      expect(missingPublicResponse.statusCode).toBe(404);

      const missingDeleteResponse = await app.inject({
        method: "DELETE",
        url: "/api/admin/categories/999",
        headers: { cookie, "x-csrf-token": csrfToken }
      });
      expect(missingDeleteResponse.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  test("returns category detail with only published posts in that category", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);
      await createCategory(app, cookie, csrfToken, "engineering", "Engineering");
      await createCategory(app, cookie, csrfToken, "culture", "Culture");
      await createTag(app, cookie, csrfToken, "release");

      await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "published-engineering",
          status: "published",
          publishedAt: new Date("2026-03-01T00:00:00.000Z").toISOString(),
          categorySlug: "engineering",
          tagSlugs: ["release"],
          translations: [{ locale: "en", title: "Published Engineering", summary: "", contentMarkdown: "" }]
        }
      });
      await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "draft-engineering",
          status: "draft",
          publishedAt: null,
          categorySlug: "engineering",
          tagSlugs: [],
          translations: [{ locale: "en", title: "Draft Engineering", summary: "", contentMarkdown: "" }]
        }
      });
      await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          slug: "published-culture",
          status: "published",
          publishedAt: new Date("2026-03-02T00:00:00.000Z").toISOString(),
          categorySlug: "culture",
          tagSlugs: [],
          translations: [{ locale: "en", title: "Published Culture", summary: "", contentMarkdown: "" }]
        }
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/categories/engineering"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().category).toEqual(expect.objectContaining({ slug: "engineering" }));
      expect(response.json().posts.map((post: { slug: string }) => post.slug)).toEqual(["published-engineering"]);
    } finally {
      await app.close();
    }
  });

  test("orders categories, stores localized descriptions, and reports active post counts", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const createLater = await app.inject({
        method: "POST",
        url: "/api/admin/categories",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: {
          slug: "later",
          name: "Later",
          sortOrder: 20,
          translations: [
            { locale: "zh", description: "稍后阅读" },
            { locale: "en", description: "Read later" }
          ]
        }
      });
      const createFirst = await app.inject({
        method: "POST",
        url: "/api/admin/categories",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { slug: "first", name: "First", sortOrder: 10, translations: [] }
      });
      expect(createLater.statusCode).toBe(201);
      expect(createFirst.statusCode).toBe(201);
      expect(createLater.json().category).toEqual(
        expect.objectContaining({
          sortOrder: 20,
          postCount: 0,
          translations: [
            { locale: "en", description: "Read later" },
            { locale: "zh", description: "稍后阅读" }
          ]
        })
      );

      for (const slug of ["counted-one", "counted-two"]) {
        const response = await app.inject({
          method: "POST",
          url: "/api/admin/posts",
          headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
          payload: {
            slug,
            status: "draft",
            publishedAt: null,
            categorySlug: "later",
            tagSlugs: [],
            translations: [{ locale: "en", title: slug, summary: "", contentMarkdown: "" }]
          }
        });
        expect(response.statusCode).toBe(201);
        if (slug === "counted-two") {
          await app.inject({
            method: "DELETE",
            url: `/api/admin/posts/${response.json().post.id}`,
            headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken }
          });
        }
      }

      const listResponse = await app.inject({
        method: "GET",
        url: "/api/admin/categories",
        headers: { cookie: auth.cookie }
      });
      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json().categories.map((category: { slug: string }) => category.slug)).toEqual([
        "first",
        "later"
      ]);
      expect(listResponse.json().categories[1]).toEqual(
        expect.objectContaining({
          postCount: 1,
          activePostCount: 1,
          trashedPostCount: 1,
          totalPostCount: 2
        })
      );

      const updateResponse = await app.inject({
        method: "PUT",
        url: `/api/admin/categories/${createLater.json().category.id}`,
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: {
          sortOrder: 5,
          translations: [{ locale: "zh", description: "更新后的描述" }]
        }
      });
      expect(updateResponse.statusCode).toBe(200);
      expect(updateResponse.json().category).toEqual(
        expect.objectContaining({
          sortOrder: 5,
          translations: [{ locale: "zh", description: "更新后的描述" }]
        })
      );
    } finally {
      await app.close();
    }
  });

  test("blocks deleting referenced categories and deletes unreferenced categories", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const referenced = await createCategory(app, auth.cookie, auth.csrfToken, "referenced", "Referenced");
      const unused = await createCategory(app, auth.cookie, auth.csrfToken, "unused", "Unused");
      await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: {
          slug: "category-reference",
          status: "draft",
          publishedAt: null,
          categorySlug: "referenced",
          tagSlugs: [],
          translations: [{ locale: "en", title: "Reference", summary: "", contentMarkdown: "" }]
        }
      });

      const blockedResponse = await app.inject({
        method: "DELETE",
        url: `/api/admin/categories/${referenced.id}`,
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken }
      });
      expect(blockedResponse.statusCode).toBe(409);
      expect(blockedResponse.json()).toEqual({ message: "Category is referenced by posts" });

      const deleteResponse = await app.inject({
        method: "DELETE",
        url: `/api/admin/categories/${unused.id}`,
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken }
      });
      expect(deleteResponse.statusCode).toBe(200);
      expect(deleteResponse.json()).toEqual({ ok: true });
    } finally {
      await app.close();
    }
  });

  test("returns a conflict for normalized duplicate category names", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      await createCategory(app, auth.cookie, auth.csrfToken, "react", "React");

      const duplicateResponse = await app.inject({
        method: "POST",
        url: "/api/admin/categories",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { slug: "react-guides", name: " react " }
      });

      expect(duplicateResponse.statusCode).toBe(409);
      expect(duplicateResponse.json()).toEqual({ message: "Category already exists" });

      const other = await createCategory(app, auth.cookie, auth.csrfToken, "vue", "Vue");
      const updateResponse = await app.inject({
        method: "PUT",
        url: `/api/admin/categories/${other.id}`,
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { name: "REACT" }
      });
      expect(updateResponse.statusCode).toBe(409);
      expect(updateResponse.json()).toEqual({ message: "Category already exists" });
    } finally {
      await app.close();
    }
  });

  test("lists category references and selectively detaches chosen posts", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const category = await createCategory(app, auth.cookie, auth.csrfToken, "engineering", "Engineering");
      const postIds: number[] = [];

      for (const [slug, title] of [
        ["active-reference", "正常文章"],
        ["trashed-reference", "回收站文章"]
      ]) {
        const response = await app.inject({
          method: "POST",
          url: "/api/admin/posts",
          headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
          payload: {
            slug,
            status: "draft",
            publishedAt: null,
            categorySlug: category.slug,
            tagSlugs: [],
            translations: [{ locale: "zh", title, summary: "", contentMarkdown: "" }]
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
        url: `/api/admin/categories/${category.id}/references`,
        headers: { cookie: auth.cookie }
      });
      expect(referencesResponse.statusCode).toBe(200);
      expect(referencesResponse.json()).toEqual({
        references: [
          expect.objectContaining({
            id: postIds[0],
            slug: "active-reference",
            deletedAt: null,
            titles: { zh: "正常文章" }
          }),
          expect.objectContaining({
            id: postIds[1],
            slug: "trashed-reference",
            deletedAt: expect.any(String),
            titles: { zh: "回收站文章" }
          })
        ],
        activePostCount: 1,
        trashedPostCount: 1,
        totalPostCount: 2
      });

      const detachResponse = await app.inject({
        method: "POST",
        url: `/api/admin/categories/${category.id}/detach`,
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { postIds: [postIds[1]] }
      });
      expect(detachResponse.statusCode).toBe(200);
      expect(detachResponse.json()).toEqual({
        detachedCount: 1,
        activePostCount: 1,
        trashedPostCount: 0,
        totalPostCount: 1
      });

      const repeatedResponse = await app.inject({
        method: "POST",
        url: `/api/admin/categories/${category.id}/detach`,
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { postIds: [postIds[1]] }
      });
      expect(repeatedResponse.statusCode).toBe(200);
      expect(repeatedResponse.json().detachedCount).toBe(0);
    } finally {
      await app.close();
    }
  });
});
