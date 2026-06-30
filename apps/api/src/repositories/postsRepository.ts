import crypto from "node:crypto";
import {
  ARTICLE_DOCUMENT_SCHEMA_VERSION,
  extractMarkdownText,
  previewMarkdownConversion
} from "@tworiver/content-engine";
import {
  type BulkPostActionInput,
  type PostLifecycleInput,
  UpsertPostInputSchema,
  type Category,
  type PostStatus,
  type PostTranslation,
  type ParsedUpsertPostInput,
  type Tag,
  type Locale
} from "@tworiver/shared";
import type { BlogDatabase } from "../db/connection.js";
import { prepareArticleContent } from "../services/articleContentService.js";
import { normalizeSlug } from "../services/slugService.js";
import { getCategoryBySlug } from "./categoriesRepository.js";
import { getTagBySlug } from "./tagsRepository.js";

export interface PostRecord {
  id: number;
  uid: string;
  slug: string;
  status: PostStatus;
  publishedAt: string | null;
  isPinned: boolean;
  isFeatured: boolean;
  coverUrl: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  category: Category | null;
  tags: Tag[];
  translations: PostTranslation[];
}

export interface PostPage {
  posts: PostRecord[];
  total: number;
  page: number;
  limit: number;
}

interface PostRow {
  id: number;
  uid: string;
  slug: string;
  status: PostStatus;
  category_id: number | null;
  published_at: string | null;
  is_pinned: number;
  is_featured: number;
  cover_url: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface TranslationRow {
  locale: "zh" | "en";
  title: string;
  summary: string;
  content_markdown: string;
  content_format: "markdown" | "tiptap";
  content_json: string | null;
  content_schema_version: number | null;
  content_text: string;
  migration_source_markdown: string | null;
  migration_source_created_at: string | null;
  seo_title: string | null;
  seo_description: string | null;
}

export interface PostTranslationStorageRow extends TranslationRow {
  post_id: number;
  created_at: string;
  updated_at: string;
}

interface TagRow {
  id: number;
  slug: string;
  name: string;
}

interface CategoryRow {
  id: number;
  slug: string;
  name: string;
}

interface TagTranslationRow {
  tag_id: number;
  locale: "zh" | "en";
  name: string;
}

interface CategoryTranslationRow {
  category_id: number;
  locale: "zh" | "en";
  name: string;
  description: string;
}

export class InvalidPostInputError extends Error {
  constructor() {
    super("Invalid post input");
    this.name = "InvalidPostInputError";
  }
}

export class PostSlugConflictError extends Error {
  constructor() {
    super("Post slug already exists");
    this.name = "PostSlugConflictError";
  }
}

export class PostBulkTargetNotFoundError extends Error {
  constructor() {
    super("One or more posts were not found");
    this.name = "PostBulkTargetNotFoundError";
  }
}

export class PostUpdateConflictError extends Error {
  constructor() {
    super("Post was updated elsewhere");
    this.name = "PostUpdateConflictError";
  }
}

export type PostTranslationConversionFailureCode =
  | "translation-not-found"
  | "already-tiptap"
  | "conversion-blocked"
  | "format-conversion-required"
  | "restore-unavailable";

export class PostTranslationConversionError extends Error {
  readonly code: PostTranslationConversionFailureCode;
  readonly statusCode: 404 | 409;

