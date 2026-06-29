import type { Locale, PageTranslation, UpsertPageInput } from "@tworiver/shared";
import type { BlogDatabase } from "../db/connection.js";
import { normalizeSlug } from "../services/slugService.js";

export interface PageRecord {
  id: number;
  slug: string;
  status: "draft" | "published";
  sortOrder: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  translations: PageTranslation[];
}

export interface PublicPageRecord extends PageRecord {
  requestedLocale: Locale;
  translation: PageTranslation;
}

interface PageRow {
  id: number;
  slug: string;
  status: "draft" | "published";
  sort_order: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PageTranslationRow {
  page_id: number;
  locale: Locale;
  title: string;
  content_markdown: string;
  seo_title: string | null;
  seo_description: string | null;
}

export class PageSlugConflictError extends Error {
  constructor() {
    super("Page slug already exists");
    this.name = "PageSlugConflictError";
  }
}

export class InvalidPageInputError extends Error {
  constructor() {
    super("Invalid page input");
    this.name = "InvalidPageInputError";
  }
}

const PAGE_COLUMNS = "id, slug, status, sort_order, deleted_at, created_at, updated_at";

function mapTranslation(row: PageTranslationRow): PageTranslation {
  return {
    locale: row.locale,
    title: row.title,
    contentMarkdown: row.content_markdown,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description
  };
}

function hydratePage(db: BlogDatabase, row: PageRow): PageRecord {
  const translationRows = db
    .prepare(
      `SELECT page_id, locale, title, content_markdown, seo_title, seo_description
       FROM page_translations
       WHERE page_id = ?
       ORDER BY locale ASC`
    )
    .all(row.id) as PageTranslationRow[];

  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    sortOrder: row.sort_order,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    translations: translationRows.map(mapTranslation)
  };
}

function hydratePages(db: BlogDatabase, rows: PageRow[]): PageRecord[] {
  if (rows.length === 0) {
    return [];
  }

  const ids = rows.map((row) => row.id);
  const translations = db
    .prepare(
      `SELECT page_id, locale, title, content_markdown, seo_title, seo_description
       FROM page_translations
       WHERE page_id IN (${ids.map(() => "?").join(", ")})
       ORDER BY locale ASC`
    )
    .all(...ids) as PageTranslationRow[];
  const translationsByPage = new Map<number, PageTranslation[]>();
  for (const translation of translations) {
    const existing = translationsByPage.get(translation.page_id) ?? [];
    existing.push(mapTranslation(translation));
    translationsByPage.set(translation.page_id, existing);
  }

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    status: row.status,
    sortOrder: row.sort_order,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    translations: translationsByPage.get(row.id) ?? []
  }));
}

function pageSlugExists(db: BlogDatabase, slug: string, excludedPageId?: number): boolean {
  const row =
    excludedPageId === undefined
      ? (db.prepare("SELECT id FROM pages WHERE slug = ? AND deleted_at IS NULL").get(slug) as { id: number } | undefined)
      : (db
          .prepare("SELECT id FROM pages WHERE slug = ? AND id <> ? AND deleted_at IS NULL")
          .get(slug, excludedPageId) as { id: number } | undefined);
  return row !== undefined;
}

function replaceTranslations(db: BlogDatabase, pageId: number, translations: PageTranslation[]): void {
  db.prepare("DELETE FROM page_translations WHERE page_id = ?").run(pageId);
  const insert = db.prepare(
    `INSERT INTO page_translations (page_id, locale, title, content_markdown, seo_title, seo_description)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const translation of translations) {
    insert.run(
      pageId,
      translation.locale,
      translation.title,
      translation.contentMarkdown,
      translation.seoTitle,
      translation.seoDescription
    );
  }
}

function normalizePageInput(input: UpsertPageInput): UpsertPageInput {
  const slug = normalizeSlug(input.slug);
  if (!slug) {
    throw new InvalidPageInputError();
  }
  return { ...input, slug };
}

export function listAdminPages(db: BlogDatabase): PageRecord[] {
  const rows = db
    .prepare(`SELECT ${PAGE_COLUMNS} FROM pages WHERE deleted_at IS NULL ORDER BY sort_order ASC, updated_at DESC, id DESC`)
    .all() as PageRow[];
  return hydratePages(db, rows);
}

export function getAdminPageById(db: BlogDatabase, id: number): PageRecord | undefined {
  const row = db
    .prepare(`SELECT ${PAGE_COLUMNS} FROM pages WHERE id = ? AND deleted_at IS NULL`)
    .get(id) as PageRow | undefined;
  return row ? hydratePage(db, row) : undefined;
}

export function createPage(db: BlogDatabase, input: UpsertPageInput): PageRecord {
  const parsed = normalizePageInput(input);
  return db.transaction(() => {
    if (pageSlugExists(db, parsed.slug)) {
      throw new PageSlugConflictError();
    }

    const now = new Date().toISOString();
    const result = db
      .prepare(
        `INSERT INTO pages (slug, status, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(parsed.slug, parsed.status, parsed.sortOrder, now, now);
    const pageId = Number(result.lastInsertRowid);
    replaceTranslations(db, pageId, parsed.translations);
    return getAdminPageById(db, pageId) as PageRecord;
  })();
}

export function updatePage(db: BlogDatabase, id: number, input: UpsertPageInput): PageRecord | undefined {
  const parsed = normalizePageInput(input);
  return db.transaction(() => {
    if (!getAdminPageById(db, id)) {
      return undefined;
    }
    if (pageSlugExists(db, parsed.slug, id)) {
      throw new PageSlugConflictError();
    }

    db.prepare(
      `UPDATE pages
       SET slug = ?, status = ?, sort_order = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`
    ).run(parsed.slug, parsed.status, parsed.sortOrder, new Date().toISOString(), id);
    replaceTranslations(db, id, parsed.translations);
    return getAdminPageById(db, id);
  })();
}

export function trashPage(db: BlogDatabase, id: number): boolean {
  const now = new Date().toISOString();
  return (
    db
      .prepare("UPDATE pages SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
      .run(now, now, id).changes > 0
  );
}

export function getPublicPageBySlug(
  db: BlogDatabase,
  slugInput: string,
  requestedLocale: Locale
): PublicPageRecord | undefined {
  const slug = normalizeSlug(slugInput);
  if (!slug) {
    return undefined;
  }

  const row = db
    .prepare(`SELECT ${PAGE_COLUMNS} FROM pages WHERE slug = ? AND status = 'published' AND deleted_at IS NULL`)
    .get(slug) as PageRow | undefined;
  if (!row) {
    return undefined;
  }

  const page = hydratePage(db, row);
  const translation =
    page.translations.find((candidate) => candidate.locale === requestedLocale) ??
    page.translations.find((candidate) => candidate.locale !== requestedLocale);
  return translation ? { ...page, requestedLocale, translation } : undefined;
}
