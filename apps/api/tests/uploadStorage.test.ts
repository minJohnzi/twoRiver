import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { MultipartFile } from "@fastify/multipart";
import type { AppConfig } from "../src/config.js";
import { openDatabase } from "../src/db/connection.js";
import { migrate } from "../src/db/migrate.js";
import { createPost, getPostIdByUid } from "../src/repositories/postsRepository.js";
import {
  ImageUploadValidationError,
  MAX_IMAGE_BYTES,
  storePostImage
} from "../src/services/uploads/imageUploadService.js";
import {
  getPostImageDirectory,
  getPostImagePublicUrl,
  getUploadsRoot,
  isValidPostUid
} from "../src/services/uploads/uploadPaths.js";

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

async function makeTempConfig(): Promise<AppConfig> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "tworiver-uploads-"));
  tempDirectories.push(directory);
  return makeConfig(path.join(directory, "data", "blog.sqlite"));
}

function makeMultipartFile(input: { filename: string; mimetype: string; buffer: Buffer }) {
  return {
    filename: input.filename,
    mimetype: input.mimetype,
    toBuffer: async () => input.buffer
  } as MultipartFile;
}

const imageFixtures = {
  jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]),
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
  gif87a: Buffer.from("GIF87a image bytes"),
  gif89a: Buffer.from("GIF89a image bytes"),
  webp: Buffer.from("RIFF\x00\x00\x00\x00WEBPimage bytes", "binary")
};

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("upload path helpers", () => {
  test("derives upload paths and public URLs from the database directory", async () => {
    const config = await makeTempConfig();
    const uid = "p_12345678-1234-1234-1234-123456789abc";

    expect(getUploadsRoot(config)).toBe(path.join(path.dirname(config.DATABASE_PATH), "uploads"));
    expect(getPostImageDirectory(config, uid)).toBe(
      path.join(path.dirname(config.DATABASE_PATH), "uploads", "images", "posts", uid)
    );
    expect(getPostImagePublicUrl(uid, "photo.jpg")).toBe("/uploads/images/posts/p_12345678-1234-1234-1234-123456789abc/photo.jpg");
  });

  test("validates stable post uid format", () => {
    expect(isValidPostUid("p_12345678-1234-1234-1234-123456789abc")).toBe(true);
    expect(isValidPostUid("12345678-1234-1234-1234-123456789abc")).toBe(false);
    expect(isValidPostUid("p_not-a-uuid")).toBe(false);
    expect(isValidPostUid("p_12345678-1234-1234-1234-123456789ABC")).toBe(false);
  });
});