  constructor(code: PostTranslationConversionFailureCode, message: string, statusCode: 404 | 409 = 409) {
    super(message);
    this.name = "PostTranslationConversionError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class TaxonomyNotFoundError extends Error {
  constructor(kind: "Category" | "Tag", slug: string) {
    super(`${kind} "${slug}" does not exist`);
    this.name = "TaxonomyNotFoundError";
  }
}

const POST_COLUMNS = `
  id, uid, slug, status, category_id, published_at,
  is_pinned, is_featured, cover_url, deleted_at, created_at, updated_at
`;

function mapTranslation(row: TranslationRow): PostTranslation {
  const content =
    row.content_format === "tiptap"
      ? {
          format: "tiptap" as const,
          schemaVersion: row.content_schema_version ?? 1,
          doc: JSON.parse(row.content_json ?? "{}")
        }
      : {
          format: "markdown" as const,
          markdown: row.content_markdown
        };

  const canRestoreMarkdown =
    row.content_format === "tiptap" &&
    row.migration_source_markdown !== null &&
    row.migration_source_created_at !== null;

  return {
    locale: row.locale,
    title: row.title,
    summary: row.summary,
    content,
    contentMarkdown: row.content_markdown,
    canRestoreMarkdown,
    restoreMarkdownSnapshotAt: canRestoreMarkdown ? row.migration_source_created_at : null,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description
  };
}

function mapTag(row: TagRow, translations: NonNullable<Tag["translations"]> = []): Tag {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    translations
  };
}

function mapCategory(row: CategoryRow, translations: NonNullable<Category["translations"]> = []): Category {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    translations
  };
}

function loadTagTranslations(db: BlogDatabase, tagIds: number[]): Map<number, NonNullable<Tag["translations"]>> {
  const uniqueIds = Array.from(new Set(tagIds));
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const rows = db
    .prepare(
      `SELECT tag_id, locale, name
       FROM tag_translations
       WHERE tag_id IN (${placeholders(uniqueIds)})
       ORDER BY locale ASC`
    )
    .all(...uniqueIds) as TagTranslationRow[];
  const translations = new Map<number, NonNullable<Tag["translations"]>>();
  for (const row of rows) {
    if (!row.name.trim()) {
      continue;
    }
    const existing = translations.get(row.tag_id) ?? [];
    existing.push({ locale: row.locale, name: row.name });
    translations.set(row.tag_id, existing);
  }
  return translations;
}

function loadCategoryTranslations(db: BlogDatabase, categoryIds: number[]): Map<number, NonNullable<Category["translations"]>> {
  const uniqueIds = Array.from(new Set(categoryIds));
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const rows = db
    .prepare(
      `SELECT category_id, locale, name, description
       FROM category_translations
       WHERE category_id IN (${placeholders(uniqueIds)})
       ORDER BY locale ASC`
    )
    .all(...uniqueIds) as CategoryTranslationRow[];
  const translations = new Map<number, NonNullable<Category["translations"]>>();
  for (const row of rows) {
    const existing = translations.get(row.category_id) ?? [];
    existing.push({
      locale: row.locale,
      ...(row.name.trim() ? { name: row.name } : {}),
      description: row.description
    });
    translations.set(row.category_id, existing);
  }
  return translations;
}

function hydratePost(db: BlogDatabase, row: PostRow): PostRecord {
  const translationRows = db
    .prepare(
      `SELECT
         locale,
         title,
         summary,
         content_markdown,
         content_format,
         content_json,
         content_schema_version,
         content_text,
         migration_source_markdown,
         migration_source_created_at,
         seo_title,
         seo_description
       FROM post_translations
       WHERE post_id = ?
       ORDER BY locale ASC`
    )
    .all(row.id) as TranslationRow[];

  const tagRows = db
    .prepare(
      `SELECT t.id, t.slug, t.name
       FROM tags t
       INNER JOIN post_tags pt ON pt.tag_id = t.id
       WHERE pt.post_id = ?
       ORDER BY t.slug ASC`
    )
    .all(row.id) as TagRow[];

  const categoryRow =
    row.category_id === null
      ? undefined
      : (db.prepare("SELECT id, slug, name FROM categories WHERE id = ?").get(row.category_id) as
          | CategoryRow
          | undefined);
  const tagTranslations = loadTagTranslations(db, tagRows.map((tag) => tag.id));
  const categoryTranslations =
    categoryRow === undefined ? new Map<number, NonNullable<Category["translations"]>>() : loadCategoryTranslations(db, [categoryRow.id]);

  return {
    id: row.id,
    uid: row.uid,
    slug: row.slug,
    status: row.status,
    publishedAt: row.published_at,
    isPinned: row.is_pinned === 1,
    isFeatured: row.is_featured === 1,
    coverUrl: row.cover_url,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    category: categoryRow ? mapCategory(categoryRow, categoryTranslations.get(categoryRow.id) ?? []) : null,
    tags: tagRows.map((tag) => mapTag(tag, tagTranslations.get(tag.id) ?? [])),
    translations: translationRows.map(mapTranslation)
  };
}

