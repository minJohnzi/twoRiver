import type { BlogDatabase } from "../db/connection.js";

interface CountRow {
  count: number;
}

function countExactReferences(db: BlogDatabase, table: string, column: string, url: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`).get(url) as CountRow;
  return row.count;
}

function countContainedReferences(db: BlogDatabase, table: string, column: string, url: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} LIKE ? ESCAPE '\\'`).get(
    `%${escapeLike(url)}%`
  ) as CountRow;
  return row.count;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function countResourceReferences(db: BlogDatabase, url: string): number {
  return (
    countContainedReferences(db, "post_translations", "content_markdown", url) +
    countExactReferences(db, "posts", "cover_url", url) +
    countExactReferences(db, "users", "avatar_url", url) +
    countExactReferences(db, "about_profile", "avatar_url", url) +
    countContainedReferences(db, "page_translations", "content_markdown", url) +
    countExactReferences(db, "projects", "cover_url", url) +
    countContainedReferences(db, "project_translations", "description", url) +
    countExactReferences(db, "site_settings", "logo_url", url) +
    countExactReferences(db, "site_settings", "favicon_url", url)
  );
}
