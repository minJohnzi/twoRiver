import type {
  Category,
  CreateCategoryInput,
  Locale,
  UpdateCategoryInput
} from "@tworiver/shared";
import type { BlogDatabase } from "../db/connection.js";
import { normalizeSlug } from "../services/slugService.js";

export interface CategoryTranslationRecord {
  locale: Locale;
  name?: string;
  description: string;
}

export interface CategoryRecord extends Category {
  sortOrder: number;
  postCount: number;
  activePostCount: number;
  trashedPostCount: number;
  totalPostCount: number;
  translations: CategoryTranslationRecord[];
}

interface CategoryRow {
  id: number;
  slug: string;
  name: string;
  sort_order: number;
  active_post_count: number;
  trashed_post_count: number;
  total_post_count: number;
}

interface CategoryTranslationRow {
  category_id: number;
  locale: Locale;
  name: string;
  description: string;
}

export class CategoryConflictError extends Error {
  constructor() {
    super("Category already exists");
    this.name = "CategoryConflictError";
  }
}

export class CategoryReferencedError extends Error {
  constructor() {
    super("Category is referenced by posts");
    this.name = "CategoryReferencedError";
  }
}

const CATEGORY_SELECT = `
  SELECT
    c.id,
    c.slug,
    c.name,
    c.sort_order,
    COUNT(DISTINCT CASE WHEN p.deleted_at IS NULL THEN p.id END) AS active_post_count,
    COUNT(DISTINCT CASE WHEN p.deleted_at IS NOT NULL THEN p.id END) AS trashed_post_count,
    COUNT(DISTINCT p.id) AS total_post_count
  FROM categories c
  LEFT JOIN posts p ON p.category_id = c.id
`;

function hydrateCategories(db: BlogDatabase, rows: CategoryRow[]): CategoryRecord[] {
  if (rows.length === 0) {
    return [];
  }

  const ids = rows.map((row) => row.id);
  const translations = db
    .prepare(
      `SELECT category_id, locale, name, description
       FROM category_translations
       WHERE category_id IN (${ids.map(() => "?").join(", ")})
       ORDER BY locale ASC`
    )
    .all(...ids) as CategoryTranslationRow[];
  const translationsByCategory = new Map<number, CategoryTranslationRecord[]>();
  for (const translation of translations) {
    const existing = translationsByCategory.get(translation.category_id) ?? [];
    existing.push({
      locale: translation.locale,
      ...(translation.name.trim() ? { name: translation.name } : {}),
      description: translation.description
    });
    translationsByCategory.set(translation.category_id, existing);
  }

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    sortOrder: row.sort_order,
    postCount: row.active_post_count,
    activePostCount: row.active_post_count,
    trashedPostCount: row.trashed_post_count,
    totalPostCount: row.total_post_count,
    translations: translationsByCategory.get(row.id) ?? []
  }));
}

function replaceTranslations(
  db: BlogDatabase,
  categoryId: number,
  translations: CategoryTranslationRecord[]
): void {
  db.prepare("DELETE FROM category_translations WHERE category_id = ?").run(categoryId);
  const insert = db.prepare(
    `INSERT INTO category_translations (category_id, locale, name, description)
     VALUES (?, ?, ?, ?)`
  );
  for (const translation of translations) {
    insert.run(categoryId, translation.locale, translation.name?.trim() ?? "", translation.description);
  }
}

export function listCategories(db: BlogDatabase): CategoryRecord[] {
  const rows = db
    .prepare(`${CATEGORY_SELECT} GROUP BY c.id ORDER BY c.sort_order ASC, c.name ASC, c.id ASC`)
    .all() as CategoryRow[];
  return hydrateCategories(db, rows);
}

export function getCategoryBySlug(db: BlogDatabase, slug: string): CategoryRecord | undefined {
  const row = db
    .prepare(`${CATEGORY_SELECT} WHERE c.slug = ? GROUP BY c.id`)
    .get(slug) as CategoryRow | undefined;
  return row ? hydrateCategories(db, [row])[0] : undefined;
}

export function getCategoryById(db: BlogDatabase, id: number): CategoryRecord | undefined {
  const row = db
    .prepare(`${CATEGORY_SELECT} WHERE c.id = ? GROUP BY c.id`)
    .get(id) as CategoryRow | undefined;
  return row ? hydrateCategories(db, [row])[0] : undefined;
}

function getCategoryByName(db: BlogDatabase, name: string): CategoryRecord | undefined {
  const row = db
    .prepare(`${CATEGORY_SELECT} WHERE lower(trim(c.name)) = lower(trim(?)) GROUP BY c.id`)
    .get(name) as CategoryRow | undefined;
  return row ? hydrateCategories(db, [row])[0] : undefined;
}

export function createCategory(db: BlogDatabase, input: CreateCategoryInput): CategoryRecord {
  const slug = normalizeSlug(input.slug);
  if (!slug) {
    throw new Error("Invalid category slug");
  }

  const translatedName = input.translations.find((translation) => translation.name.trim())?.name.trim();
  const name = input.name ?? translatedName ?? slug;

  return db.transaction(() => {
    if (getCategoryBySlug(db, slug) || getCategoryByName(db, name)) {
      throw new CategoryConflictError();
    }

    const now = new Date().toISOString();
    const result = db
      .prepare(
        `INSERT INTO categories (slug, name, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(slug, name, input.sortOrder, now, now);
    const categoryId = Number(result.lastInsertRowid);
    replaceTranslations(db, categoryId, input.translations);
    return getCategoryById(db, categoryId) as CategoryRecord;
  })();
}

export function updateCategory(
  db: BlogDatabase,
  id: number,
  input: UpdateCategoryInput
): CategoryRecord | undefined {
  return db.transaction(() => {
    const existing = getCategoryById(db, id);
    if (!existing) {
      return undefined;
    }

    const slug = input.slug === undefined ? existing.slug : normalizeSlug(input.slug);
    if (!slug) {
      throw new Error("Invalid category slug");
    }
    const name = input.name ?? existing.name;
    const conflict = getCategoryBySlug(db, slug);
    const nameConflict = getCategoryByName(db, name);
    if ((conflict && conflict.id !== id) || (nameConflict && nameConflict.id !== id)) {
      throw new CategoryConflictError();
    }

    db.prepare(
      `UPDATE categories
       SET slug = ?, name = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`
    ).run(slug, name, input.sortOrder ?? existing.sortOrder, new Date().toISOString(), id);
    if (input.translations !== undefined) {
      replaceTranslations(db, id, input.translations);
    }
    return getCategoryById(db, id);
  })();
}

export function deleteCategory(db: BlogDatabase, id: number): boolean {
  return db.transaction(() => {
    if (!getCategoryById(db, id)) {
      return false;
    }
    const references = db.prepare("SELECT COUNT(*) AS count FROM posts WHERE category_id = ?").get(id) as {
      count: number;
    };
    if (references.count > 0) {
      throw new CategoryReferencedError();
    }
    return db.prepare("DELETE FROM categories WHERE id = ?").run(id).changes > 0;
  })();
}

export function ensureCategory(db: BlogDatabase, categorySlug: string | null): CategoryRecord | null {
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
