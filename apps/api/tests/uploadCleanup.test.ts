import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { AppConfig } from "../src/config.js";
import { openDatabase, type BlogDatabase } from "../src/db/connection.js";
import { migrate } from "../src/db/migrate.js";
import { createPost } from "../src/repositories/postsRepository.js";
import { updateAboutProfile } from "../src/repositories/aboutRepository.js";
import { cleanupOrphanUploads } from "../src/services/uploads/orphanCleanupService.js";
import {
  getAboutAvatarDirectory,
  getAboutAvatarPublicUrl,
  getPostImageDirectory,
  getPostImagePublicUrl
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

async function createTestDatabase(): Promise<{ config: AppConfig; db: BlogDatabase }> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "tworiver-upload-cleanup-"));
  tempDirectories.push(directory);
  const databasePath = path.join(directory, "data", "blog.sqlite");
  const config = makeConfig(databasePath);
  await fs.mkdir(path.dirname(databasePath), { recursive: true });
  migrate(databasePath);

  return { config, db: openDatabase(databasePath) };
}

async function writeUploadFile(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, "image bytes");
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("upload orphan cleanup", () => {
  test("retains uploads referenced by post Markdown and about avatar URL", async () => {
    const { config, db } = await createTestDatabase();

    try {
      const post = createPost(db, {
        slug: "cleanup-post",
        status: "draft",
        publishedAt: null,
        tagSlugs: [],
        translations: [
          {
            locale: "en",
            title: "Cleanup",
            summary: "",
            contentMarkdown: `![diagram](${getPostImagePublicUrl("p_12345678-1234-1234-1234-123456789abc", "used.png")})`
          }
        ]
      });
      const postFile = path.join(getPostImageDirectory(config, "p_12345678-1234-1234-1234-123456789abc"), "used.png");
      const avatarFile = path.join(getAboutAvatarDirectory(config), "avatar.png");
      await writeUploadFile(postFile);
      await writeUploadFile(avatarFile);
      updateAboutProfile(db, {
        displayName: "TwoRiver",
        headline: "",
        bio: "",
        avatarUrl: getAboutAvatarPublicUrl("avatar.png"),
        githubUrl: "",
        email: "",
        socialLinks: []
      });

      const result = await cleanupOrphanUploads(config, db, { dryRun: true });

      expect(post.uid).toEqual(expect.stringMatching(/^p_/));
      expect(result.retained).toEqual([
        "/uploads/images/about/avatar.png",
        "/uploads/images/posts/p_12345678-1234-1234-1234-123456789abc/used.png"
      ]);
      expect(result.removed).toEqual([]);
      await expect(fs.access(postFile)).resolves.toBeUndefined();
      await expect(fs.access(avatarFile)).resolves.toBeUndefined();
    } finally {
      db.close();
    }
  });

  test("reports unreferenced uploads in dry-run mode without deleting them", async () => {
    const { config, db } = await createTestDatabase();

    try {
      const orphanPostFile = path.join(getPostImageDirectory(config, "p_12345678-1234-1234-1234-123456789abc"), "orphan.png");
      const orphanAvatarFile = path.join(getAboutAvatarDirectory(config), "old-avatar.png");
      await writeUploadFile(orphanPostFile);
      await writeUploadFile(orphanAvatarFile);

      const result = await cleanupOrphanUploads(config, db, { dryRun: true });

      expect(result.retained).toEqual([]);
      expect(result.removed).toEqual([
        "/uploads/images/about/old-avatar.png",
        "/uploads/images/posts/p_12345678-1234-1234-1234-123456789abc/orphan.png"
      ]);
      await expect(fs.access(orphanPostFile)).resolves.toBeUndefined();
      await expect(fs.access(orphanAvatarFile)).resolves.toBeUndefined();
    } finally {
      db.close();
    }
  });

  test("deletes unreferenced uploads when dry-run is false", async () => {
    const { config, db } = await createTestDatabase();

    try {
      const retainedFile = path.join(getAboutAvatarDirectory(config), "current.png");
      const removedFile = path.join(getAboutAvatarDirectory(config), "previous.png");
      await writeUploadFile(retainedFile);
      await writeUploadFile(removedFile);
      updateAboutProfile(db, {
        displayName: "TwoRiver",
        headline: "",
        bio: "",
        avatarUrl: getAboutAvatarPublicUrl("current.png"),
        githubUrl: "",
        email: "",
        socialLinks: []
      });

      const result = await cleanupOrphanUploads(config, db, { dryRun: false });

      expect(result).toEqual({
        retained: ["/uploads/images/about/current.png"],
        removed: ["/uploads/images/about/previous.png"]
      });
      await expect(fs.access(retainedFile)).resolves.toBeUndefined();
      await expect(fs.access(removedFile)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      db.close();
    }
  });

  test("removes empty upload subdirectories after deleting orphan files", async () => {
    const { config, db } = await createTestDatabase();

    try {
      const postDirectory = getPostImageDirectory(config, "p_12345678-1234-1234-1234-123456789abc");
      const orphanFile = path.join(postDirectory, "orphan.png");
      await writeUploadFile(orphanFile);

      const result = await cleanupOrphanUploads(config, db, { dryRun: false });

      expect(result).toEqual({
        retained: [],
        removed: ["/uploads/images/posts/p_12345678-1234-1234-1234-123456789abc/orphan.png"]
      });
      await expect(fs.access(orphanFile)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(fs.access(postDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      db.close();
    }
  });

  test("does not retain files from upload URLs that escape the uploads root", async () => {
    const { config, db } = await createTestDatabase();

    try {
      createPost(db, {
        slug: "escape-post",
        status: "draft",
        publishedAt: null,
        tagSlugs: [],
        translations: [
          {
            locale: "en",
            title: "Escape",
            summary: "",
            contentMarkdown: "![escape](/uploads/../images/about/orphan.png)"
          }
        ]
      });
      const orphanFile = path.join(getAboutAvatarDirectory(config), "orphan.png");
      await writeUploadFile(orphanFile);

      const result = await cleanupOrphanUploads(config, db, { dryRun: true });

      expect(result.retained).toEqual([]);
      expect(result.removed).toEqual(["/uploads/images/about/orphan.png"]);
      await expect(fs.access(orphanFile)).resolves.toBeUndefined();
    } finally {
      db.close();
    }
  });
});
