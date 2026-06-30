import {
  ARTICLE_DOCUMENT_SCHEMA_VERSION,
  renderArticleHtml,
  type ArticleDocument
} from "@tworiver/content-engine/browser";
import type { Locale, PostTranslation } from "@tworiver/shared";
import {
  renderHtmlDocument,
  renderMarkdownDocument,
  type MarkdownLabels,
  type RenderedMarkdownDocument
} from "./renderMarkdownDocument";

export type ArticleDocumentSource = Pick<PostTranslation, "locale" | "content" | "contentMarkdown">;

export interface ArticleRenderContext {
  postId?: number;
  slug?: string;
  locale?: Locale;
}

export function renderArticleDocument(
  source: ArticleDocumentSource,
  labels: MarkdownLabels,
  context: ArticleRenderContext = {}
): RenderedMarkdownDocument {
  if (source.content?.format !== "tiptap") {
    return renderMarkdownDocument(markdownFallback(source), labels);
  }

  try {
    if (source.content.schemaVersion !== ARTICLE_DOCUMENT_SCHEMA_VERSION) {
      throw Object.assign(new Error("unsupported-schema-version"), { code: "unsupported-schema-version" });
    }

    return renderHtmlDocument(renderArticleHtml(source.content.doc as ArticleDocument), labels);
  } catch (error) {
    warnArticleRenderFallback(source, context, error);
    return renderMarkdownDocument(source.contentMarkdown, labels);
  }
}

function markdownFallback(source: ArticleDocumentSource): string {
  if (source.content?.format === "markdown") {
    return source.content.markdown;
  }
  return source.contentMarkdown;
}

function warnArticleRenderFallback(
  source: ArticleDocumentSource,
  context: ArticleRenderContext,
  error: unknown
): void {
  console.warn(
    JSON.stringify({
      event: "article_document_render_fallback",
      code: safeErrorCode(error),
      postId: context.postId,
      slug: context.slug,
      locale: context.locale ?? source.locale,
      schemaVersion: source.content?.format === "tiptap" ? source.content.schemaVersion : undefined
    })
  );
}

function safeErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) {
      return code;
    }
  }

  if (error instanceof Error && error.name) {
    return error.name;
  }

  return "article-render-failed";
}
