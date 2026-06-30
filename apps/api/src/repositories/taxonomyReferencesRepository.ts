import type { TaxonomyReference } from "@tworiver/shared";
import type { BlogDatabase } from "../db/connection.js";

interface TaxonomyReferenceRow {
  id: number;
  slug: string;
  status: TaxonomyReference["status"];
  deleted_at: string | null;
  locale: "zh" | "en" | null;
  title: string | null;
}

function hydrateReferences(rows: TaxonomyReferenceRow[]): TaxonomyReference[] {
  const references = new Map<number, TaxonomyReference>();
  for (const row of rows) {
    const reference = references.get(row.id) ?? {
      id: row.id,
      slug: row.slug,
      status: row.status,
      deletedAt: row.deleted_at,
      titles: {}
    };
    if (row.locale && row.title) {
      reference.titles[row.locale] = row.title;
    }
    references.set(row.id, reference);
  }
  return Array.from(references.values());
}

export function listCategoryReferences(db: BlogDatabase, categoryId: number): TaxonomyReference[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.slug, p.status, p.deleted_at, pt.locale, pt.title
       FROM posts p
       LEFT JOIN post_translations pt ON pt.post_id = p.id
       WHERE p.category_id = ?
       ORDER BY (p.deleted_at IS NOT NULL) ASC, p.updated_at DESC, p.id DESC, pt.locale ASC`
    )
    .all(categoryId) as TaxonomyReferenceRow[];
  return hydrateReferences(rows);
}

export function detachCategoryReferences(db: BlogDatabase, categoryId: number, postIds: number[]): number {
  const placeholders = postIds.map(() => "?").join(", ");
  return db.transaction(() =>
    db
      .prepare(`UPDATE posts SET category_id = NULL WHERE category_id = ? AND id IN (${placeholders})`)
      .run(categoryId, ...postIds).changes
  )();
}

export function listTagReferences(db: BlogDatabase, tagId: number): TaxonomyReference[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.slug, p.status, p.deleted_at, pt.locale, pt.title
       FROM post_tags relation
       JOIN posts p ON p.id = relation.post_id
       LEFT JOIN post_translations pt ON pt.post_id = p.id
       WHERE relation.tag_id = ?
       ORDER BY (p.deleted_at IS NOT NULL) ASC, p.updated_at DESC, p.id DESC, pt.locale ASC`
    )
    .all(tagId) as TaxonomyReferenceRow[];
  return hydrateReferences(rows);
}

export function detachTagReferences(db: BlogDatabase, tagId: number, postIds: number[]): number {
  const placeholders = postIds.map(() => "?").join(", ");
  return db.transaction(() =>
    db
      .prepare(`DELETE FROM post_tags WHERE tag_id = ? AND post_id IN (${placeholders})`)
      .run(tagId, ...postIds).changes
  )();
}
