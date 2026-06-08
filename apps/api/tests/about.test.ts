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
    DEEPSEEK_BASE_URL: "https://api.deepseek.com"
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
      const cookie = await login(app);
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
        headers: { cookie },
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
});
