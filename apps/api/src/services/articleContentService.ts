import {
  ArticleDocumentValidationError,
  extractArticleText,
  extractMarkdownText,
  migrateArticleDocument,
  normalizeArticleDocument,
  projectArticleToMarkdown,
  validateArticleDocument
} from "@tworiver/content-engine";
import type { ArticleContent } from "@tworiver/shared";

export interface PreparedArticleContent {
  contentFormat: "markdown" | "tiptap";
  contentMarkdown: string;
  contentJson: string | null;
  contentSchemaVersion: number | null;
  contentText: string;
}

export class ArticleContentInputError extends Error {
  readonly code: string;
  readonly path: Array<string | number>;
  readonly publicMessage: string;

  constructor(code: string, path: Array<string | number> = [], publicMessage = "Article content is invalid") {
    super(publicMessage);
    this.name = "ArticleContentInputError";
    this.code = code;
    this.path = path;
    this.publicMessage = publicMessage;
  }
}

export function prepareArticleContent(content: ArticleContent): PreparedArticleContent {
  try {
    if (content.format === "markdown") {
      return {
        contentFormat: "markdown",
        contentMarkdown: content.markdown,
        contentJson: null,
        contentSchemaVersion: null,
        contentText: extractMarkdownText(content.markdown)
      };
    }

    const migratedDocument = migrateArticleDocument(content.schemaVersion, content.doc);
    const normalizedDocument = normalizeArticleDocument(migratedDocument);
    const document = validateArticleDocument(normalizedDocument);

    return {
      contentFormat: "tiptap",
      contentMarkdown: projectArticleToMarkdown(document),
      contentJson: JSON.stringify(document),
      contentSchemaVersion: content.schemaVersion,
      contentText: extractArticleText(document)
    };
  } catch (error) {
    throw mapArticleContentError(error);
  }
}

function mapArticleContentError(error: unknown): ArticleContentInputError {
  if (error instanceof ArticleContentInputError) {
    return error;
  }

  if (error instanceof ArticleDocumentValidationError) {
    return new ArticleContentInputError(error.code, error.path);
  }

  return new ArticleContentInputError("content-processing-failed");
}
