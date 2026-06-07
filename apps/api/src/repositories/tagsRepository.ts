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
  const rows = db.prepare("SELECT id, slug, name FROM tags ORDER BY name ASC").all() as TagRow[];
  return rows.map(mapTag);
}

export function ensureTags(db: BlogDatabase, tagSlugs: string[]): Tag[] {
  const tagsBySlug = new Map<string, string>();
  for (const tagSlug of tagSlugs) {
    const slug = normalizeSlug(tagSlug);
    if (slug) {
      tagsBySlug.set(slug, tagSlug.trim());
    }
  }
  const normalizedSlugs = Array.from(tagsBySlug.keys());

  if (normalizedSlugs.length === 0) {
    return [];
  }

  const now = new Date().toISOString();
  const upsert = db.prepare(`
    INSERT INTO tags (slug, name, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET name = excluded.name, updated_at = ?
  `);
  const getBySlug = db.prepare("SELECT id, slug, name FROM tags WHERE slug = ?");

  return normalizedSlugs.map((slug) => {
    upsert.run(slug, tagsBySlug.get(slug), now, now);
    return mapTag(getBySlug.get(slug) as TagRow);
  });
}
