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
    CORS_ALLOWED_ORIGINS: [],
    DEEPSEEK_BASE_URL: "https://api.deepseek.com",
    DEEPSEEK_MODEL: "deepseek-chat"
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
      const cookies = Array.isArray(setCookie) ? setCookie : [String(setCookie ?? "")];
      const sessionCookie = cookies.find((cookie) => cookie.startsWith("tworiver_session=")) ?? "";
      const csrfCookie = cookies.find((cookie) => cookie.startsWith("tworiver_csrf=")) ?? "";
      expect(sessionCookie).toContain("tworiver_session=");
      expect(sessionCookie).toContain("HttpOnly");
      expect(sessionCookie).toContain("Path=/");
      expect(sessionCookie).toContain("SameSite=Lax");
      expect(csrfCookie).toContain("tworiver_csrf=");
      expect(csrfCookie).not.toContain("HttpOnly");
      expect(csrfCookie).toContain("Path=/");
      expect(csrfCookie).toContain("SameSite=Lax");

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

  test("sets security headers and only allows trusted credentialed CORS origins", async () => {
    const databasePath = createDatabasePath();
    migrate(databasePath);
    const db = openDatabase(databasePath);
    await seedAdmin(db, "admin", "secret1234567");

    const app = buildApp({
      config: {
        ...makeConfig(databasePath),
        CORS_ALLOWED_ORIGINS: ["https://blog.example.com"]
      },
      db
    });

    try {
      const trustedResponse = await app.inject({
        method: "GET",
        url: "/api/health",
        headers: {
          origin: "https://blog.example.com"
        }
      });

      expect(trustedResponse.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
      expect(trustedResponse.headers["x-content-type-options"]).toBe("nosniff");
      expect(trustedResponse.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(trustedResponse.headers["x-frame-options"]).toBe("DENY");
      expect(trustedResponse.headers["access-control-allow-origin"]).toBe("https://blog.example.com");
      expect(trustedResponse.headers["access-control-allow-credentials"]).toBe("true");

      const untrustedResponse = await app.inject({
        method: "GET",
        url: "/api/health",
        headers: {
          origin: "https://evil.example.com"
        }
      });

      expect(untrustedResponse.headers["access-control-allow-origin"]).toBeUndefined();
      expect(untrustedResponse.headers["access-control-allow-credentials"]).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  test("requires CSRF token for logout and accepts the matching token", async () => {
    const databasePath = createDatabasePath();
    migrate(databasePath);
    const db = openDatabase(databasePath);
    await seedAdmin(db, "admin", "secret1234567");

    const app = buildApp({ config: makeConfig(databasePath), db });

    try {
      const loginResponse = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          username: "admin",
          password: "secret1234567"
        }
      });
      expect(loginResponse.statusCode).toBe(200);

      const cookies = Array.isArray(loginResponse.headers["set-cookie"])
        ? loginResponse.headers["set-cookie"]
        : [String(loginResponse.headers["set-cookie"] ?? "")];
      const sessionCookie = cookies.find((cookie) => cookie.startsWith("tworiver_session="))?.split(";")[0];
      const csrfCookie = cookies.find((cookie) => cookie.startsWith("tworiver_csrf="))?.split(";")[0];
      if (!sessionCookie || !csrfCookie) {
        throw new Error("Expected login response to set session and CSRF cookies.");
      }
      const cookie = `${sessionCookie}; ${csrfCookie}`;
      const csrfToken = csrfCookie.slice("tworiver_csrf=".length);

      const missingTokenResponse = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { cookie }
      });
      expect(missingTokenResponse.statusCode).toBe(403);
      expect(missingTokenResponse.json()).toEqual({ message: "Invalid CSRF token" });

      const wrongTokenResponse = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { cookie, "x-csrf-token": "wrong-token" }
      });
      expect(wrongTokenResponse.statusCode).toBe(403);
      expect(wrongTokenResponse.json()).toEqual({ message: "Invalid CSRF token" });

      const logoutResponse = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { cookie, "x-csrf-token": csrfToken }
      });
      expect(logoutResponse.statusCode).toBe(200);
      expect(logoutResponse.json()).toEqual({ ok: true });
    } finally {
      await app.close();
    }
  });
});
