import type { Category } from "@tworiver/shared";
import type { BlogDatabase } from "../db/connection.js";
import { normalizeSlug } from "../services/slugService.js";

interface CategoryRow {
  id: number;
  slug: string;
  name: string;
}

function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name
  };
}

export function listCategories(db: BlogDatabase): Category[] {
  const rows = db.prepare("SELECT id, slug, name FROM categories ORDER BY name ASC").all() as CategoryRow[];
  return rows.map(mapCategory);
}

export function getCategoryBySlug(db: BlogDatabase, slug: string): Category | undefined {
  const row = db.prepare("SELECT id, slug, name FROM categories WHERE slug = ?").get(slug) as CategoryRow | undefined;
  return row ? mapCategory(row) : undefined;
}

export function getCategoryById(db: BlogDatabase, id: number): Category | undefined {
  const row = db.prepare("SELECT id, slug, name FROM categories WHERE id = ?").get(id) as CategoryRow | undefined;
  return row ? mapCategory(row) : undefined;
}

export function ensureCategory(db: BlogDatabase, categorySlug: string | null): Category | null {
  if (!categorySlug) {
    return null;
  }

  const slug = normalizeSlug(categorySlug);
  if (!slug) {
    return null;
  }

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO categories (slug, name, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET updated_at = excluded.updated_at`
  ).run(slug, categorySlug.trim(), now);

  return getCategoryBySlug(db, slug) ?? null;
}
