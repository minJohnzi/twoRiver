import type { ArticleDocument, ArticleNode } from "./documentTypes.js";

interface ExtractOptions {
  includeCode: boolean;
}

const BLOCK_TEXT_NODES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "listItem",
  "codeBlock",
  "tableCell",
  "tableHeader"
]);

const CONTAINER_NODES = new Set(["doc", "bulletList", "orderedList", "table", "tableRow"]);

export function extractArticleText(doc: ArticleDocument): string {
  return extract(doc, { includeCode: true });
}

export function extractArticleProse(doc: ArticleDocument): string {
  return extract(doc, { includeCode: false });
}

function extract(doc: ArticleDocument, options: ExtractOptions): string {
  const blocks: string[] = [];
  collectBlocks(doc, options, blocks);
  return blocks
    .map((block) => block.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collectBlocks(node: ArticleNode, options: ExtractOptions, blocks: string[]): void {
  if (node.type === "image") {
    const alt = node.attrs?.alt;
    if (typeof alt === "string" && alt.trim().length > 0) {
      blocks.push(alt);
    }
    return;
  }

  if (node.type === "codeBlock" && !options.includeCode) {
    return;
  }

  if (BLOCK_TEXT_NODES.has(node.type)) {
    const text = collectInlineText(node, options);
    if (text.trim().length > 0) {
      blocks.push(text);
    }
    return;
  }

  if (CONTAINER_NODES.has(node.type)) {
    for (const child of node.content ?? []) {
      collectBlocks(child, options, blocks);
    }
  }
}

function collectInlineText(node: ArticleNode, options: ExtractOptions): string {
  if (node.type === "text") {
    return node.text ?? "";
  }

  if (node.type === "hardBreak") {
    return "\n";
  }

  if (node.type === "image") {
    const alt = node.attrs?.alt;
    return typeof alt === "string" ? alt : "";
  }

  if (node.type === "codeBlock" && !options.includeCode) {
    return "";
  }

  return (node.content ?? []).map((child) => collectInlineText(child, options)).join("");
}
