import {
  collectArticleResourceReferences,
  migrateArticleDocument,
  validateArticleDocument
} from "@tworiver/content-engine";
import type { BlogDatabase } from "../db/connection.js";

interface CountRow {
  count: number;
}

export interface PostContentReferenceRow {
  id: number;
  post_id: number;
  locale: "zh" | "en";
  content_format: "markdown" | "tiptap";
  content_markdown: string;
  content_json: string | null;
  content_schema_version: number | null;
}

export interface TiptapResourceReferenceResult {
  urls: string[];
  invalid: boolean;
}

function countExactReferences(db: BlogDatabase, table: string, column: string, url: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`).get(url) as CountRow;
  return row.count;
}

function countContainedReferences(db: BlogDatabase, table: string, column: string, url: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} LIKE ? ESCAPE '\\'`).get(
    `%${escapeLike(url)}%`
  ) as CountRow;
  return row.count;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function safeErrorCode(error: unknown): string {
  if (error instanceof SyntaxError) {
    return "invalid-json";
  }

  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) {
      return code;
    }
  }

  return "invalid-tiptap-resource-reference";
}

function warnInvalidTiptapResourceReference(row: PostContentReferenceRow, error: unknown): void {
  console.warn(
    JSON.stringify({
      event: "tiptap_resource_reference_invalid",
      code: safeErrorCode(error),
      postTranslationId: row.id,
      postId: row.post_id,
      locale: row.locale
    })
  );
}

export function collectTiptapResourceReferences(row: PostContentReferenceRow): TiptapResourceReferenceResult {
  if (row.content_format !== "tiptap") {
    return { urls: [], invalid: false };
  }

  try {
    const parsed = JSON.parse(row.content_json ?? "null");
    const migratedDocument = migrateArticleDocument(row.content_schema_version ?? 0, parsed);
    const document = validateArticleDocument(migratedDocument);
    return { urls: collectArticleResourceReferences(document), invalid: false };
  } catch (error) {
    warnInvalidTiptapResourceReference(row, error);
    return { urls: [], invalid: true };
  }
}

function countMarkdownPostTranslationReferences(db: BlogDatabase, url: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM post_translations
       WHERE content_format = 'markdown'
         AND content_markdown LIKE ? ESCAPE '\\'`
    )
    .get(`%${escapeLike(url)}%`) as CountRow;
  return row.count;
}

function countTiptapPostTranslationReferences(db: BlogDatabase, url: string): number {
  const rows = db
    .prepare(
      `SELECT id, post_id, locale, content_format, content_markdown, content_json, content_schema_version
       FROM post_translations
       WHERE content_format = 'tiptap'`
    )
    .all() as PostContentReferenceRow[];

  let count = 0;
  for (const row of rows) {
    const references = collectTiptapResourceReferences(row);
    if (references.invalid || references.urls.includes(url)) {
      count += 1;
    }
  }

  return count;
}

export function countResourceReferences(db: BlogDatabase, url: string): number {
  return (
    countMarkdownPostTranslationReferences(db, url) +
    countTiptapPostTranslationReferences(db, url) +
    countExactReferences(db, "posts", "cover_url", url) +
    countExactReferences(db, "users", "avatar_url", url) +
    countExactReferences(db, "about_profile", "avatar_url", url) +
    countContainedReferences(db, "page_translations", "content_markdown", url) +
    countExactReferences(db, "projects", "cover_url", url) +
    countContainedReferences(db, "project_translations", "description", url) +
    countExactReferences(db, "site_settings", "logo_url", url) +
    countExactReferences(db, "site_settings", "favicon_url", url)
  );
}