function placeholders(values: unknown[]): string {
  return values.map(() => "?").join(", ");
}

function groupRowsByPostId<TRow extends { post_id: number }>(rows: TRow[]): Map<number, TRow[]> {
  const grouped = new Map<number, TRow[]>();
  for (const row of rows) {
    const existing = grouped.get(row.post_id) ?? [];
    existing.push(row);
    grouped.set(row.post_id, existing);
  }
  return grouped;
}

function hydratePosts(db: BlogDatabase, rows: PostRow[]): PostRecord[] {
  if (rows.length === 0) {
    return [];
  }

  const postIds = rows.map((row) => row.id);
  const postIdPlaceholders = placeholders(postIds);

  const translationRows = db
    .prepare(
      `SELECT
         post_id,
         locale,
         title,
         summary,
         content_markdown,
         content_format,
         content_json,
         content_schema_version,
         content_text,
         migration_source_markdown,
         migration_source_created_at,
         seo_title,
         seo_description
       FROM post_translations
       WHERE post_id IN (${postIdPlaceholders})
       ORDER BY locale ASC`
    )
    .all(...postIds) as Array<TranslationRow & { post_id: number }>;

  const tagRows = db
    .prepare(
      `SELECT pt.post_id, t.id, t.slug, t.name
       FROM tags t
       INNER JOIN post_tags pt ON pt.tag_id = t.id
       WHERE pt.post_id IN (${postIdPlaceholders})
       ORDER BY t.slug ASC`
    )
    .all(...postIds) as Array<TagRow & { post_id: number }>;

  const categoryIds = Array.from(
    new Set(rows.map((row) => row.category_id).filter((categoryId): categoryId is number => categoryId !== null))
  );
  const categoryRows =
    categoryIds.length === 0
      ? []
      : (db
          .prepare(`SELECT id, slug, name FROM categories WHERE id IN (${placeholders(categoryIds)})`)
          .all(...categoryIds) as CategoryRow[]);
  const tagIds = Array.from(new Set(tagRows.map((row) => row.id)));
  const categoryTranslations = loadCategoryTranslations(db, categoryIds);
  const tagTranslations = loadTagTranslations(db, tagIds);
  const categoriesById = new Map(categoryRows.map((row) => [row.id, mapCategory(row, categoryTranslations.get(row.id) ?? [])]));
  const translationsByPostId = groupRowsByPostId(translationRows);
  const tagsByPostId = groupRowsByPostId(tagRows);

  return rows.map((row) => ({
    id: row.id,
    uid: row.uid,
    slug: row.slug,
    status: row.status,
    publishedAt: row.published_at,
    isPinned: row.is_pinned === 1,
    isFeatured: row.is_featured === 1,
    coverUrl: row.cover_url,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    category: row.category_id === null ? null : (categoriesById.get(row.category_id) ?? null),
    tags: (tagsByPostId.get(row.id) ?? []).map((tag) => mapTag(tag, tagTranslations.get(tag.id) ?? [])),
    translations: (translationsByPostId.get(row.id) ?? []).map(mapTranslation)
  }));
}