describe("post image storage", () => {
  test("stores supported image bytes using a uuid filename and returns markdown", async () => {
    const config = await makeTempConfig();
    const postUid = "p_12345678-1234-1234-1234-123456789abc";
    vi.spyOn(crypto, "randomUUID").mockReturnValue("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");

    const stored = await storePostImage(
      config,
      postUid,
      makeMultipartFile({
        filename: "original.jpeg",
        mimetype: "image/jpeg",
        buffer: imageFixtures.jpeg
      })
    );

    const filename = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg";
    const url = `/uploads/images/posts/${postUid}/${filename}`;
    await expect(fs.readFile(path.join(getPostImageDirectory(config, postUid), filename))).resolves.toEqual(
      imageFixtures.jpeg
    );
    expect(stored).toEqual({
      url,
      markdown: `![图片](${url})`
    });
  });

  test("stores all allowed image formats when bytes match the declared type", async () => {
    const config = await makeTempConfig();
    const postUid = "p_12345678-1234-1234-1234-123456789abc";

    await expect(
      storePostImage(
        config,
        postUid,
        makeMultipartFile({ filename: "photo.jpg", mimetype: "image/jpeg", buffer: imageFixtures.jpeg })
      )
    ).resolves.toMatchObject({ url: expect.stringMatching(/\.jpg$/) });
    await expect(
      storePostImage(
        config,
        postUid,
        makeMultipartFile({ filename: "photo.png", mimetype: "image/png", buffer: imageFixtures.png })
      )
    ).resolves.toMatchObject({ url: expect.stringMatching(/\.png$/) });
    await expect(
      storePostImage(
        config,
        postUid,
        makeMultipartFile({ filename: "photo.gif", mimetype: "image/gif", buffer: imageFixtures.gif87a })
      )
    ).resolves.toMatchObject({ url: expect.stringMatching(/\.gif$/) });
    await expect(
      storePostImage(
        config,
        postUid,
        makeMultipartFile({ filename: "animated.gif", mimetype: "image/gif", buffer: imageFixtures.gif89a })
      )
    ).resolves.toMatchObject({ url: expect.stringMatching(/\.gif$/) });
    await expect(
      storePostImage(
        config,
        postUid,
        makeMultipartFile({ filename: "photo.webp", mimetype: "image/webp", buffer: imageFixtures.webp })
      )
    ).resolves.toMatchObject({ url: expect.stringMatching(/\.webp$/) });
  });

  test("rejects forged image uploads when bytes do not match the declared type", async () => {
    const config = await makeTempConfig();
    const postUid = "p_12345678-1234-1234-1234-123456789abc";

    await expect(
      storePostImage(
        config,
        postUid,
        makeMultipartFile({
          filename: "attack.png",
          mimetype: "image/png",
          buffer: Buffer.from("<script>alert('xss')</script>")
        })
      )
    ).rejects.toBeInstanceOf(ImageUploadValidationError);
  });

  test("rejects unsupported images and extension mismatches", async () => {
    const config = await makeTempConfig();
    const postUid = "p_12345678-1234-1234-1234-123456789abc";

    await expect(
      storePostImage(
        config,
        postUid,
        makeMultipartFile({ filename: "icon.svg", mimetype: "image/svg+xml", buffer: Buffer.from("<svg />") })
      )
    ).rejects.toBeInstanceOf(ImageUploadValidationError);

    await expect(
      storePostImage(
        config,
        postUid,
        makeMultipartFile({ filename: "photo.png", mimetype: "image/jpeg", buffer: imageFixtures.jpeg })
      )
    ).rejects.toBeInstanceOf(ImageUploadValidationError);
  });

  test("rejects invalid post uids and oversized images", async () => {
    const config = await makeTempConfig();
    const image = makeMultipartFile({ filename: "photo.png", mimetype: "image/png", buffer: imageFixtures.png });

    await expect(storePostImage(config, "not-a-post-uid", image)).rejects.toBeInstanceOf(ImageUploadValidationError);
    await expect(
      storePostImage(
        config,
        "p_12345678-1234-1234-1234-123456789abc",
        makeMultipartFile({
          filename: "large.png",
          mimetype: "image/png",
          buffer: Buffer.alloc(MAX_IMAGE_BYTES + 1)
        })
      )
    ).rejects.toBeInstanceOf(ImageUploadValidationError);
  });

  test("uses exclusive file creation to avoid overwriting existing uploads", async () => {
    const config = await makeTempConfig();
    const postUid = "p_12345678-1234-1234-1234-123456789abc";
    vi.spyOn(crypto, "randomUUID").mockReturnValue("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");

    await storePostImage(
      config,
      postUid,
      makeMultipartFile({ filename: "first.png", mimetype: "image/png", buffer: imageFixtures.png })
    );

    await expect(
      storePostImage(
        config,
        postUid,
        makeMultipartFile({ filename: "second.png", mimetype: "image/png", buffer: imageFixtures.png })
      )
    ).rejects.toMatchObject({ code: "EEXIST" });
  });
});

describe("post uid lookup", () => {
  test("returns the numeric post id for a stable uid", async () => {
    const config = await makeTempConfig();
    await fs.mkdir(path.dirname(config.DATABASE_PATH), { recursive: true });
    migrate(config.DATABASE_PATH);
    const db = openDatabase(config.DATABASE_PATH);

    try {
      const post = createPost(db, {
        slug: "lookup-post",
        status: "draft",
        publishedAt: null,
        tagSlugs: [],
        translations: [{ locale: "en", title: "Lookup", summary: "", contentMarkdown: "" }]
      });

      expect(getPostIdByUid(db, post.uid)).toBe(post.id);
      expect(getPostIdByUid(db, "p_00000000-0000-0000-0000-000000000000")).toBeUndefined();
    } finally {
      db.close();
    }
  });
});
