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

export function migrate(databasePath = loadConfig().DATABASE_PATH): void {
  const schemaPath = resolveSchemaPath();
  const schema = fs.readFileSync(schemaPath, "utf8");
  const db = openDatabase(databasePath);

  try {
    db.exec(schema);
    const sessionColumns = db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
    if (!sessionColumns.some((column) => column.name === "csrf_token")) {
      db.prepare("ALTER TABLE sessions ADD COLUMN csrf_token TEXT").run();
      db.prepare("DELETE FROM sessions").run();
    }
    const postColumns = db.prepare("PRAGMA table_info(posts)").all() as { name: string }[];
    if (!postColumns.some((column) => column.name === "category_id")) {
      db.prepare("ALTER TABLE posts ADD COLUMN category_id INTEGER").run();
    }
    if (!postColumns.some((column) => column.name === "uid")) {
      db.prepare("ALTER TABLE posts ADD COLUMN uid TEXT").run();
    }
    const postsMissingUid = db
      .prepare("SELECT id FROM posts WHERE uid IS NULL OR uid = ''")
      .all() as Array<{ id: number }>;
    const updateUid = db.prepare("UPDATE posts SET uid = ? WHERE id = ?");
    for (const post of postsMissingUid) {
      updateUid.run(`p_${crypto.randomUUID()}`, post.id);
    }
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_uid ON posts(uid)").run();
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
