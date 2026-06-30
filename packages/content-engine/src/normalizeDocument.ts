import type { ArticleDocument, ArticleNode } from "./documentTypes.js";
import { validateArticleDocument } from "./validateDocument.js";

export function normalizeArticleDocument(input: unknown): ArticleDocument {
  const document = validateArticleDocument(input);
  const usedHeadingIds = new Set<string>();

  walkArticleNodes(document, (node) => {
    if (node.type !== "heading") {
      return;
    }

    const currentId = typeof node.attrs?.id === "string" ? node.attrs.id : undefined;
    if (currentId !== undefined && currentId.trim().length > 0 && !usedHeadingIds.has(currentId)) {
      usedHeadingIds.add(currentId);
      return;
    }

    const nextAttrs = { ...(node.attrs ?? {}) };
    nextAttrs.id = createUniqueHeadingId(usedHeadingIds);
    node.attrs = nextAttrs;
  });

  return validateArticleDocument(document);
}

function createUniqueHeadingId(usedHeadingIds: Set<string>): string {
  let id = "";
  do {
    id = `h_${createRandomId()}`;
  } while (usedHeadingIds.has(id));
  usedHeadingIds.add(id);
  return id;
}

function createRandomId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 12);
}

function walkArticleNodes(node: ArticleNode, visit: (node: ArticleNode) => void): void {
  visit(node);
  for (const child of node.content ?? []) {
    walkArticleNodes(child, visit);
  }
}