function replacePostRelations(db: BlogDatabase, postId: number, input: ParsedUpsertPostInput, timestamp: string): void {
  db.prepare("DELETE FROM post_tags WHERE post_id = ?").run(postId);

  const upsertTranslation = db.prepare(`
    INSERT INTO post_translations (
      post_id,
      locale,
      title,
      summary,
      content_markdown,
      content_format,
      content_json,
      content_schema_version,
      content_text,
      seo_title,
      seo_description,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(post_id, locale) DO UPDATE SET
      title = excluded.title,
      summary = excluded.summary,
      content_markdown = excluded.content_markdown,
      content_format = excluded.content_format,
      content_json = excluded.content_json,
      content_schema_version = excluded.content_schema_version,
      content_text = excluded.content_text,
      seo_title = excluded.seo_title,
      seo_description = excluded.seo_description,
      updated_at = excluded.updated_at
  `);

  for (const translation of input.translations) {
    const prepared = prepareArticleContent(translation.content);
    upsertTranslation.run(
      postId,
      translation.locale,
      translation.title,
      translation.summary,
      prepared.contentMarkdown,
      prepared.contentFormat,
      prepared.contentJson,
      prepared.contentSchemaVersion,
      prepared.contentText,
      translation.seoTitle,
      translation.seoDescription,
      timestamp,
      timestamp
    );
  }

  const locales = input.translations.map((translation) => translation.locale);
  db.prepare(
    `DELETE FROM post_translations
     WHERE post_id = ? AND locale NOT IN (${placeholders(locales)})`
  ).run(postId, ...locales);

  const tags = resolveTags(db, input.tagSlugs);
  const insertPostTag = db.prepare("INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)");
  for (const tag of tags) {
    insertPostTag.run(postId, tag.id);
  }
}

function validatePostInput(input: ParsedUpsertPostInput): void {
  if (input.status === "hidden") {
    throw new InvalidPostInputError();
  }

  const locales = new Set<string>();
  for (const translation of input.translations) {
    if (locales.has(translation.locale)) {
      throw new InvalidPostInputError();
    }
    locales.add(translation.locale);
  }

  for (const tagSlug of input.tagSlugs) {
    if (!normalizeSlug(tagSlug)) {
      throw new InvalidPostInputError();
    }
  }

  if (input.categorySlug !== null && !normalizeSlug(input.categorySlug)) {
    throw new InvalidPostInputError();
  }
}

function validatePostTranslationFormatChanges(
  db: BlogDatabase,
  postId: number,
  input: ParsedUpsertPostInput
): void {
  for (const translation of input.translations) {
    const existing = getPostTranslationState(db, postId, translation.locale);
    if (existing && existing.content_format !== translation.content.format) {
      throw new PostTranslationConversionError(
        "format-conversion-required",
        "Article format changes require the dedicated conversion routes"
      );
    }
  }
}

function postSlugExists(db: BlogDatabase, slug: string, excludedPostId?: number): boolean {
  const row =
    excludedPostId === undefined
      ? (db.prepare("SELECT id FROM posts WHERE slug = ?").get(slug) as { id: number } | undefined)
      : (db
          .prepare("SELECT id FROM posts WHERE slug = ? AND id <> ?")
          .get(slug, excludedPostId) as { id: number } | undefined);

  return row !== undefined;
}

function resolveCategory(db: BlogDatabase, categorySlug: string | null): Category | null {
  if (categorySlug === null) {
    return null;
  }
  const slug = normalizeSlug(categorySlug);
  const category = slug ? getCategoryBySlug(db, slug) : undefined;
  if (!category) {
    throw new TaxonomyNotFoundError("Category", slug || categorySlug);
  }
  return category;
}

function resolveTags(db: BlogDatabase, tagSlugs: string[]): Tag[] {
  const normalizedSlugs = Array.from(
    new Set(tagSlugs.map((tagSlug) => normalizeSlug(tagSlug)).filter((slug): slug is string => Boolean(slug)))
  );
  return normalizedSlugs.map((slug) => {
    const tag = getTagBySlug(db, slug);
    if (!tag) {
      throw new TaxonomyNotFoundError("Tag", slug);
    }
    return tag;
  });
}

