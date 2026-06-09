import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, test } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tworiver-about-"));
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

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("about routes", () => {
  test("returns an empty public about profile placeholder shape", async () => {
    const app = await createTestApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/about"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        about: {
          displayName: "",
          headline: "",
          bio: "",
          avatarUrl: "",
          githubUrl: "",
          email: "",
          socialLinks: [],
          updatedAt: expect.any(String)
        }
      });
    } finally {
      await app.close();
    }
  });

  test("updates and reads about profile without exposing delete", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await login(app);
      const payload = {
        displayName: "TwoRiver",
        headline: "Software engineer and technical writer",
        bio: "I write about software engineering, system design, and durable tools.",
        avatarUrl: "https://example.com/avatar.png",
        githubUrl: "https://github.com/tworiver",
        email: "hello@example.com",
        socialLinks: [
          {
            label: "Blogroll",
            url: "https://example.com/blogroll"
          }
        ]
      };

      const updateResponse = await app.inject({
        method: "PUT",
        url: "/api/admin/about",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload
      });

      expect(updateResponse.statusCode).toBe(200);
      expect(updateResponse.json()).toEqual({
        about: {
          ...payload,
          updatedAt: expect.any(String)
        }
      });

      const publicResponse = await app.inject({
        method: "GET",
        url: "/api/about"
      });
      expect(publicResponse.json().about).toEqual({
        ...payload,
        updatedAt: expect.any(String)
      });

      const deleteResponse = await app.inject({
        method: "DELETE",
        url: "/api/admin/about",
        headers: { cookie }
      });
      expect(deleteResponse.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  test("rejects admin about updates with missing or invalid CSRF tokens", async () => {
    const app = await createTestApp();

    try {
      const { cookie } = await login(app);
      const payload = {
        displayName: "TwoRiver",
        headline: "",
        bio: "",
        avatarUrl: "",
        githubUrl: "",
        email: "",
        socialLinks: []
      };

      const missingTokenResponse = await app.inject({
        method: "PUT",
        url: "/api/admin/about",
        headers: { cookie },
        payload
      });
      expect(missingTokenResponse.statusCode).toBe(403);
      expect(missingTokenResponse.json()).toEqual({ message: "Invalid CSRF token" });

      const wrongTokenResponse = await app.inject({
        method: "PUT",
        url: "/api/admin/about",
        headers: { cookie, "x-csrf-token": "wrong-token" },
        payload
      });
      expect(wrongTokenResponse.statusCode).toBe(403);
      expect(wrongTokenResponse.json()).toEqual({ message: "Invalid CSRF token" });
    } finally {
      await app.close();
    }
  });
});
