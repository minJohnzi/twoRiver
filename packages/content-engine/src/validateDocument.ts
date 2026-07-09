import { getSchema } from "@tiptap/core";
import type { ArticleDocument, ArticleMark, ArticleNode, ArticleDocumentValidationPath } from "./documentTypes.js";
import { ArticleDocumentSchema, ArticleDocumentValidationError } from "./documentTypes.js";
import {
  MAX_ARTICLE_DEPTH,
  MAX_ARTICLE_JSON_BYTES,
  MAX_ARTICLE_NODES,
  MAX_ARTICLE_URL_LENGTH
} from "./documentLimits.js";
import { articleExtensions } from "./articleExtensions.js";
import { normalizeCodeBlockLanguage } from "./codeLanguages.js";
import { isAllowedImage, isAllowedLink } from "./urlPolicy.js";

const textEncoder = new TextEncoder();

const ALLOWED_NODE_TYPES = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "hardBreak",
  "image",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell"
]);

const ALLOWED_MARK_TYPES = new Set(["bold", "italic", "strike", "code", "link"]);

const NODE_ATTRS: Record<string, readonly string[]> = {
  doc: [],
  paragraph: [],
  text: [],
  heading: ["level", "id"],
  bulletList: [],
  orderedList: ["start"],
  listItem: [],
  blockquote: [],
  codeBlock: ["language"],
  horizontalRule: [],
  hardBreak: [],
  image: ["src", "alt", "title"],
  table: [],
  tableRow: [],
  tableHeader: ["colspan", "rowspan", "colwidth"],
  tableCell: ["colspan", "rowspan", "colwidth"]
};

const MARK_ATTRS: Record<string, readonly string[]> = {
  bold: [],
  italic: [],
  strike: [],
  code: [],
  link: ["href", "target", "rel", "class"]
};

export function validateArticleDocument(input: unknown): ArticleDocument {
  if (!isRecord(input) || input.type !== "doc") {
    throw new ArticleDocumentValidationError("invalid-root", []);
  }

  const json = stringifyForValidation(input);
  if (textEncoder.encode(json).length > MAX_ARTICLE_JSON_BYTES) {
    throw new ArticleDocumentValidationError("max-json-bytes", []);
  }

  const parsed = ArticleDocumentSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ArticleDocumentValidationError("invalid-shape", issue?.path ?? []);
  }

  const clone = structuredClone(parsed.data);
  const state = { nodeCount: 0 };
  validateNode(clone, [], 0, state);

  try {
    const schema = getSchema(articleExtensions);
    schema.nodeFromJSON(clone).check();
  } catch (error) {
    throw new ArticleDocumentValidationError("invalid-prosemirror-document", [], error instanceof Error ? error.message : "invalid-prosemirror-document");
  }

  return clone;
}

function stringifyForValidation(input: unknown): string {
  try {
    const json = JSON.stringify(input);
    if (json === undefined) {
      throw new ArticleDocumentValidationError("invalid-json", []);
    }
    return json;
  } catch (error) {
    if (error instanceof ArticleDocumentValidationError) {
      throw error;
    }
    throw new ArticleDocumentValidationError("invalid-json", []);
  }
}

function validateNode(
  node: ArticleNode,
  path: ArticleDocumentValidationPath,
  depth: number,
  state: { nodeCount: number }
): void {
  state.nodeCount += 1;
  if (state.nodeCount > MAX_ARTICLE_NODES) {
    throw new ArticleDocumentValidationError("max-nodes", path);
  }
  if (depth > MAX_ARTICLE_DEPTH) {
    throw new ArticleDocumentValidationError("max-depth", path);
  }

  if (!ALLOWED_NODE_TYPES.has(node.type)) {
    throw new ArticleDocumentValidationError("unknown-node", path.concat("type"));
  }

  validateNodeAttrs(node, path);

  if (node.marks !== undefined) {
    node.marks.forEach((mark, index) => validateMark(mark, path.concat("marks", index)));
  }

  if (node.content !== undefined) {
    node.content.forEach((child, index) => validateNode(child, path.concat("content", index), depth + 1, state));
  }
}

function validateMark(mark: ArticleMark, path: ArticleDocumentValidationPath): void {
  if (!ALLOWED_MARK_TYPES.has(mark.type)) {
    throw new ArticleDocumentValidationError("unknown-mark", path.concat("type"));
  }

  rejectUnknownAttrs(mark.attrs, MARK_ATTRS[mark.type] ?? [], path);

  if (mark.type === "link") {
    const href = mark.attrs?.href;
    if (typeof href !== "string" || href.length === 0) {
      throw new ArticleDocumentValidationError("unsafe-link", path.concat("attrs", "href"));
    }
    validateUrlLength(href, path.concat("attrs", "href"));
    if (!isAllowedLink(href)) {
      throw new ArticleDocumentValidationError("unsafe-link", path.concat("attrs", "href"));
    }
    validateOptionalStringAttr(mark.attrs?.target, path.concat("attrs", "target"));
    validateOptionalStringAttr(mark.attrs?.rel, path.concat("attrs", "rel"));
    validateOptionalStringAttr(mark.attrs?.class, path.concat("attrs", "class"));
  }
}

