import type { ArticleDocument, ArticleNode } from "./documentTypes.js";

export function collectArticleResourceReferences(doc: ArticleDocument): string[] {
  const urls = new Set<string>();
  walkArticleDocument(doc, (node) => {
    if (node.type === "image" && typeof node.attrs?.src === "string") {
      urls.add(node.attrs.src);
    }
  });
  return [...urls].sort();
}

function walkArticleDocument(node: ArticleNode, visit: (node: ArticleNode) => void): void {
  visit(node);
  for (const child of node.content ?? []) {
    walkArticleDocument(child, visit);
  }
}
