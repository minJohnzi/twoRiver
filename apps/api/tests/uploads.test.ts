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
import { MAX_IMAGE_BYTES } from "../src/services/uploads/imageUploadService.js";
import { getPostImageDirectory, getUploadsRoot } from "../src/services/uploads/uploadPaths.js";

const tempDirectories: string[] = [];
const appConfigs = new WeakMap<FastifyInstance, AppConfig>();

const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

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
  const directory = fsSync.mkdtempSync(path.join(os.tmpdir(), "tworiver-upload-api-"));
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
  appConfigs.set(app, config);
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

async function createPost(app: FastifyInstance, auth: { cookie: string; csrfToken: string }) {
  const response = await app.inject({
    method: "POST",
    url: "/api/admin/posts",
    headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
    payload: {
      slug: `upload-post-${Date.now()}`,
      status: "draft",
      publishedAt: null,
      tagSlugs: [],
      translations: [{ locale: "en", title: "Upload post", summary: "", contentMarkdown: "" }]
    }
  });

  expect(response.statusCode).toBe(201);
  return response.json().post as { id: number; uid: string };
}

function multipartBody(input: {
  postUid?: string;
  fields?: Record<string, string>;
  file?: { fieldname?: string; filename: string; contentType: string; bytes: Buffer };
  fileFirst?: boolean;
}) {
  const boundary = `----tworiver-${Date.now()}`;
  const chunks: Buffer[] = [];
  const push = (value: string | Buffer) => chunks.push(typeof value === "string" ? Buffer.from(value) : value);

  const pushPostUid = () => {
    if (input.postUid === undefined) {
      return;
    }
    push(`--${boundary}\r\n`);
    push('Content-Disposition: form-data; name="postUid"\r\n\r\n');
    push(`${input.postUid}\r\n`);
  };

  const pushFields = () => {
    for (const [name, value] of Object.entries(input.fields ?? {})) {
      push(`--${boundary}\r\n`);
      push(`Content-Disposition: form-data; name="${name}"\r\n\r\n`);
      push(`${value}\r\n`);
    }
  };

  const pushFile = () => {
    if (!input.file) {
      return;
    }
    push(`--${boundary}\r\n`);
    push(
      `Content-Disposition: form-data; name="${input.file.fieldname ?? "file"}"; filename="${input.file.filename}"\r\n`
    );
    push(`Content-Type: ${input.file.contentType}\r\n\r\n`);
    push(input.file.bytes);
    push("\r\n");
  };

  if (input.fileFirst) {
    pushFile();
    pushPostUid();
    pushFields();
  } else {
    pushPostUid();
    pushFields();
    pushFile();
  }

  push(`--${boundary}--\r\n`);

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

async function uploadImage(
  app: FastifyInstance,
  auth: { cookie: string; csrfToken: string },
  input: { postUid?: string; filename?: string; contentType?: string; bytes?: Buffer; fileFirst?: boolean } = {}
) {
  const multipartInput: Parameters<typeof multipartBody>[0] = {
    file: {
      filename: input.filename ?? "image.png",
      contentType: input.contentType ?? "image/png",
      bytes: input.bytes ?? pngBytes
    }
  };
  if (input.postUid !== undefined) {
    multipartInput.postUid = input.postUid;
  }
  if (input.fileFirst !== undefined) {
    multipartInput.fileFirst = input.fileFirst;
  }
  const multipart = multipartBody(multipartInput);

  return app.inject({
    method: "POST",
    url: "/api/admin/uploads/images",
    headers: {
      cookie: auth.cookie,
      "x-csrf-token": auth.csrfToken,
      "content-type": multipart.contentType
    },
    payload: multipart.body
  });
}

async function uploadAboutAvatar(
  app: FastifyInstance,
  auth: { cookie: string; csrfToken: string },
  input: { filename?: string; contentType?: string; bytes?: Buffer } = {}
) {
  const multipart = multipartBody({
    file: {
      filename: input.filename ?? "avatar.png",
      contentType: input.contentType ?? "image/png",
      bytes: input.bytes ?? pngBytes
    }
  });

  return app.inject({
    method: "POST",
    url: "/api/admin/uploads/about-avatar",
    headers: {
      cookie: auth.cookie,
      "x-csrf-token": auth.csrfToken,
      "content-type": multipart.contentType
    },
    payload: multipart.body
  });
}

async function uploadResource(
  app: FastifyInstance,
  auth: { cookie: string; csrfToken: string },
  input: { folder?: string; filename?: string; contentType?: string; bytes?: Buffer; fileFirst?: boolean } = {}
) {
  const multipartInput: Parameters<typeof multipartBody>[0] = {
    file: {
      filename: input.filename ?? "asset.png",
      contentType: input.contentType ?? "image/png",
      bytes: input.bytes ?? pngBytes
    }
  };
  if (input.folder !== undefined) {
    multipartInput.fields = { folder: input.folder };
  }
  if (input.fileFirst !== undefined) {
    multipartInput.fileFirst = input.fileFirst;
  }
  const multipart = multipartBody(multipartInput);

  return app.inject({
    method: "POST",
    url: "/api/admin/resources",
    headers: {
      cookie: auth.cookie,
      "x-csrf-token": auth.csrfToken,
      "content-type": multipart.contentType
    },
    payload: multipart.body
  });
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("admin image uploads", () => {
  test("uploads a supported image for an existing post uid and serves it", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const post = await createPost(app, auth);
      const response = await uploadImage(app, auth, { postUid: post.uid });

      expect(response.statusCode).toBe(201);
      const body = response.json() as { url: string; markdown: string };
      expect(body.url).toMatch(new RegExp(`^/uploads/images/posts/${post.uid}/[0-9a-f-]{36}\\.png$`));
      expect(body.markdown).toContain(body.url);

      const fileResponse = await app.inject({ method: "GET", url: body.url });
      expect(fileResponse.statusCode).toBe(200);
      expect(fileResponse.headers["content-type"]).toContain("image/png");
      expect(fileResponse.rawPayload).toEqual(pngBytes);
    } finally {
      await app.close();
    }
  });

  test("uploads a supported image when the file part arrives before post uid", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const post = await createPost(app, auth);
      const response = await uploadImage(app, auth, { postUid: post.uid, fileFirst: true });

      expect(response.statusCode).toBe(201);
      const body = response.json() as { url: string; markdown: string };
      expect(body.url).toMatch(new RegExp(`^/uploads/images/posts/${post.uid}/[0-9a-f-]{36}\\.png$`));
      expect(body.markdown).toContain(body.url);

      const fileResponse = await app.inject({ method: "GET", url: body.url });
      expect(fileResponse.statusCode).toBe(200);
      expect(fileResponse.headers["content-type"]).toContain("image/png");
      expect(fileResponse.rawPayload).toEqual(pngBytes);
    } finally {
      await app.close();
    }
  });

  test("uploads an about avatar without requiring a post uid and serves it", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const response = await uploadAboutAvatar(app, auth);

      expect(response.statusCode).toBe(201);
      const body = response.json() as { url: string };
      expect(body.url).toMatch(/^\/uploads\/images\/about\/[0-9a-f-]{36}\.png$/);

      const fileResponse = await app.inject({ method: "GET", url: body.url });
      expect(fileResponse.statusCode).toBe(200);
      expect(fileResponse.headers["content-type"]).toContain("image/png");
      expect(fileResponse.rawPayload).toEqual(pngBytes);
    } finally {
      await app.close();
    }
  });

  test("rejects uploads for unknown post uid", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const response = await uploadImage(app, auth, { postUid: "p_00000000-0000-0000-0000-000000000000" });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ message: "Post not found" });
    } finally {
      await app.close();
    }
  });

  test("rejects unsupported svg uploads", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const post = await createPost(app, auth);
      const response = await uploadImage(app, auth, {
        postUid: post.uid,
        filename: "icon.svg",
        contentType: "image/svg+xml",
        bytes: Buffer.from("<svg />")
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: "Unsupported image type" });
    } finally {
      await app.close();
    }
  });

  test("rejects oversized image uploads", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const post = await createPost(app, auth);
      const response = await uploadImage(app, auth, {
        postUid: post.uid,
        bytes: Buffer.concat([pngBytes, Buffer.alloc(MAX_IMAGE_BYTES)])
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: "Image is too large" });
    } finally {
      await app.close();
    }
  });

  test("rejects unauthenticated uploads and authenticated uploads without CSRF", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const post = await createPost(app, auth);
      const multipart = multipartBody({
        postUid: post.uid,
        file: { filename: "image.png", contentType: "image/png", bytes: pngBytes }
      });

      const unauthenticatedResponse = await app.inject({
        method: "POST",
        url: "/api/admin/uploads/images",
        headers: { "content-type": multipart.contentType },
        payload: multipart.body
      });
      expect(unauthenticatedResponse.statusCode).toBe(401);

      const missingCsrfResponse = await app.inject({
        method: "POST",
        url: "/api/admin/uploads/images",
        headers: { cookie: auth.cookie, "content-type": multipart.contentType },
        payload: multipart.body
      });
      expect(missingCsrfResponse.statusCode).toBe(403);
      expect(missingCsrfResponse.json()).toEqual({ message: "Invalid CSRF token" });
    } finally {
      await app.close();
    }
  });

  test("lists uploaded resources for authenticated admins", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const post = await createPost(app, auth);
      const postImageResponse = await uploadImage(app, auth, { postUid: post.uid });
      const aboutImageResponse = await uploadAboutAvatar(app, auth);
      expect(postImageResponse.statusCode).toBe(201);
      expect(aboutImageResponse.statusCode).toBe(201);
      const postImageBody = postImageResponse.json() as { url: string };
      const aboutImageBody = aboutImageResponse.json() as { url: string };

      const response = await app.inject({
        method: "GET",
        url: "/api/admin/resources",
        headers: { cookie: auth.cookie }
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        resources: Array<{
          kind: string;
          url: string;
          relativePath: string;
          filename: string;
          directory: string;
          sizeBytes: number;
          contentType: string;
          postUid: string | null;
        }>;
      };
      expect(body.resources).toHaveLength(2);
      expect(body.resources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "post-image",
            url: postImageBody.url,
            directory: `images/posts/${post.uid}`,
            sizeBytes: pngBytes.length,
            contentType: "image/png",
            postUid: post.uid
          }),
          expect.objectContaining({
            kind: "about-image",
            url: aboutImageBody.url,
            directory: "images/about",
            sizeBytes: pngBytes.length,
            contentType: "image/png",
            postUid: null
          })
        ])
      );
      for (const resource of body.resources) {
        expect(resource.filename).toMatch(/^[0-9a-f-]{36}\.png$/);
        expect(resource.relativePath).toContain(resource.filename);
      }
    } finally {
      await app.close();
    }
  });

  test("requires authentication before listing uploaded resources", async () => {
    const app = await createTestApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/admin/resources"
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ message: "Authentication required" });
    } finally {
      await app.close();
    }
  });

  test("uploads managed resources into chosen folders", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const response = await uploadResource(app, auth, { folder: "media/headers", filename: "hero.png", fileFirst: true });

      expect(response.statusCode).toBe(201);
      const body = response.json() as {
        resource: {
          kind: string;
          url: string;
          relativePath: string;
          filename: string;
          directory: string;
          folder: string;
          sizeBytes: number;
          contentType: string;
          postUid: string | null;
        };
      };
      expect(body.resource).toEqual(
        expect.objectContaining({
          kind: "asset",
          directory: "resources/media/headers",
          folder: "media/headers",
          sizeBytes: pngBytes.length,
          contentType: "image/png",
          postUid: null
        })
      );
      expect(body.resource.url).toMatch(/^\/uploads\/resources\/media\/headers\/[0-9a-f-]{36}-hero\.png$/);
      expect(body.resource.relativePath).toBe(`resources/media/headers/${body.resource.filename}`);

      const fileResponse = await app.inject({ method: "GET", url: body.resource.url });
      expect(fileResponse.statusCode).toBe(200);
      expect(fileResponse.headers["content-type"]).toContain("image/png");
      expect(fileResponse.rawPayload).toEqual(pngBytes);

      const listResponse = await app.inject({
        method: "GET",
        url: "/api/admin/resources",
        headers: { cookie: auth.cookie }
      });
      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json().resources).toEqual([expect.objectContaining({ url: body.resource.url })]);
    } finally {
      await app.close();
    }
  });

  test("moves uploaded resources between folders", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const uploadResponse = await uploadResource(app, auth, { folder: "drafts", filename: "cover.png" });
      expect(uploadResponse.statusCode).toBe(201);
      const uploadBody = uploadResponse.json() as { resource: { url: string } };

      const missingCsrfResponse = await app.inject({
        method: "PUT",
        url: "/api/admin/resources",
        headers: { cookie: auth.cookie },
        payload: { url: uploadBody.resource.url, folder: "published/covers" }
      });
      expect(missingCsrfResponse.statusCode).toBe(403);

      const moveResponse = await app.inject({
        method: "PUT",
        url: "/api/admin/resources",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { url: uploadBody.resource.url, folder: "published/covers" }
      });

      expect(moveResponse.statusCode).toBe(200);
      const moveBody = moveResponse.json() as {
        resource: { url: string; directory: string; folder: string; filename: string };
      };
      expect(moveBody.resource).toEqual(
        expect.objectContaining({
          directory: "resources/published/covers",
          folder: "published/covers"
        })
      );
      expect(moveBody.resource.url).toMatch(/^\/uploads\/resources\/published\/covers\/[0-9a-f-]{36}-cover\.png$/);

      const oldFileResponse = await app.inject({ method: "GET", url: uploadBody.resource.url });
      expect(oldFileResponse.statusCode).toBe(404);
      const newFileResponse = await app.inject({ method: "GET", url: moveBody.resource.url });
      expect(newFileResponse.statusCode).toBe(200);
      expect(newFileResponse.rawPayload).toEqual(pngBytes);
    } finally {
      await app.close();
    }
  });

  test("rejects managed resource folders that escape the upload root", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const response = await uploadResource(app, auth, { folder: "../escape" });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: "Invalid resource folder" });
    } finally {
      await app.close();
    }
  });

  test("deletes uploaded resources for authenticated admins", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const uploadResponse = await uploadAboutAvatar(app, auth);
      expect(uploadResponse.statusCode).toBe(201);
      const uploadBody = uploadResponse.json() as { url: string };
      const config = appConfigs.get(app);
      if (!config) {
        throw new Error("Expected app config");
      }
      const filePath = path.join(getUploadsRoot(config), ...uploadBody.url.slice("/uploads/".length).split("/"));

      await expect(fs.access(filePath)).resolves.toBeUndefined();

      const missingCsrfResponse = await app.inject({
        method: "DELETE",
        url: "/api/admin/resources",
        headers: { cookie: auth.cookie },
        payload: { url: uploadBody.url }
      });
      expect(missingCsrfResponse.statusCode).toBe(403);

      const deleteResponse = await app.inject({
        method: "DELETE",
        url: "/api/admin/resources",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { url: uploadBody.url }
      });

      expect(deleteResponse.statusCode).toBe(200);
      expect(deleteResponse.json()).toEqual({ ok: true });
      await expect(fs.access(filePath)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await app.close();
    }
  });

  test("rejects resource deletion paths outside the upload root", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const response = await app.inject({
        method: "DELETE",
        url: "/api/admin/resources",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken },
        payload: { url: "/uploads/../blog.sqlite" }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: "Invalid upload resource path" });
    } finally {
      await app.close();
    }
  });

  test("deleting a post removes its image directory best effort", async () => {
    const app = await createTestApp();

    try {
      const auth = await loginWithCsrf(app);
      const post = await createPost(app, auth);
      const uploadResponse = await uploadImage(app, auth, { postUid: post.uid });
      expect(uploadResponse.statusCode).toBe(201);

      const config = appConfigs.get(app);
      if (!config) {
        throw new Error("Expected test app config to be registered.");
      }
      const postImageDirectory = getPostImageDirectory(config, post.uid);
      const directoryStat = await fs.stat(postImageDirectory);
      expect(directoryStat.isDirectory()).toBe(true);

      const deleteResponse = await app.inject({
        method: "DELETE",
        url: `/api/admin/posts/${post.id}`,
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrfToken }
      });

      expect(deleteResponse.statusCode).toBe(200);
      expect(deleteResponse.json()).toEqual({ ok: true });
      await expect(fs.stat(postImageDirectory)).rejects.toMatchObject({ code: "ENOENT" });
      expect((await fs.stat(getUploadsRoot(config))).isDirectory()).toBe(true);
    } finally {
      await app.close();
    }
  });
});
