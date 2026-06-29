import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";
import { openDatabase } from "./connection.js";

const modulePath = fileURLToPath(import.meta.url);
const moduleDir = path.dirname(modulePath);

function resolveSchemaPath(): string {
  const schemaPaths = [
    path.join(moduleDir, "schema.sql"),
    path.resolve(process.cwd(), "src/db/schema.sql"),
    path.resolve(process.cwd(), "apps/api/src/db/schema.sql")
  ];

  const schemaPath = schemaPaths.find((candidate) => fs.existsSync(candidate));
  if (!schemaPath) {
    throw new Error(`Unable to find schema.sql. Checked: ${schemaPaths.join(", ")}`);
  }

  return schemaPath;
}

function tableExists(db: ReturnType<typeof openDatabase>, tableName: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
  return Boolean(row);
}

function columnNames(db: ReturnType<typeof openDatabase>, tableName: string): Set<string> {
  return new Set((db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[]).map((column) => column.name));
}

function tableSql(db: ReturnType<typeof openDatabase>, tableName: string): string | undefined {
  return (
    db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName) as
      | { sql: string }
      | undefined
  )?.sql;
}

function backfillPostUids(db: ReturnType<typeof openDatabase>): void {
  if (!tableExists(db, "posts") || !columnNames(db, "posts").has("uid")) {
    return;
  }

  const postsMissingUid = db
    .prepare("SELECT id FROM posts WHERE uid IS NULL OR uid = ''")
    .all() as Array<{ id: number }>;
  const updateUid = db.prepare("UPDATE posts SET uid = ? WHERE id = ?");
  for (const post of postsMissingUid) {
    updateUid.run(`p_${crypto.randomUUID()}`, post.id);
  }
}

function enforceAdminParityPostStatus(db: ReturnType<typeof openDatabase>): void {
  const sql = tableSql(db, "posts");
  if (!sql || (sql.includes("'archived'") && !sql.includes("'hidden'"))) {
    return;
  }

  const foreignKeysEnabled = (
    db.prepare("PRAGMA foreign_keys").get() as
      | { foreign_keys: number }
      | undefined
  )?.foreign_keys === 1;

  db.exec("PRAGMA foreign_keys = OFF");
  try {
    db.exec(`
      CREATE TABLE posts_status_migration (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT NOT NULL UNIQUE,
        slug TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
        category_id INTEGER,
        published_at TEXT,
        is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
        is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1)),
        cover_url TEXT NOT NULL DEFAULT '',
        deleted_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
      );

      INSERT INTO posts_status_migration (
        id, uid, slug, status, category_id, published_at,
        is_pinned, is_featured, cover_url, deleted_at, created_at, updated_at
      )
      SELECT
        id, uid, slug, CASE WHEN status = 'hidden' THEN 'archived' ELSE status END, category_id, published_at,
        is_pinned, is_featured, cover_url, deleted_at, created_at, updated_at
      FROM posts;

      DROP TABLE posts;
      ALTER TABLE posts_status_migration RENAME TO posts;
    `);
  } finally {
    db.exec(`PRAGMA foreign_keys = ${foreignKeysEnabled ? "ON" : "OFF"}`);
  }
}

function prepareLegacyPostsTable(db: ReturnType<typeof openDatabase>): void {
  if (!tableExists(db, "posts")) {
    return;
  }

  const postColumns = columnNames(db, "posts");
  if (!postColumns.has("category_id")) {
    db.prepare("ALTER TABLE posts ADD COLUMN category_id INTEGER").run();
  }
  if (!postColumns.has("uid")) {
    db.prepare("ALTER TABLE posts ADD COLUMN uid TEXT").run();
  }
  backfillPostUids(db);
  if (!postColumns.has("is_pinned")) {
    db.prepare("ALTER TABLE posts ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1))").run();
  }
  if (!postColumns.has("is_featured")) {
    db.prepare("ALTER TABLE posts ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1))").run();
  }
  if (!postColumns.has("cover_url")) {
    db.prepare("ALTER TABLE posts ADD COLUMN cover_url TEXT NOT NULL DEFAULT ''").run();
  }
  if (!postColumns.has("deleted_at")) {
    db.prepare("ALTER TABLE posts ADD COLUMN deleted_at TEXT").run();
  }
  enforceAdminParityPostStatus(db);
}

function addColumnIfMissing(
  db: ReturnType<typeof openDatabase>,
  tableName: string,
  columnName: string,
  definition: string
): void {
  if (tableExists(db, tableName) && !columnNames(db, tableName).has(columnName)) {
    db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`).run();
  }
}

export function migrate(databasePath = loadConfig().DATABASE_PATH): void {
  const schemaPath = resolveSchemaPath();
  const schema = fs.readFileSync(schemaPath, "utf8");
  const db = openDatabase(databasePath);

  try {
    prepareLegacyPostsTable(db);
    db.exec(schema);
    addColumnIfMissing(db, "users", "display_name", "TEXT NOT NULL DEFAULT ''");
    addColumnIfMissing(db, "users", "email", "TEXT NOT NULL DEFAULT ''");
    addColumnIfMissing(db, "users", "avatar_url", "TEXT NOT NULL DEFAULT ''");
    addColumnIfMissing(db, "categories", "sort_order", "INTEGER NOT NULL DEFAULT 0");
    const sessionColumns = columnNames(db, "sessions");
    if (!sessionColumns.has("csrf_token")) {
      db.prepare("ALTER TABLE sessions ADD COLUMN csrf_token TEXT").run();
      db.prepare("DELETE FROM sessions").run();
    }
    backfillPostUids(db);
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_uid ON posts(uid)").run();
    db.prepare("UPDATE posts SET status = 'archived' WHERE status = 'hidden'").run();
    db.prepare("INSERT OR IGNORE INTO schema_migrations (version) VALUES (1)").run();
    db.prepare("INSERT OR IGNORE INTO schema_migrations (version) VALUES (2)").run();
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS posts_uid_required_insert
      BEFORE INSERT ON posts
      FOR EACH ROW
      WHEN NEW.uid IS NULL OR NEW.uid = ''
      BEGIN
        SELECT RAISE(ABORT, 'posts.uid is required');
      END;

      CREATE TRIGGER IF NOT EXISTS posts_uid_required_update
      BEFORE UPDATE OF uid ON posts
      FOR EACH ROW
      WHEN NEW.uid IS NULL OR NEW.uid = ''
      BEGIN
        SELECT RAISE(ABORT, 'posts.uid is required');
      END;
    `);
  } finally {
    db.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  migrate();
}
