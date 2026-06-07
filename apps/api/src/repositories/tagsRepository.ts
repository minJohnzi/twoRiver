import type { Tag } from "@tworiver/shared";
import type { BlogDatabase } from "../db/connection.js";
import { normalizeSlug } from "../services/slugService.js";

interface TagRow {
  id: number;
  slug: string;
  name: string;
}

function mapTag(row: TagRow): Tag {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name
  };
}

export function listTags(db: BlogDatabase): Tag[] {
  const rows = db.prepare("SELECT id, slug, name FROM tags ORDER BY slug ASC").all() as TagRow[];
  return rows.map(mapTag);
}

export function ensureTags(db: BlogDatabase, tagSlugs: string[]): Tag[] {
  const normalizedSlugs = Array.from(
    new Set(
      tagSlugs
        .map((slug) => normalizeSlug(slug))
        .filter((slug) => slug.length > 0)
    )
  );

  if (normalizedSlugs.length === 0) {
    return [];
  }

  const now = new Date().toISOString();
  const upsert = db.prepare(`
    INSERT INTO tags (slug, name, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET updated_at = excluded.updated_at
  `);
  const getBySlug = db.prepare("SELECT id, slug, name FROM tags WHERE slug = ?");

  return normalizedSlugs.map((slug) => {
    upsert.run(slug, slug, now);
    return mapTag(getBySlug.get(slug) as TagRow);
  });
}
