import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tworiver-auth-"));
  tempDirectories.push(directory);
  return path.join(directory, "blog.sqlite");
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("auth routes", () => {
  test("rejects invalid credentials, logs in admin, and returns current user from session cookie", async () => {
    const databasePath = createDatabasePath();
    migrate(databasePath);
    const db = openDatabase(databasePath);
    await seedAdmin(db, "admin", "secret1234567");

    const app = buildApp({ config: makeConfig(databasePath), db });

    try {
      const invalidLoginResponse = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          username: "admin",
          password: "wrong-password"
        }
      });

      expect(invalidLoginResponse.statusCode).toBe(401);
      expect(invalidLoginResponse.json()).toEqual({
        message: "Invalid username or password"
      });

      const loginResponse = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          username: "admin",
          password: "secret1234567"
        }
      });

      expect(loginResponse.statusCode).toBe(200);
      expect(loginResponse.json()).toEqual({
        user: {
          id: 1,
          username: "admin"
        }
      });

      const setCookie = loginResponse.headers["set-cookie"];
      const sessionCookie = Array.isArray(setCookie) ? setCookie[0] : String(setCookie ?? "");
      expect(sessionCookie).toContain("tworiver_session=");
      expect(sessionCookie).toContain("HttpOnly");
      expect(sessionCookie).toContain("Path=/");
      expect(sessionCookie).toContain("SameSite=Lax");

      const cookieHeader = sessionCookie?.split(";")[0];
      expect(cookieHeader).toBeDefined();
      if (!cookieHeader) {
        throw new Error("Expected login response to set a session cookie.");
      }

      const meResponse = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: {
          cookie: cookieHeader
        }
      });

      expect(meResponse.statusCode).toBe(200);
      expect(meResponse.json()).toEqual({
        user: {
          id: 1,
          username: "admin"
        }
      });
    } finally {
      await app.close();
    }
  });
});