function validateNodeAttrs(node: ArticleNode, path: ArticleDocumentValidationPath): void {
  rejectUnknownAttrs(node.attrs, NODE_ATTRS[node.type] ?? [], path);

  switch (node.type) {
    case "doc":
      if (!Array.isArray(node.content)) {
        throw new ArticleDocumentValidationError("invalid-root", path.concat("content"));
      }
      break;
    case "heading":
      validateHeadingAttrs(node.attrs, path);
      break;
    case "orderedList":
      if (node.attrs?.start !== undefined && !isPositiveInteger(node.attrs.start)) {
        throw new ArticleDocumentValidationError("invalid-list-start", path.concat("attrs", "start"));
      }
      break;
    case "codeBlock":
      validateCodeBlockAttrs(node.attrs, path);
      break;
    case "image":
      validateImageAttrs(node.attrs, path);
      break;
    case "tableCell":
    case "tableHeader":
      validateTableCellAttrs(node.attrs, path);
      break;
    default:
      break;
  }
}

function validateHeadingAttrs(attrs: Record<string, unknown> | undefined, path: ArticleDocumentValidationPath): void {
  const level = attrs?.level;
  if (!isIntegerInRange(level, 1, 6)) {
    throw new ArticleDocumentValidationError("invalid-heading-level", path.concat("attrs", "level"));
  }

  const id = attrs?.id;
  if (id !== undefined && (typeof id !== "string" || id.trim().length === 0)) {
    throw new ArticleDocumentValidationError("invalid-heading-id", path.concat("attrs", "id"));
  }
}

function validateCodeBlockAttrs(attrs: Record<string, unknown> | undefined, path: ArticleDocumentValidationPath): void {
  const normalizedLanguage = normalizeCodeBlockLanguage(attrs?.language);
  if (normalizedLanguage === null) {
    throw new ArticleDocumentValidationError("invalid-code-language", path.concat("attrs", "language"));
  }
  if (attrs !== undefined && attrs.language !== normalizedLanguage) {
    if (normalizedLanguage === undefined) {
      delete attrs.language;
    } else {
      attrs.language = normalizedLanguage;
    }
  }
}

function validateImageAttrs(attrs: Record<string, unknown> | undefined, path: ArticleDocumentValidationPath): void {
  const src = attrs?.src;
  if (typeof src !== "string" || src.length === 0) {
    throw new ArticleDocumentValidationError("unsafe-image", path.concat("attrs", "src"));
  }
  validateUrlLength(src, path.concat("attrs", "src"));
  if (!isAllowedImage(src)) {
    throw new ArticleDocumentValidationError("unsafe-image", path.concat("attrs", "src"));
  }
  if (attrs === undefined) {
    throw new ArticleDocumentValidationError("unsafe-image", path.concat("attrs", "src"));
  }
  if (attrs.alt === undefined || attrs.alt === null) {
    attrs.alt = "";
  }
  validateRequiredStringAttr(attrs.alt, path.concat("attrs", "alt"));
  validateOptionalStringAttr(attrs?.title, path.concat("attrs", "title"));
}

function validateTableCellAttrs(attrs: Record<string, unknown> | undefined, path: ArticleDocumentValidationPath): void {
  if (attrs?.colspan !== undefined && !isPositiveInteger(attrs.colspan)) {
    throw new ArticleDocumentValidationError("invalid-table-attrs", path.concat("attrs", "colspan"));
  }
  if (attrs?.rowspan !== undefined && !isPositiveInteger(attrs.rowspan)) {
    throw new ArticleDocumentValidationError("invalid-table-attrs", path.concat("attrs", "rowspan"));
  }
  if (
    attrs?.colwidth !== undefined &&
    attrs.colwidth !== null &&
    (!Array.isArray(attrs.colwidth) || attrs.colwidth.some((width) => !Number.isInteger(width) || width < 1))
  ) {
    throw new ArticleDocumentValidationError("invalid-table-attrs", path.concat("attrs", "colwidth"));
  }
}

function rejectUnknownAttrs(
  attrs: Record<string, unknown> | undefined,
  allowedAttrs: readonly string[],
  path: ArticleDocumentValidationPath
): void {
  if (attrs === undefined) {
    return;
  }
  for (const key of Object.keys(attrs)) {
    if (!allowedAttrs.includes(key)) {
      throw new ArticleDocumentValidationError("unknown-attr", path.concat("attrs", key));
    }
  }
}

function validateUrlLength(value: string, path: ArticleDocumentValidationPath): void {
  if (value.length > MAX_ARTICLE_URL_LENGTH) {
    throw new ArticleDocumentValidationError("url-too-long", path);
  }
}

function validateOptionalStringAttr(value: unknown, path: ArticleDocumentValidationPath): void {
  if (value !== undefined && value !== null && typeof value !== "string") {
    throw new ArticleDocumentValidationError("invalid-attr", path);
  }
}

function validateRequiredStringAttr(value: unknown, path: ArticleDocumentValidationPath): void {
  if (typeof value !== "string") {
    throw new ArticleDocumentValidationError("invalid-attr", path);
  }
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 1;
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= min && value <= max;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
