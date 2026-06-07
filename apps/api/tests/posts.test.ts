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

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("post routes", () => {
  test("hides drafts from public list", async () => {
    const app = await createTestApp();

    try {
      const cookie = await login(app);
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie },
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
      const cookie = await login(app);
      const publishedAt = new Date("2026-01-02T03:04:05.000Z").toISOString();
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie },
        payload: {
          slug: "published-bilingual",
          status: "published",
          publishedAt,
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
});

describe("tag routes", () => {
  test("authenticated admin tag list, create, and update return envelopes", async () => {
    const app = await createTestApp();

    try {
      const cookie = await login(app);

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
        headers: { cookie },
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
        headers: { cookie },
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
      const cookie = await login(app);

      await app.inject({
        method: "POST",
        url: "/api/admin/tags",
        headers: { cookie },
        payload: {
          slug: "a-slug",
          name: "Zulu"
        }
      });
      await app.inject({
        method: "POST",
        url: "/api/admin/tags",
        headers: { cookie },
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

  test("post tag creation upserts display names for matching normalized slugs", async () => {
    const app = await createTestApp();

    try {
      const cookie = await login(app);

      const firstPostResponse = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie },
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
        headers: { cookie },
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
});
