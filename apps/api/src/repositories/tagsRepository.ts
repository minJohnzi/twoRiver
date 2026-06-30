import type { CreateTagInput, Tag, UpdateTagInput } from "@tworiver/shared";
import type { BlogDatabase } from "../db/connection.js";
import { normalizeSlug } from "../services/slugService.js";

export interface TagTranslationRecord {
  locale: "zh" | "en";
  name: string;
}

export interface TagRecord extends Tag {
  postCount: number;
  activePostCount: number;
  trashedPostCount: number;
  totalPostCount: number;
  translations: TagTranslationRecord[];
}

interface TagRow {
  id: number;
  slug: string;
  name: string;
  active_post_count: number;
  trashed_post_count: number;
  total_post_count: number;
}

interface TagTranslationRow {
  tag_id: number;
  locale: "zh" | "en";
  name: string;
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
    COUNT(DISTINCT CASE WHEN p.deleted_at IS NULL THEN p.id END) AS active_post_count,
    COUNT(DISTINCT CASE WHEN p.deleted_at IS NOT NULL THEN p.id END) AS trashed_post_count,
    COUNT(DISTINCT p.id) AS total_post_count
  FROM tags t
  LEFT JOIN post_tags pt ON pt.tag_id = t.id
  LEFT JOIN posts p ON p.id = pt.post_id
`;

function hydrateTags(db: BlogDatabase, rows: TagRow[]): TagRecord[] {
  if (rows.length === 0) {
    return [];
  }

  const ids = rows.map((row) => row.id);
  const translations = db
    .prepare(
      `SELECT tag_id, locale, name
       FROM tag_translations
       WHERE tag_id IN (${ids.map(() => "?").join(", ")})
       ORDER BY locale ASC`
    )
    .all(...ids) as TagTranslationRow[];
  const translationsByTag = new Map<number, TagTranslationRecord[]>();
  for (const translation of translations) {
    const existing = translationsByTag.get(translation.tag_id) ?? [];
    if (translation.name.trim()) {
      existing.push({ locale: translation.locale, name: translation.name });
    }
    translationsByTag.set(translation.tag_id, existing);
  }

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    postCount: row.active_post_count,
    activePostCount: row.active_post_count,
    trashedPostCount: row.trashed_post_count,
    totalPostCount: row.total_post_count,
    translations: translationsByTag.get(row.id) ?? []
  }));
}

function replaceTranslations(db: BlogDatabase, tagId: number, translations: TagTranslationRecord[]): void {
  db.prepare("DELETE FROM tag_translations WHERE tag_id = ?").run(tagId);
  const insert = db.prepare(
    `INSERT INTO tag_translations (tag_id, locale, name)
     VALUES (?, ?, ?)`
  );
  for (const translation of translations) {
    insert.run(tagId, translation.locale, translation.name.trim());
  }
}

export function listTags(db: BlogDatabase): TagRecord[] {
  const rows = db.prepare(`${TAG_SELECT} GROUP BY t.id ORDER BY t.name ASC, t.id ASC`).all() as TagRow[];
  return hydrateTags(db, rows);
}

export function getTagBySlug(db: BlogDatabase, slug: string): TagRecord | undefined {
  const row = db.prepare(`${TAG_SELECT} WHERE t.slug = ? GROUP BY t.id`).get(slug) as TagRow | undefined;
  return row ? hydrateTags(db, [row])[0] : undefined;
}

export function getTagById(db: BlogDatabase, id: number): TagRecord | undefined {
  const row = db.prepare(`${TAG_SELECT} WHERE t.id = ? GROUP BY t.id`).get(id) as TagRow | undefined;
  return row ? hydrateTags(db, [row])[0] : undefined;
}

function getTagByName(db: BlogDatabase, name: string): TagRecord | undefined {
  const row = db
    .prepare(`${TAG_SELECT} WHERE lower(trim(t.name)) = lower(trim(?)) GROUP BY t.id`)
    .get(name) as TagRow | undefined;
  return row ? hydrateTags(db, [row])[0] : undefined;
}

export function createTag(db: BlogDatabase, input: CreateTagInput): TagRecord {
  const slug = normalizeSlug(input.slug);
  if (!slug) {
    throw new Error("Invalid tag slug");
  }
  const translatedName = input.translations.find((translation) => translation.name.trim())?.name.trim();
  const name = input.name ?? translatedName ?? slug;

  return db.transaction(() => {
    if (getTagBySlug(db, slug) || getTagByName(db, name)) {
      throw new TagConflictError();
    }

    const now = new Date().toISOString();
    const result = db
      .prepare(
        `INSERT INTO tags (slug, name, created_at, updated_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(slug, name, now, now);
    const tagId = Number(result.lastInsertRowid);
    replaceTranslations(db, tagId, input.translations);
    return getTagById(db, tagId) as TagRecord;
  })();
}

export function updateTag(db: BlogDatabase, id: number, input: UpdateTagInput): TagRecord | undefined {
  return db.transaction(() => {
    const existing = getTagById(db, id);
    if (!existing) {
      return undefined;
    }

    const slug = input.slug === undefined ? existing.slug : normalizeSlug(input.slug);
    if (!slug) {
      throw new Error("Invalid tag slug");
    }
    const name = input.name ?? existing.name;
    const conflict = getTagBySlug(db, slug);
    const nameConflict = getTagByName(db, name);
    if ((conflict && conflict.id !== id) || (nameConflict && nameConflict.id !== id)) {
      throw new TagConflictError();
    }

    db.prepare("UPDATE tags SET slug = ?, name = ?, updated_at = ? WHERE id = ?").run(
      slug,
      name,
      new Date().toISOString(),
      id
    );
    if (input.translations !== undefined) {
      replaceTranslations(db, id, input.translations);
    }
    return getTagById(db, id);
  })();
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
