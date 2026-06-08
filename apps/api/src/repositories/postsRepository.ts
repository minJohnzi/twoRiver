import {
  UpsertPostInputSchema,
  type Category,
  type PostTranslation,
  type Tag,
  type UpsertPostInput
} from "@tworiver/shared";
import type { BlogDatabase } from "../db/connection.js";
import { normalizeSlug } from "../services/slugService.js";
import { ensureCategory } from "./categoriesRepository.js";
import { ensureTags } from "./tagsRepository.js";

export interface PostRecord {
  id: number;
  slug: string;
  status: "draft" | "published";
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  category: Category | null;
  tags: Tag[];
  translations: PostTranslation[];
}

interface PostRow {
  id: number;
  slug: string;
  status: "draft" | "published";
  category_id: number | null;
  published_at: string | null;
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

function mapTag(row: TagRow): Tag {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name
  };
}

function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name
  };
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

  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    category: categoryRow ? mapCategory(categoryRow) : null,
    tags: tagRows.map(mapTag),
    translations: translationRows.map(mapTranslation)
  };
}

function replacePostRelations(db: BlogDatabase, postId: number, input: UpsertPostInput, timestamp: string): void {
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

  const tags = ensureTags(db, input.tagSlugs);
  const insertPostTag = db.prepare("INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)");
  for (const tag of tags) {
    insertPostTag.run(postId, tag.id);
  }
}

function validatePostInput(input: UpsertPostInput): void {
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

export function createPost(db: BlogDatabase, input: unknown): PostRecord {
  const parsed = UpsertPostInputSchema.parse(input);
  validatePostInput(parsed);

  return db.transaction(() => {
    if (postSlugExists(db, parsed.slug)) {
      throw new PostSlugConflictError();
    }

    const now = new Date().toISOString();
    const category = ensureCategory(db, parsed.categorySlug);
    const result = db
      .prepare(
        `INSERT INTO posts (slug, status, category_id, published_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(parsed.slug, parsed.status, category?.id ?? null, parsed.publishedAt, now, now);

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
    if (!existing) {
      return undefined;
    }
    validatePostInput(parsed);
    if (postSlugExists(db, parsed.slug, id)) {
      throw new PostSlugConflictError();
    }

    const now = new Date().toISOString();
    const category = ensureCategory(db, parsed.categorySlug);
    db.prepare("UPDATE posts SET slug = ?, status = ?, category_id = ?, published_at = ?, updated_at = ? WHERE id = ?").run(
      parsed.slug,
      parsed.status,
      category?.id ?? null,
      parsed.publishedAt,
      now,
      id
    );
    replacePostRelations(db, id, parsed, now);

    return getAdminPostById(db, id);
  })();
}

export function deletePost(db: BlogDatabase, id: number): boolean {
  const result = db.prepare("DELETE FROM posts WHERE id = ?").run(id);
  return result.changes > 0;
}

export function listPublicPosts(db: BlogDatabase): PostRecord[] {
  const rows = db
    .prepare(
      `SELECT id, slug, status, category_id, published_at, created_at, updated_at
       FROM posts
       WHERE status = 'published'
       ORDER BY published_at DESC, created_at DESC`
    )
    .all() as PostRow[];

  return rows.map((row) => hydratePost(db, row));
}

export function listPublicPostsByCategorySlug(db: BlogDatabase, slug: string): PostRecord[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.slug, p.status, p.category_id, p.published_at, p.created_at, p.updated_at
       FROM posts p
       INNER JOIN categories c ON c.id = p.category_id
       WHERE p.status = 'published' AND c.slug = ?
       ORDER BY p.published_at DESC, p.created_at DESC`
    )
    .all(slug) as PostRow[];

  return rows.map((row) => hydratePost(db, row));
}

export function listPublicPostsByTagSlug(db: BlogDatabase, slug: string): PostRecord[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.slug, p.status, p.category_id, p.published_at, p.created_at, p.updated_at
       FROM posts p
       INNER JOIN post_tags pt ON pt.post_id = p.id
       INNER JOIN tags t ON t.id = pt.tag_id
       WHERE p.status = 'published' AND t.slug = ?
       ORDER BY p.published_at DESC, p.created_at DESC`
    )
    .all(slug) as PostRow[];

  return rows.map((row) => hydratePost(db, row));
}

export function getPublicPostBySlug(db: BlogDatabase, slug: string): PostRecord | undefined {
  const row = db
    .prepare(
      `SELECT id, slug, status, category_id, published_at, created_at, updated_at
       FROM posts
       WHERE slug = ? AND status = 'published'`
    )
    .get(slug) as PostRow | undefined;

  return row ? hydratePost(db, row) : undefined;
}

export function listAdminPosts(db: BlogDatabase): PostRecord[] {
  const rows = db
    .prepare(
      `SELECT id, slug, status, category_id, published_at, created_at, updated_at
       FROM posts
       ORDER BY updated_at DESC`
    )
    .all() as PostRow[];

  return rows.map((row) => hydratePost(db, row));
}

export function getAdminPostById(db: BlogDatabase, id: number): PostRecord | undefined {
  const row = getPostRowById(db, id);
  return row ? hydratePost(db, row) : undefined;
}

function getPostRowById(db: BlogDatabase, id: number): PostRow | undefined {
  return db
    .prepare("SELECT id, slug, status, category_id, published_at, created_at, updated_at FROM posts WHERE id = ?")
    .get(id) as PostRow | undefined;
}
