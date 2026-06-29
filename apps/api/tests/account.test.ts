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
import { hashPassword } from "../src/services/passwordService.js";

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
  const directory = fsSync.mkdtempSync(path.join(os.tmpdir(), "tworiver-account-api-"));
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

async function login(
  app: FastifyInstance,
  username = "admin",
  password = "secret1234567"
): Promise<{ cookie: string; csrfToken: string; user: Record<string, unknown> }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password }
  });

  expect(response.statusCode).toBe(200);
  const sessionCookie = extractCookie(response.headers["set-cookie"], "tworiver_session");
  const csrfCookie = extractCookie(response.headers["set-cookie"], "tworiver_csrf");
  return {
    cookie: `${sessionCookie}; ${csrfCookie}`,
    csrfToken: csrfCookie.slice("tworiver_csrf=".length),
    user: response.json().user
  };
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("administrator account settings", () => {
  test("updates profile and returns enriched auth user shape", async () => {
    const app = await createTestApp();

    try {
      const auth = await login(app);
      expect(auth.user).toEqual(
        expect.objectContaining({ id: expect.any(Number), username: "admin", displayName: "", email: "", avatarUrl: "" })
      );

      const updateResponse = await app.inject({
        method: "PUT",
        url: "/api/admin/account/profile",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: {
          username: "owner",
          displayName: "Site Owner",
          email: "owner@example.com",
          avatarUrl: "/uploads/images/about/avatar.png"
        }
      });
      expect(updateResponse.statusCode).toBe(200);
      expect(updateResponse.json().user).toEqual(
        expect.objectContaining({
          username: "owner",
          displayName: "Site Owner",
          email: "owner@example.com",
          avatarUrl: "/uploads/images/about/avatar.png"
        })
      );

      const meResponse = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: auth.cookie }
      });
      expect(meResponse.statusCode).toBe(200);
      expect(meResponse.json().user).toEqual(updateResponse.json().user);
      expect(app.db.prepare("SELECT action, target_type, outcome FROM audit_events").all()).toEqual([
        { action: "admin.profile.update", target_type: "user", outcome: "success" }
      ]);
    } finally {
      await app.close();
    }
  });

  test("rejects duplicate usernames and invalid profile updates", async () => {
    const app = await createTestApp();

    try {
      const auth = await login(app);
      app.db
        .prepare("INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)")
        .run("taken", await hashPassword("secret1234567"), "Taken");

      const duplicateResponse = await app.inject({
        method: "PUT",
        url: "/api/admin/account/profile",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { username: "taken", displayName: "Admin", email: "", avatarUrl: "" }
      });
      expect(duplicateResponse.statusCode).toBe(409);
      expect(duplicateResponse.json()).toEqual({ message: "Username already exists" });

      const invalidResponse = await app.inject({
        method: "PUT",
        url: "/api/admin/account/profile",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { username: "", displayName: "", email: "not-an-email", avatarUrl: "" }
      });
      expect(invalidResponse.statusCode).toBe(400);
      expect(invalidResponse.json()).toEqual({ message: "Invalid profile input" });
    } finally {
      await app.close();
    }
  });

  test("changes password, revokes other sessions, and redacts audit metadata", async () => {
    const app = await createTestApp();

    try {
      const first = await login(app);
      const second = await login(app);

      const wrongPasswordResponse = await app.inject({
        method: "POST",
        url: "/api/admin/account/password",
        headers: { cookie: first.cookie, "x-csrf-token": first.csrfToken },
        payload: {
          currentPassword: "wrong-password",
          newPassword: "new-secret-12345",
          confirmPassword: "new-secret-12345"
        }
      });
      expect(wrongPasswordResponse.statusCode).toBe(400);
      expect(wrongPasswordResponse.json()).toEqual({ message: "Current password is incorrect" });

      const changeResponse = await app.inject({
        method: "POST",
        url: "/api/admin/account/password",
        headers: { cookie: first.cookie, "x-csrf-token": first.csrfToken },
        payload: {
          currentPassword: "secret1234567",
          newPassword: "new-secret-12345",
          confirmPassword: "new-secret-12345"
        }
      });
      expect(changeResponse.statusCode).toBe(200);
      expect(changeResponse.json()).toEqual({ ok: true, revokedSessions: 1 });

      const firstMe = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: first.cookie } });
      const secondMe = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: second.cookie } });
      expect(firstMe.statusCode).toBe(200);
      expect(secondMe.statusCode).toBe(401);

      await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: "admin", password: "secret1234567" }
      }).then((response) => expect(response.statusCode).toBe(401));
      await login(app, "admin", "new-secret-12345");

      const auditRows = app.db.prepare("SELECT action, outcome, metadata_json FROM audit_events ORDER BY id").all() as Array<{
        action: string;
        outcome: string;
        metadata_json: string;
      }>;
      expect(auditRows.map((row) => [row.action, row.outcome])).toEqual([
        ["admin.password.change", "failure"],
        ["admin.password.change", "success"]
      ]);
      expect(auditRows.map((row) => row.metadata_json).join("\n")).not.toMatch(/secret|password|session/i);
    } finally {
      await app.close();
    }
  });
});
