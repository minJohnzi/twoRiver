import { renderToMarkdown } from "@tiptap/static-renderer/pm/markdown";
import { ArticleDocumentValidationError } from "./documentTypes.js";
import { articleExtensions } from "./articleExtensions.js";
import { normalizeArticleDocument } from "./normalizeDocument.js";

export function projectArticleToMarkdown(input: unknown): string {
  const document = normalizeArticleDocument(input);

  try {
    const markdown = renderToMarkdown({
      extensions: articleExtensions,
      content: document
    });
    return normalizeProjectedMarkdown(markdown);
  } catch (error) {
    throw new ArticleDocumentValidationError(
      "markdown-projection-failed",
      [],
      error instanceof Error ? error.message : "markdown-projection-failed"
    );
  }
}

export function normalizeProjectedMarkdown(markdown: string): string {
  const normalized = markdown
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized.length > 0 ? `${normalized}\n` : "";
}
