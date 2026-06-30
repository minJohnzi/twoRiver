import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { openDatabase } from "../src/db/connection.js";
import { migrate } from "../src/db/migrate.js";

const temporaryDirectories: string[] = [];

const articleContentColumns = [
  "content_format",
  "content_json",
  "content_schema_version",
  "content_text",
  "migration_source_markdown",
  "migration_source_created_at"
];

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
  test("preserves legacy content, converts hidden posts, creates the latest schema, and stays idempotent", () => {
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

      const migratedTranslation = db
        .prepare(
          `SELECT
            content_format,
            content_json,
            content_schema_version,
            content_text,
            migration_source_markdown,
            migration_source_created_at
           FROM post_translations
           WHERE post_id = ?`
        )
        .get(postId) as {
        content_format: string;
        content_json: string | null;
        content_schema_version: number | null;
        content_text: string;
        migration_source_markdown: string | null;
        migration_source_created_at: string | null;
      };
      expect(migratedTranslation).toEqual({
        content_format: "markdown",
        content_json: null,
        content_schema_version: null,
        content_text: migratedTranslation.content_text,
        migration_source_markdown: null,
        migration_source_created_at: null
      });
      expect(migratedTranslation.content_text).not.toBe("");
      expect(migratedTranslation.content_text).not.toContain("#");

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
        "tag_translations",
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

      const categoryTranslationColumns = new Set(
        (db.pragma("table_info(category_translations)") as Array<{ name: string }>).map((column) => column.name)
      );
      expect(categoryTranslationColumns).toContain("name");

      const tagTranslationColumns = new Set(
        (db.pragma("table_info(tag_translations)") as Array<{ name: string }>).map((column) => column.name)
      );
      expect(tagTranslationColumns).toEqual(new Set(["tag_id", "locale", "name"]));

      const postTranslationColumns = (db.pragma("table_info(post_translations)") as Array<{ name: string }>).map(
        (column) => column.name
      );
      expect(postTranslationColumns).toEqual(expect.arrayContaining(articleContentColumns));

      expect(db.prepare("SELECT version FROM schema_migrations ORDER BY version").pluck().all()).toEqual([
        1, 2, 3, 4, 5
      ]);
      expect(db.prepare("SELECT COUNT(*) FROM schema_migrations WHERE version = 5").pluck().get()).toBe(1);
      expect(db.pragma("foreign_key_check")).toEqual([]);
    } finally {
      db.close();
    }
  });

  test("creates fresh dual-format post translation columns and rejects invalid combinations", () => {
    const databasePath = createDatabasePath();
    migrate(databasePath);

    const db = openDatabase(databasePath);
    try {
      const columns = (db.pragma("table_info(post_translations)") as Array<{ name: string }>).map(
        (column) => column.name
      );
      expect(columns).toEqual(expect.arrayContaining(articleContentColumns));

      const now = "2026-06-30T00:00:00.000Z";
      db.prepare(
        `INSERT INTO posts (uid, slug, status, category_id, published_at, created_at, updated_at)
         VALUES (?, ?, 'draft', NULL, NULL, ?, ?)`
      ).run("p_00000000-0000-4000-8000-000000000002", "fresh-post", now, now);
      const postId = Number(db.prepare("SELECT id FROM posts WHERE slug = ?").pluck().get("fresh-post"));

      db.prepare(
        `INSERT INTO post_translations (
          post_id, locale, title, summary, content_markdown, seo_title, seo_description, created_at, updated_at
        ) VALUES (?, 'en', 'Legacy insert', '', 'Legacy body', NULL, NULL, ?, ?)`
      ).run(postId, now, now);
      expect(
        db
          .prepare(
            `SELECT content_format, content_json, content_schema_version, content_text, migration_source_markdown, migration_source_created_at
             FROM post_translations
             WHERE post_id = ? AND locale = 'en'`
          )
          .get(postId)
      ).toEqual({
        content_format: "markdown",
        content_json: null,
        content_schema_version: null,
        content_text: "",
        migration_source_markdown: null,
        migration_source_created_at: null
      });

      expect(() =>
        db
          .prepare(
            `INSERT INTO post_translations (
              post_id, locale, title, content_markdown, content_format, content_json, content_schema_version, created_at, updated_at
            ) VALUES (?, 'zh', 'Invalid TipTap', '', 'tiptap', NULL, 1, ?, ?)`
          )
          .run(postId, now, now)
      ).toThrow();

      expect(() =>
        db
          .prepare(
            `UPDATE post_translations
             SET content_json = '{"type":'
             WHERE post_id = ? AND locale = 'en'`
          )
          .run(postId)
      ).toThrow();
    } finally {
      db.close();
    }
  });

  test("adds normalized taxonomy name uniqueness as migration v3", () => {
    const databasePath = createDatabasePath();
    migrate(databasePath);

    const db = openDatabase(databasePath);
    try {
      const indexes = new Set(
        (
          db
            .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL")
            .all() as Array<{ name: string }>
        ).map((row) => row.name)
      );

      expect(indexes).toContain("idx_categories_name_normalized");
      expect(indexes).toContain("idx_tags_name_normalized");
      expect(db.prepare("SELECT version FROM schema_migrations ORDER BY version").pluck().all()).toEqual([
        1, 2, 3, 4, 5
      ]);

      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO categories (slug, name, sort_order, created_at, updated_at) VALUES (?, ?, 0, ?, ?)"
      ).run("react", "React", now, now);
      expect(() =>
        db
          .prepare("INSERT INTO categories (slug, name, sort_order, created_at, updated_at) VALUES (?, ?, 0, ?, ?)")
          .run("react-notes", " react ", now, now)
      ).toThrow();
    } finally {
      db.close();
    }
  });

  test("reports legacy taxonomy name conflicts without merging records", () => {
    const databasePath = createDatabasePath();
    const db = openDatabase(databasePath);
    const now = new Date().toISOString();
    db.exec(`
      CREATE TABLE categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    db.prepare("INSERT INTO categories (slug, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(
      "react",
      "React",
      now,
      now
    );
    db.prepare("INSERT INTO categories (slug, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(
      "react-notes",
      " react ",
      now,
      now
    );
    db.close();

    expect(() => migrate(databasePath)).toThrow(/category name conflicts.*react.*react-notes/i);

    const preservedDb = openDatabase(databasePath);
    try {
      expect(preservedDb.prepare("SELECT slug FROM categories ORDER BY id").pluck().all()).toEqual([
        "react",
        "react-notes"
      ]);
    } finally {
      preservedDb.close();
    }
  });
});
