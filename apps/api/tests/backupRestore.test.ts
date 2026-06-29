import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as tar from "tar";
import { afterEach, describe, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../src/config.js";
import { buildApp } from "../src/app.js";
import { openDatabase } from "../src/db/connection.js";
import { migrate } from "../src/db/migrate.js";
import { seedAdmin } from "../src/db/seedAdmin.js";
import { getUploadsRoot } from "../src/services/uploads/uploadPaths.js";

const tempDirectories: string[] = [];
const configs = new WeakMap<FastifyInstance, AppConfig>();

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
  const directory = fsSync.mkdtempSync(path.join(os.tmpdir(), "tworiver-backup-api-"));
  tempDirectories.push(directory);
  return path.join(directory, "blog.sqlite");
}

async function createTestApp(): Promise<FastifyInstance> {
  const databasePath = createDatabasePath();
  migrate(databasePath);
  const db = openDatabase(databasePath);
  await seedAdmin(db, "admin", "secret1234567");
  const config = makeConfig(databasePath);
  const app = buildApp({ config, db });
  configs.set(app, config);
  return app;
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

function multipartRestoreBody(password: string, archive: Buffer) {
  const boundary = `----tworiver-restore-${Date.now()}`;
  const chunks: Buffer[] = [];
  const push = (value: string | Buffer) => chunks.push(typeof value === "string" ? Buffer.from(value) : value);

  push(`--${boundary}\r\n`);
  push('Content-Disposition: form-data; name="currentPassword"\r\n\r\n');
  push(`${password}\r\n`);
  push(`--${boundary}\r\n`);
  push('Content-Disposition: form-data; name="file"; filename="backup.tar.gz"\r\n');
  push("Content-Type: application/gzip\r\n\r\n");
  push(archive);
  push("\r\n");
  push(`--${boundary}--\r\n`);

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("backup and restore", () => {
  test("downloads a manifest-backed archive containing SQLite and uploads", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const config = configs.get(app);
      if (!config) {
        throw new Error("Expected config");
      }
      const uploadPath = path.join(getUploadsRoot(config), "resources", "manual.txt");
      await fs.mkdir(path.dirname(uploadPath), { recursive: true });
      await fs.writeFile(uploadPath, "manual");

      const response = await app.inject({
        method: "GET",
        url: "/api/admin/system/backup",
        headers: { cookie: auth.cookie }
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("application/gzip");

      const extractDirectory = fsSync.mkdtempSync(path.join(os.tmpdir(), "tworiver-backup-extract-"));
      tempDirectories.push(extractDirectory);
      const archivePath = path.join(extractDirectory, "backup.tar.gz");
      await fs.writeFile(archivePath, response.rawPayload);
      await tar.x({ file: archivePath, cwd: extractDirectory });

      const manifest = JSON.parse(await fs.readFile(path.join(extractDirectory, "manifest.json"), "utf8")) as {
        format: string;
        version: number;
        checksums: Record<string, string>;
      };
      expect(manifest).toEqual(
        expect.objectContaining({
          format: "tworiver-backup",
          version: 1,
          checksums: expect.objectContaining({
            "database.sqlite": expect.stringMatching(/^[0-9a-f]{64}$/),
            "uploads/resources/manual.txt": expect.stringMatching(/^[0-9a-f]{64}$/)
          })
        })
      );
      await expect(fs.access(path.join(extractDirectory, "database.sqlite"))).resolves.toBeUndefined();
      await expect(fs.readFile(path.join(extractDirectory, "uploads", "resources", "manual.txt"), "utf8")).resolves.toBe("manual");
    } finally {
      await app.close();
    }
  });

  test("restores database and uploads only after password verification", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const config = configs.get(app);
      if (!config) {
        throw new Error("Expected config");
      }
      const uploadPath = path.join(getUploadsRoot(config), "resources", "restore.txt");
      await fs.mkdir(path.dirname(uploadPath), { recursive: true });
      await fs.writeFile(uploadPath, "before");
      app.db.prepare("UPDATE users SET display_name = ? WHERE username = 'admin'").run("Before");

      const backupResponse = await app.inject({
        method: "GET",
        url: "/api/admin/system/backup",
        headers: { cookie: auth.cookie }
      });
      expect(backupResponse.statusCode).toBe(200);

      await fs.writeFile(uploadPath, "after");
      app.db.prepare("UPDATE users SET display_name = ? WHERE username = 'admin'").run("After");

      const wrong = multipartRestoreBody("wrong-password", backupResponse.rawPayload);
      const wrongResponse = await app.inject({
        method: "POST",
        url: "/api/admin/system/restore",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken, "content-type": wrong.contentType },
        payload: wrong.body
      });
      expect(wrongResponse.statusCode).toBe(400);
      expect(wrongResponse.json()).toEqual({ message: "Current password is incorrect" });

      const restore = multipartRestoreBody("secret1234567", backupResponse.rawPayload);
      const restoreResponse = await app.inject({
        method: "POST",
        url: "/api/admin/system/restore",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken, "content-type": restore.contentType },
        payload: restore.body
      });
      expect(restoreResponse.statusCode).toBe(200);
      expect(restoreResponse.json()).toEqual(expect.objectContaining({ ok: true, preRestoreBackupId: expect.any(Number) }));

      expect(app.db.prepare("SELECT display_name FROM users WHERE username = 'admin'").get()).toEqual({
        display_name: "Before"
      });
      await expect(fs.readFile(uploadPath, "utf8")).resolves.toBe("before");
    } finally {
      await app.close();
    }
  });
});
