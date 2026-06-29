import type { CreateTagInput, Tag, UpdateTagInput } from "@tworiver/shared";
import type { BlogDatabase } from "../db/connection.js";
import { normalizeSlug } from "../services/slugService.js";

export interface TagRecord extends Tag {
  postCount: number;
}

interface TagRow {
  id: number;
  slug: string;
  name: string;
  post_count: number;
}

export class TagConflictError extends Error {
  constructor() {
    super("Tag already exists");
    this.name = "TagConflictError";
  }
}

export class TagReferencedError extends Error {
  constructor() {
    super("Tag is referenced by posts");
    this.name = "TagReferencedError";
  }
}

const TAG_SELECT = `
  SELECT
    t.id,
    t.slug,
    t.name,
    COUNT(DISTINCT CASE WHEN p.deleted_at IS NULL THEN p.id END) AS post_count
  FROM tags t
  LEFT JOIN post_tags pt ON pt.tag_id = t.id
  LEFT JOIN posts p ON p.id = pt.post_id
`;

function mapTag(row: TagRow): TagRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    postCount: row.post_count
  };
}

export function listTags(db: BlogDatabase): TagRecord[] {
  const rows = db.prepare(`${TAG_SELECT} GROUP BY t.id ORDER BY t.name ASC, t.id ASC`).all() as TagRow[];
  return rows.map(mapTag);
}

export function getTagBySlug(db: BlogDatabase, slug: string): TagRecord | undefined {
  const row = db.prepare(`${TAG_SELECT} WHERE t.slug = ? GROUP BY t.id`).get(slug) as TagRow | undefined;
  return row ? mapTag(row) : undefined;
}

export function getTagById(db: BlogDatabase, id: number): TagRecord | undefined {
  const row = db.prepare(`${TAG_SELECT} WHERE t.id = ? GROUP BY t.id`).get(id) as TagRow | undefined;
  return row ? mapTag(row) : undefined;
}

export function createTag(db: BlogDatabase, input: CreateTagInput): TagRecord {
  const slug = normalizeSlug(input.slug);
  if (!slug) {
    throw new Error("Invalid tag slug");
  }
  if (getTagBySlug(db, slug)) {
    throw new TagConflictError();
  }

  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO tags (slug, name, created_at, updated_at)
       VALUES (?, ?, ?, ?)`
    )
    .run(slug, input.name ?? slug, now, now);
  return getTagById(db, Number(result.lastInsertRowid)) as TagRecord;
}

export function updateTag(db: BlogDatabase, id: number, input: UpdateTagInput): TagRecord | undefined {
  const existing = getTagById(db, id);
  if (!existing) {
    return undefined;
  }

  const slug = input.slug === undefined ? existing.slug : normalizeSlug(input.slug);
  if (!slug) {
    throw new Error("Invalid tag slug");
  }
  const conflict = getTagBySlug(db, slug);
  if (conflict && conflict.id !== id) {
    throw new TagConflictError();
  }

  db.prepare("UPDATE tags SET slug = ?, name = ?, updated_at = ? WHERE id = ?").run(
    slug,
    input.name ?? existing.name,
    new Date().toISOString(),
    id
  );
  return getTagById(db, id);
}

export function deleteTag(db: BlogDatabase, id: number): boolean {
  return db.transaction(() => {
    if (!getTagById(db, id)) {
      return false;
    }
    const references = db.prepare("SELECT COUNT(*) AS count FROM post_tags WHERE tag_id = ?").get(id) as {
      count: number;
    };
    if (references.count > 0) {
      throw new TagReferencedError();
    }
    return db.prepare("DELETE FROM tags WHERE id = ?").run(id).changes > 0;
  })();
}

export function ensureTags(db: BlogDatabase, tagSlugs: string[]): TagRecord[] {
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

  return normalizedSlugs.map((slug) => {
    upsert.run(slug, tagsBySlug.get(slug), now, now);
    return getTagBySlug(db, slug) as TagRecord;
  });
}
