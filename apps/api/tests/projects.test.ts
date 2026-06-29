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
  const directory = fsSync.mkdtempSync(path.join(os.tmpdir(), "tworiver-projects-api-"));
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

const projectInput = {
  slug: "river-console",
  techStack: ["React", "Fastify"],
  coverUrl: "/uploads/resources/covers/river.png",
  githubUrl: "https://github.com/example/river-console",
  demoUrl: "https://demo.example.com",
  sortOrder: 4,
  isVisible: true,
  isFeatured: false,
  translations: [
    {
      locale: "zh",
      name: "河流后台",
      description: "中文项目介绍",
      seoTitle: "河流后台 SEO",
      seoDescription: "中文项目描述"
    },
    {
      locale: "en",
      name: "River Console",
      description: "English project description",
      seoTitle: "River Console SEO",
      seoDescription: "English project summary"
    }
  ]
};

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("project showcase routes", () => {
  test("supports authenticated localized project CRUD", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/admin/projects",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: projectInput
      });
      expect(createResponse.statusCode).toBe(201);
      expect(createResponse.json().project).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          slug: "river-console",
          techStack: ["React", "Fastify"],
          coverUrl: "/uploads/resources/covers/river.png",
          githubUrl: "https://github.com/example/river-console",
          demoUrl: "https://demo.example.com",
          sortOrder: 4,
          isVisible: true,
          isFeatured: false,
          translations: expect.arrayContaining([
            expect.objectContaining({ locale: "zh", name: "河流后台" }),
            expect.objectContaining({ locale: "en", name: "River Console" })
          ])
        })
      );
      const projectId = createResponse.json().project.id as number;

      const updateResponse = await app.inject({
        method: "PUT",
        url: `/api/admin/projects/${projectId}`,
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: {
          slug: "river-console-v2",
          techStack: ["SQLite"],
          coverUrl: "",
          githubUrl: "",
          demoUrl: "https://demo.example.com/v2",
          sortOrder: 1,
          isVisible: true,
          isFeatured: true,
          translations: [{ locale: "en", name: "River Console v2", description: "Updated" }]
        }
      });
      expect(updateResponse.statusCode).toBe(200);
      expect(updateResponse.json().project).toEqual(
        expect.objectContaining({
          slug: "river-console-v2",
          techStack: ["SQLite"],
          isFeatured: true,
          translations: [expect.objectContaining({ locale: "en", name: "River Console v2" })]
        })
      );

      const listResponse = await app.inject({
        method: "GET",
        url: "/api/admin/projects",
        headers: { cookie: auth.cookie }
      });
      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json().projects).toEqual([
        expect.objectContaining({ id: projectId, slug: "river-console-v2" })
      ]);
    } finally {
      await app.close();
    }
  });

  test("rejects invalid URLs, duplicate slugs, and missing CSRF tokens", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const missingCsrfResponse = await app.inject({
        method: "POST",
        url: "/api/admin/projects",
        headers: { cookie: auth.cookie },
        payload: projectInput
      });
      expect(missingCsrfResponse.statusCode).toBe(403);

      const invalidUrlResponse = await app.inject({
        method: "POST",
        url: "/api/admin/projects",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { ...projectInput, githubUrl: "ftp://example.com/repo" }
      });
      expect(invalidUrlResponse.statusCode).toBe(400);
      expect(invalidUrlResponse.json()).toEqual({ message: "Invalid project input" });

      const createResponse = await app.inject({
        method: "POST",
        url: "/api/admin/projects",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: projectInput
      });
      expect(createResponse.statusCode).toBe(201);

      const duplicateResponse = await app.inject({
        method: "POST",
        url: "/api/admin/projects",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { ...projectInput, translations: [{ locale: "en", name: "Duplicate", description: "" }] }
      });
      expect(duplicateResponse.statusCode).toBe(409);
      expect(duplicateResponse.json()).toEqual({ message: "Project slug already exists" });
    } finally {
      await app.close();
    }
  });

  test("publishes visible projects with featured ordering and locale fallback", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      await app.inject({
        method: "POST",
        url: "/api/admin/projects",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { ...projectInput, slug: "ordinary", sortOrder: 1, isFeatured: false }
      });
      await app.inject({
        method: "POST",
        url: "/api/admin/projects",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { ...projectInput, slug: "hidden", isVisible: false }
      });
      await app.inject({
        method: "POST",
        url: "/api/admin/projects",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: {
          ...projectInput,
          slug: "featured",
          sortOrder: 99,
          isFeatured: true,
          translations: [{ locale: "en", name: "Featured", description: "Fallback project" }]
        }
      });

      const listResponse = await app.inject({ method: "GET", url: "/api/projects?locale=zh" });
      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json().projects.map((project: { slug: string }) => project.slug)).toEqual([
        "featured",
        "ordinary"
      ]);
      expect(listResponse.json().projects[0]).toEqual(
        expect.objectContaining({
          requestedLocale: "zh",
          translation: expect.objectContaining({ locale: "en", name: "Featured" })
        })
      );

      const hiddenResponse = await app.inject({ method: "GET", url: "/api/projects/hidden?locale=en" });
      expect(hiddenResponse.statusCode).toBe(404);

      const detailResponse = await app.inject({ method: "GET", url: "/api/projects/ordinary?locale=zh" });
      expect(detailResponse.statusCode).toBe(200);
      expect(detailResponse.json().project).toEqual(
        expect.objectContaining({
          slug: "ordinary",
          requestedLocale: "zh",
          translation: expect.objectContaining({ locale: "zh", name: "河流后台" })
        })
      );
    } finally {
      await app.close();
    }
  });
});
