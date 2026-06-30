import crypto from "node:crypto";
import {
  type BulkPostActionInput,
  type PostLifecycleInput,
  UpsertPostInputSchema,
  type Category,
  type PostStatus,
  type PostTranslation,
  type ParsedUpsertPostInput,
  type Tag,
} from "@tworiver/shared";
import type { BlogDatabase } from "../db/connection.js";
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
  seo_title: string | null;
  seo_description: string | null;
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
  return {
    locale: row.locale,
    title: row.title,
    summary: row.summary,
    contentMarkdown: row.content_markdown,
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
      `SELECT locale, title, summary, content_markdown, seo_title, seo_description
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
      `SELECT post_id, locale, title, summary, content_markdown, seo_title, seo_description
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
  db.prepare("DELETE FROM post_translations WHERE post_id = ?").run(postId);
  db.prepare("DELETE FROM post_tags WHERE post_id = ?").run(postId);

  const insertTranslation = db.prepare(`
    INSERT INTO post_translations (
      post_id,
      locale,
      title,
      summary,
      content_markdown,
      seo_title,
      seo_description,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const translation of input.translations) {
    insertTranslation.run(
      postId,
      translation.locale,
      translation.title,
      translation.summary,
      translation.contentMarkdown,
      translation.seoTitle,
      translation.seoDescription,
      timestamp,
      timestamp
    );
  }

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
    if (postSlugExists(db, parsed.slug, id)) {
      throw new PostSlugConflictError();
    }

    const now = new Date().toISOString();
    const category = resolveCategory(db, parsed.categorySlug);
    db.prepare(
      `UPDATE posts
       SET slug = ?, status = ?, category_id = ?, published_at = ?,
           is_pinned = ?, is_featured = ?, cover_url = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`
    ).run(
        parsed.slug,
        parsed.status,
        category?.id ?? null,
        parsed.publishedAt,
        parsed.isPinned ? 1 : 0,
        parsed.isFeatured ? 1 : 0,
        parsed.coverUrl,
        now,
        id
      );
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
