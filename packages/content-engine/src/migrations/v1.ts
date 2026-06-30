import { ARTICLE_DOCUMENT_SCHEMA_VERSION, ArticleDocumentValidationError } from "../documentTypes.js";
import type { ArticleDocument } from "../documentTypes.js";
import { normalizeArticleDocument } from "../normalizeDocument.js";

export function migrateArticleDocument(schemaVersion: number, input: unknown): ArticleDocument {
  if (
    !Number.isInteger(schemaVersion) ||
    schemaVersion < 1 ||
    schemaVersion > ARTICLE_DOCUMENT_SCHEMA_VERSION
  ) {
    throw new ArticleDocumentValidationError("unsupported-schema-version", ["schemaVersion"]);
  }

  return normalizeArticleDocument(input);
}
