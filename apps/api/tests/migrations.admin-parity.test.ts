import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { openDatabase } from "../src/db/connection.js";
import { migrate } from "../src/db/migrate.js";

const temporaryDirectories: string[] = [];

function createDatabasePath(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tworiver-admin-parity-migration-"));
  temporaryDirectories.push(directory);
  return path.join(directory, "blog.sqlite");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("admin parity migration", () => {
  test("preserves legacy content, converts hidden posts, creates the v2 schema, and stays idempotent", () => {
    const databasePath = createDatabasePath();
    const legacyDb = openDatabase(databasePath);
    legacyDb.exec(`
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT NOT NULL UNIQUE,
        slug TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'hidden')),
        category_id INTEGER,
        published_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE post_translations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
        title TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        content_markdown TEXT NOT NULL DEFAULT '',
        seo_title TEXT,
        seo_description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (post_id, locale),
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      );
    `);
    legacyDb
      .prepare(
        `INSERT INTO posts (uid, slug, status, category_id, published_at, created_at, updated_at)
         VALUES (?, ?, 'hidden', NULL, ?, ?, ?)`
      )
      .run(
        "p_00000000-0000-4000-8000-000000000001",
        "legacy-hidden",
        "2026-01-02T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z",
        "2026-01-03T00:00:00.000Z"
      );
    const postId = Number(legacyDb.prepare("SELECT id FROM posts WHERE slug = ?").pluck().get("legacy-hidden"));
    legacyDb
      .prepare(
        `INSERT INTO post_translations (
          post_id, locale, title, summary, content_markdown, seo_title, seo_description, created_at, updated_at
        ) VALUES (?, 'zh', '旧文章', '旧摘要', '# 旧正文', NULL, NULL, ?, ?)`
      )
      .run(postId, "2026-01-01T00:00:00.000Z", "2026-01-03T00:00:00.000Z");
    legacyDb.close();

    migrate(databasePath);
    migrate(databasePath);

    const db = openDatabase(databasePath);
    try {
      expect(
        db
          .prepare(
            `SELECT status, is_pinned, is_featured, cover_url, deleted_at
             FROM posts
             WHERE slug = ?`
          )
          .get("legacy-hidden")
      ).toEqual({
        status: "archived",
        is_pinned: 0,
        is_featured: 0,
        cover_url: "",
        deleted_at: null
      });
      expect(db.prepare("SELECT title, content_markdown FROM post_translations WHERE post_id = ?").get(postId)).toEqual({
        title: "旧文章",
        content_markdown: "# 旧正文"
      });

      const tables = new Set(
        (
          db
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
            .all() as Array<{ name: string }>
        ).map((row) => row.name)
      );
      for (const table of [
        "schema_migrations",
        "category_translations",
        "pages",
        "page_translations",
        "projects",
        "project_translations",
        "navigation_items",
        "navigation_translations",
        "site_settings",
        "site_setting_translations",
        "site_social_links",
        "resources",
        "analytics_events",
        "analytics_daily",
        "analytics_daily_visitors",
        "analytics_content_daily",
        "analytics_referrer_daily",
        "analytics_device_daily",
        "audit_events",
        "backup_records"
      ]) {
        expect(tables, `${table} should exist`).toContain(table);
      }

      expect(db.prepare("SELECT version FROM schema_migrations ORDER BY version").pluck().all()).toEqual([1, 2]);
      expect(db.pragma("foreign_key_check")).toEqual([]);
    } finally {
      db.close();
    }
  });
});
