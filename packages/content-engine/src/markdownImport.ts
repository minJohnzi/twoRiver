import { MarkdownManager } from "@tiptap/markdown";
import { marked } from "marked";
import type { ArticleDocument, ArticleNode } from "./documentTypes.js";
import { ArticleDocumentValidationError } from "./documentTypes.js";
import { articleExtensions } from "./articleExtensions.js";
import { extractArticleProse, extractArticleText } from "./extractText.js";
import { normalizeArticleDocument } from "./normalizeDocument.js";
import { normalizeProjectedMarkdown, projectArticleToMarkdown } from "./markdownProjection.js";

export interface MarkdownConversionIssue {
  code: string;
  line: number;
  message: string;
}

export interface MarkdownConversionPreview {
  canConvert: boolean;
  document: ArticleDocument | null;
  projectedMarkdown: string | null;
  blockers: MarkdownConversionIssue[];
  warnings: MarkdownConversionIssue[];
}

const markdownManager = new MarkdownManager({
  extensions: articleExtensions,
  markedOptions: { gfm: true }
});

export function previewMarkdownConversion(markdown: string): MarkdownConversionPreview {
  const blockers = detectMarkdownBlockers(markdown);
  const warnings = detectMarkdownWarnings(markdown);

  if (blockers.length > 0) {
    return blockedPreview(blockers, warnings);
  }

  try {
    const parsed = markdownManager.parse(markdown);
    assignCurrentHeadingIds(parsed as ArticleNode);
    const document = normalizeArticleDocument(parsed);
    const projectedMarkdown = projectArticleToMarkdown(document);

    if (extractMarkdownText(markdown) !== extractArticleText(document)) {
      warnings.push({
        code: "semantic-difference",
        line: 1,
        message: "Projected Markdown has non-blocking text differences from the source."
      });
    }

    if (normalizeProjectedMarkdown(markdown) !== projectedMarkdown) {
      warnings.push({
        code: "normalized-markdown",
        line: 1,
        message: "Whitespace or Markdown formatting will be normalized."
      });
    }

    return {
      canConvert: true,
      document,
      projectedMarkdown,
      blockers: [],
      warnings
    };
  } catch (error) {
    const code = error instanceof ArticleDocumentValidationError ? error.code : "markdown-import-failed";
    return blockedPreview(
      [
        {
          code: code === "markdown-projection-failed" ? "malformed-table" : code,
          line: 1,
          message: error instanceof Error ? error.message : "Markdown could not be converted."
        }
      ],
      warnings
    );
  }
}

export function extractMarkdownText(markdown: string): string {
  return extractMarkdown(markdown, { includeCode: true });
}

export function extractMarkdownProse(markdown: string): string {
  return extractMarkdown(markdown, { includeCode: false });
}

function blockedPreview(blockers: MarkdownConversionIssue[], warnings: MarkdownConversionIssue[]): MarkdownConversionPreview {
  return {
    canConvert: false,
    document: null,
    projectedMarkdown: null,
    blockers,
    warnings
  };
}

function detectMarkdownBlockers(markdown: string): MarkdownConversionIssue[] {
  const blockers: MarkdownConversionIssue[] = [];
  let inFence = false;
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) {
      return;
    }

    if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line)) {
      blockers.push({ code: "task-list", line: lineNumber, message: "Task lists are not supported in article v1." });
    }
    if (/!\[[^\]]*]\(\s*data:/i.test(line)) {
      blockers.push({ code: "data-image", line: lineNumber, message: "Data URI images are not supported." });
    }
    if (/<\/?\s*(iframe|script|style)\b/i.test(line)) {
      blockers.push({ code: "unsafe-html", line: lineNumber, message: "iframe, script, and style HTML are not supported." });
    } else if (/<\/?[A-Za-z][^>\n]*>/.test(line)) {
      blockers.push({ code: "raw-html", line: lineNumber, message: "Raw HTML is not supported in article v1." });
    }
  });

  return blockers;
}

function detectMarkdownWarnings(markdown: string): MarkdownConversionIssue[] {
  const warnings: MarkdownConversionIssue[] = [];
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  lines.forEach((line, index) => {
    if (/!\[[^\]]*]\(\s*https:\/\//i.test(line)) {
      warnings.push({
        code: "external-image",
        line: index + 1,
        message: "External HTTPS images will remain externally hosted."
      });
    }
  });
  return warnings;
}

function assignCurrentHeadingIds(node: ArticleNode, state = { index: 0, uses: new Map<string, number>() }): void {
  if (node.type === "heading") {
    const text = collectNodeText(node);
    const baseId = headingBaseId(text, state.index);
    const useCount = (state.uses.get(baseId) ?? 0) + 1;
    const id = useCount === 1 ? baseId : `${baseId}-${useCount}`;
    state.uses.set(baseId, useCount);
    state.index += 1;
    node.attrs = { ...(node.attrs ?? {}), id };
  }

  for (const child of node.content ?? []) {
    assignCurrentHeadingIds(child, state);
  }
}

function headingBaseId(text: string, index: number): string {
  const normalized = text
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || `section-${index + 1}`;
}

function collectNodeText(node: ArticleNode): string {
  if (node.type === "text") {
    return node.text ?? "";
  }
  return (node.content ?? []).map(collectNodeText).join("");
}

function extractMarkdown(markdown: string, options: { includeCode: boolean }): string {
  const tokens = marked.lexer(markdown, { gfm: true });
  const parts: string[] = [];
  collectMarkdownTokenText(tokens, options, parts);
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collectMarkdownTokenText(value: unknown, options: { includeCode: boolean }, parts: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectMarkdownTokenText(item, options, parts);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  const type = typeof value.type === "string" ? value.type : "";
  if (type === "html") {
    return;
  }
  if (type === "code") {
    if (options.includeCode && typeof value.text === "string") {
      parts.push(value.text);
    }
    return;
  }

  if (Array.isArray(value.tokens)) {
    collectMarkdownTokenText(value.tokens, options, parts);
    return;
  }
  if (Array.isArray(value.items)) {
    collectMarkdownTokenText(value.items, options, parts);
    return;
  }
  if (Array.isArray(value.header)) {
    collectMarkdownTokenText(value.header, options, parts);
  }
  if (Array.isArray(value.rows)) {
    collectMarkdownTokenText(value.rows, options, parts);
  }
  if (Array.isArray(value.cells)) {
    collectMarkdownTokenText(value.cells, options, parts);
  }

  if (typeof value.text === "string") {
    parts.push(value.text);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