export function createPost(db: BlogDatabase, input: unknown): PostRecord {
  const parsed = UpsertPostInputSchema.parse(input);
  validatePostInput(parsed);

  return db.transaction(() => {
    if (postSlugExists(db, parsed.slug)) {
      throw new PostSlugConflictError();
    }

    const now = new Date().toISOString();
    const uid = `p_${crypto.randomUUID()}`;
    const category = resolveCategory(db, parsed.categorySlug);
    const result = db
      .prepare(
        `INSERT INTO posts (
           uid, slug, status, category_id, published_at,
           is_pinned, is_featured, cover_url, created_at, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        uid,
        parsed.slug,
        parsed.status,
        category?.id ?? null,
        parsed.publishedAt,
        parsed.isPinned ? 1 : 0,
        parsed.isFeatured ? 1 : 0,
        parsed.coverUrl,
        now,
        now
      );

    const postId = Number(result.lastInsertRowid);
    replacePostRelations(db, postId, parsed, now);

    const post = getAdminPostById(db, postId);
    if (!post) {
      throw new Error("Created post could not be loaded.");
    }

    return post;
  })();
}

export function updatePost(db: BlogDatabase, id: number, input: unknown): PostRecord | undefined {
  const parsed = UpsertPostInputSchema.parse(input);

  return db.transaction(() => {
    const existing = getPostRowById(db, id);
    if (!existing || existing.deleted_at !== null) {
      return undefined;
    }
    validatePostInput(parsed);
    validatePostTranslationFormatChanges(db, id, parsed);
    if (postSlugExists(db, parsed.slug, id)) {
      throw new PostSlugConflictError();
    }

    const now = new Date().toISOString();
    const category = resolveCategory(db, parsed.categorySlug);
    const updateResult = db.prepare(
      `UPDATE posts
       SET slug = ?, status = ?, category_id = ?, published_at = ?,
           is_pinned = ?, is_featured = ?, cover_url = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL${parsed.expectedUpdatedAt ? " AND updated_at = ?" : ""}`
    ).run(
        parsed.slug,
        parsed.status,
        category?.id ?? null,
        parsed.publishedAt,
        parsed.isPinned ? 1 : 0,
        parsed.isFeatured ? 1 : 0,
        parsed.coverUrl,
        now,
        id,
        ...(parsed.expectedUpdatedAt ? [parsed.expectedUpdatedAt] : [])
      );
    if (updateResult.changes === 0) {
      const current = getPostRowById(db, id);
      if (current && current.deleted_at === null) {
        throw new PostUpdateConflictError();
      }
      return undefined;
    }
    replacePostRelations(db, id, parsed, now);

    return getAdminPostById(db, id);
  })();
}

export function updatePostLifecycle(
  db: BlogDatabase,
  id: number,
  patch: PostLifecycleInput
): PostRecord | undefined {
  const existing = getPostRowById(db, id);
  if (!existing || existing.deleted_at !== null) {
    return undefined;
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE posts
     SET status = ?, is_pinned = ?, is_featured = ?, cover_url = ?, updated_at = ?
     WHERE id = ? AND deleted_at IS NULL`
  ).run(
    patch.status ?? existing.status,
    (patch.isPinned ?? existing.is_pinned === 1) ? 1 : 0,
    (patch.isFeatured ?? existing.is_featured === 1) ? 1 : 0,
    patch.coverUrl ?? existing.cover_url,
    now,
    id
  );

  return getAdminPostById(db, id);
}

export function bulkUpdatePosts(db: BlogDatabase, input: BulkPostActionInput): number {
  const ids = Array.from(new Set(input.ids));

  return db.transaction(() => {
    const idPlaceholders = placeholders(ids);
    const statePredicate = input.action === "restore" ? "deleted_at IS NOT NULL" : "deleted_at IS NULL";
    const found = db
      .prepare(`SELECT COUNT(*) AS count FROM posts WHERE id IN (${idPlaceholders}) AND ${statePredicate}`)
      .get(...ids) as { count: number };
    if (found.count !== ids.length) {
      throw new PostBulkTargetNotFoundError();
    }

    const now = new Date().toISOString();
    if (input.action === "archive") {
      db.prepare(`UPDATE posts SET status = 'archived', updated_at = ? WHERE id IN (${idPlaceholders})`).run(
        now,
        ...ids
      );
    } else if (input.action === "trash") {
      db.prepare(`UPDATE posts SET deleted_at = ?, updated_at = ? WHERE id IN (${idPlaceholders})`).run(
        now,
        now,
        ...ids
      );
    } else {
      db.prepare(`UPDATE posts SET deleted_at = NULL, updated_at = ? WHERE id IN (${idPlaceholders})`).run(
        now,
        ...ids
      );
    }

    return ids.length;
  })();
}

export function trashPost(db: BlogDatabase, id: number, now = new Date()): boolean {
  const timestamp = now.toISOString();
  return (
    db
      .prepare("UPDATE posts SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
      .run(timestamp, timestamp, id).changes > 0
  );
}

export function restorePost(db: BlogDatabase, id: number): boolean {
  const now = new Date().toISOString();
  return (
    db
      .prepare("UPDATE posts SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL")
      .run(now, id).changes > 0
  );
}

export function permanentlyDeletePost(
  db: BlogDatabase,
  id: number,
  now = new Date()
): { deleted: boolean; uid?: string } {
  const row = getPostRowById(db, id);
  if (!row) {
    return { deleted: false };
  }

  const retentionCutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  if (row.deleted_at === null || Date.parse(row.deleted_at) > retentionCutoff) {
    return { deleted: false, uid: row.uid };
  }

  const result = db.prepare("DELETE FROM posts WHERE id = ?").run(id);
  return { deleted: result.changes > 0, uid: row.uid };
}

export function getPostIdByUid(db: BlogDatabase, uid: string): number | undefined {
  const row = db.prepare("SELECT id FROM posts WHERE uid = ?").get(uid) as { id: number } | undefined;
  return row?.id;
}

export function listPublicPosts(db: BlogDatabase): PostRecord[] {
  const rows = db
    .prepare(
      `SELECT ${POST_COLUMNS}
       FROM posts
       WHERE status = 'published' AND deleted_at IS NULL
       ORDER BY is_pinned DESC, published_at DESC, id DESC`
    )
    .all() as PostRow[];

  return hydratePosts(db, rows);
}

export function listPublicPostsPage(db: BlogDatabase, page: number, limit: number): PostPage {
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const offset = (safePage - 1) * safeLimit;
  const total = (
    db.prepare("SELECT COUNT(*) AS count FROM posts WHERE status = 'published' AND deleted_at IS NULL").get() as {
      count: number;
    }
  ).count;
  const rows = db
    .prepare(
      `SELECT ${POST_COLUMNS}
       FROM posts
       WHERE status = 'published' AND deleted_at IS NULL
       ORDER BY is_pinned DESC, published_at DESC, id DESC
       LIMIT ? OFFSET ?`
    )
    .all(safeLimit, offset) as PostRow[];

  return {
    posts: hydratePosts(db, rows),
    total,
    page: safePage,
    limit: safeLimit
  };
}

export function listPublicPostsByCategorySlug(db: BlogDatabase, slug: string): PostRecord[] {
  const rows = db
    .prepare(
      `SELECT
         p.id, p.uid, p.slug, p.status, p.category_id, p.published_at,
         p.is_pinned, p.is_featured, p.cover_url, p.deleted_at, p.created_at, p.updated_at
       FROM posts p
       INNER JOIN categories c ON c.id = p.category_id
       WHERE p.status = 'published' AND p.deleted_at IS NULL AND c.slug = ?
       ORDER BY p.is_pinned DESC, p.published_at DESC, p.id DESC`
    )
    .all(slug) as PostRow[];

  return hydratePosts(db, rows);
}

export function listPublicPostsByTagSlug(db: BlogDatabase, slug: string): PostRecord[] {
  const rows = db
    .prepare(
      `SELECT
         p.id, p.uid, p.slug, p.status, p.category_id, p.published_at,
         p.is_pinned, p.is_featured, p.cover_url, p.deleted_at, p.created_at, p.updated_at
       FROM posts p
       INNER JOIN post_tags pt ON pt.post_id = p.id
       INNER JOIN tags t ON t.id = pt.tag_id
       WHERE p.status = 'published' AND p.deleted_at IS NULL AND t.slug = ?
       ORDER BY p.is_pinned DESC, p.published_at DESC, p.id DESC`
    )
    .all(slug) as PostRow[];

  return hydratePosts(db, rows);
}

export function getPublicPostBySlug(db: BlogDatabase, slug: string): PostRecord | undefined {
  const row = db
    .prepare(
      `SELECT ${POST_COLUMNS}
       FROM posts
       WHERE slug = ? AND status = 'published' AND deleted_at IS NULL`
    )
    .get(slug) as PostRow | undefined;

  return row ? hydratePost(db, row) : undefined;
}

export function listAdminPosts(db: BlogDatabase): PostRecord[] {
  const rows = db
    .prepare(
      `SELECT ${POST_COLUMNS}
       FROM posts
       WHERE deleted_at IS NULL
       ORDER BY updated_at DESC`
    )
    .all() as PostRow[];

  return hydratePosts(db, rows);
}

export function listTrashedPosts(db: BlogDatabase): PostRecord[] {
  const rows = db
    .prepare(
      `SELECT ${POST_COLUMNS}
       FROM posts
       WHERE deleted_at IS NOT NULL
       ORDER BY deleted_at DESC, id DESC`
    )
    .all() as PostRow[];

  return hydratePosts(db, rows);
}

export function getAdminPostById(db: BlogDatabase, id: number): PostRecord | undefined {
  const row = getPostRowById(db, id);
  return row ? hydratePost(db, row) : undefined;
}

function getPostRowById(db: BlogDatabase, id: number): PostRow | undefined {
  return db
    .prepare(`SELECT ${POST_COLUMNS} FROM posts WHERE id = ?`)
    .get(id) as PostRow | undefined;
}

export function getPostTranslationState(
  db: BlogDatabase,
  postId: number,
  locale: Locale
): PostTranslationStorageRow | undefined {
  return db
    .prepare(
      `SELECT
         post_id,
         locale,
         title,
         summary,
         content_markdown,
         content_format,
         content_json,
         content_schema_version,
         content_text,
         migration_source_markdown,
         migration_source_created_at,
         seo_title,
         seo_description,
         created_at,
         updated_at
       FROM post_translations
       WHERE post_id = ? AND locale = ?`
    )
    .get(postId, locale) as PostTranslationStorageRow | undefined;
}

export function convertPostTranslationToTiptap(
  db: BlogDatabase,
  postId: number,
  locale: Locale,
  expectedUpdatedAt: string
): PostRecord {
  return db.transaction(() => {
    const post = getPostRowById(db, postId);
    if (!post) {
      throw translationNotFoundError();
    }
    if (post.updated_at !== expectedUpdatedAt) {
      throw new PostUpdateConflictError();
    }

    const translation = getPostTranslationState(db, postId, locale);
    if (!translation) {
      throw translationNotFoundError();
    }
    if (translation.content_format === "tiptap") {
      throw new PostTranslationConversionError("already-tiptap", "Translation is already TipTap");
    }

    const preview = previewMarkdownConversion(translation.content_markdown);
    if (!preview.canConvert || preview.document === null) {
      throw new PostTranslationConversionError("conversion-blocked", "Markdown cannot be converted");
    }

    const prepared = prepareArticleContent({
      format: "tiptap",
      schemaVersion: ARTICLE_DOCUMENT_SCHEMA_VERSION,
      doc: preview.document
    });
    const timestamp = nextMutationTimestamp(post.updated_at);
    const postUpdate = db
      .prepare("UPDATE posts SET updated_at = ? WHERE id = ? AND updated_at = ?")
      .run(timestamp, postId, expectedUpdatedAt);
    if (postUpdate.changes === 0) {
      throw new PostUpdateConflictError();
    }

    db.prepare(
      `UPDATE post_translations
       SET content_markdown = ?,
           content_format = 'tiptap',
           content_json = ?,
           content_schema_version = ?,
           content_text = ?,
           migration_source_markdown = CASE
             WHEN migration_source_markdown IS NULL AND migration_source_created_at IS NULL THEN ?
             ELSE migration_source_markdown
           END,
           migration_source_created_at = CASE
             WHEN migration_source_markdown IS NULL AND migration_source_created_at IS NULL THEN ?
             ELSE migration_source_created_at
           END,
           updated_at = ?
       WHERE post_id = ? AND locale = ?`
    ).run(
      prepared.contentMarkdown,
      prepared.contentJson,
      prepared.contentSchemaVersion,
      prepared.contentText,
      translation.content_markdown,
      timestamp,
      timestamp,
      postId,
      locale
    );

    const updatedPost = getAdminPostById(db, postId);
    if (!updatedPost) {
      throw translationNotFoundError();
    }
    return updatedPost;
  }).immediate();
}

export function restorePostTranslationMarkdown(
  db: BlogDatabase,
  postId: number,
  locale: Locale,
  expectedUpdatedAt: string
): PostRecord {
  return db.transaction(() => {
    const post = getPostRowById(db, postId);
    if (!post) {
      throw translationNotFoundError();
    }
    if (post.updated_at !== expectedUpdatedAt) {
      throw new PostUpdateConflictError();
    }

    const translation = getPostTranslationState(db, postId, locale);
    if (!translation) {
      throw translationNotFoundError();
    }
    if (
      translation.content_format !== "tiptap" ||
      translation.migration_source_markdown === null ||
      translation.migration_source_created_at === null
    ) {
      throw new PostTranslationConversionError("restore-unavailable", "No Markdown snapshot is available");
    }

    const markdown = translation.migration_source_markdown;
    const timestamp = nextMutationTimestamp(post.updated_at);
    const postUpdate = db
      .prepare("UPDATE posts SET updated_at = ? WHERE id = ? AND updated_at = ?")
      .run(timestamp, postId, expectedUpdatedAt);
    if (postUpdate.changes === 0) {
      throw new PostUpdateConflictError();
    }

    db.prepare(
      `UPDATE post_translations
       SET content_markdown = ?,
           content_format = 'markdown',
           content_json = NULL,
           content_schema_version = NULL,
           content_text = ?,
           migration_source_markdown = NULL,
           migration_source_created_at = NULL,
           updated_at = ?
       WHERE post_id = ? AND locale = ?`
    ).run(markdown, extractMarkdownText(markdown), timestamp, postId, locale);

    const updatedPost = getAdminPostById(db, postId);
    if (!updatedPost) {
      throw translationNotFoundError();
    }
    return updatedPost;
  }).immediate();
}

function nextMutationTimestamp(previousTimestamp: string): string {
  const previousTime = Date.parse(previousTimestamp);
  const timestamp = Number.isNaN(previousTime) ? Date.now() : Math.max(Date.now(), previousTime + 1);
  return new Date(timestamp).toISOString();
}

function translationNotFoundError(): PostTranslationConversionError {
  return new PostTranslationConversionError("translation-not-found", "Post translation not found", 404);
}
