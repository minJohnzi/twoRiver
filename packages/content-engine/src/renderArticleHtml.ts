import type { ArticleDocument, ArticleMark, ArticleNode } from "./documentTypes.js";
import { ARTICLE_DOCUMENT_SCHEMA_VERSION } from "./documentTypes.js";

export class ArticleHtmlRenderError extends Error {
  readonly code: string;

  constructor(code: string, message = code) {
    super(message);
    this.name = "ArticleHtmlRenderError";
    this.code = code;
  }
}

export function renderArticleHtml(document: ArticleDocument): string {
  if (document.type !== "doc") {
    throw new ArticleHtmlRenderError("invalid-root");
  }

  return renderChildren(document);
}

function renderNode(node: ArticleNode): string {
  switch (node.type) {
    case "doc":
      return renderChildren(node);
    case "paragraph":
      return `<p>${renderChildren(node)}</p>`;
    case "text":
      return renderMarkedText(escapeHtml(node.text ?? ""), node.marks ?? []);
    case "heading":
      return renderHeading(node);
    case "bulletList":
      return `<ul>${renderChildren(node)}</ul>`;
    case "orderedList":
      return renderOrderedList(node);
    case "listItem":
      return `<li>${renderChildren(node)}</li>`;
    case "blockquote":
      return `<blockquote>${renderChildren(node)}</blockquote>`;
    case "codeBlock":
      return renderCodeBlock(node);
    case "horizontalRule":
      return "<hr>";
    case "hardBreak":
      return "<br>";
    case "image":
      return renderImage(node);
    case "table":
      return `<table>${renderChildren(node)}</table>`;
    case "tableRow":
      return `<tr>${renderChildren(node)}</tr>`;
    case "tableHeader":
      return renderTableCell("th", node);
    case "tableCell":
      return renderTableCell("td", node);
    default:
      throw new ArticleHtmlRenderError("unsupported-node", `Unsupported article node: ${node.type}`);
  }
}

function renderChildren(node: ArticleNode): string {
  return (node.content ?? []).map(renderNode).join("");
}

function renderMarkedText(html: string, marks: ArticleMark[]): string {
  return marks.reduce((current, mark) => renderMark(mark, current), html);
}

function renderMark(mark: ArticleMark, html: string): string {
  switch (mark.type) {
    case "bold":
      return `<strong>${html}</strong>`;
    case "italic":
      return `<em>${html}</em>`;
    case "strike":
      return `<s>${html}</s>`;
    case "code":
      return `<code>${html}</code>`;
    case "link":
      return renderLink(mark, html);
    default:
      throw new ArticleHtmlRenderError("unsupported-mark", `Unsupported article mark: ${mark.type}`);
  }
}

function renderHeading(node: ArticleNode): string {
  const level = node.attrs?.level;
  if (!Number.isInteger(level) || Number(level) < 1 || Number(level) > 6) {
    throw new ArticleHtmlRenderError("invalid-heading-level");
  }

  const id = typeof node.attrs?.id === "string" && node.attrs.id.trim() ? ` id="${escapeAttribute(node.attrs.id)}"` : "";
  return `<h${level}${id}>${renderChildren(node)}</h${level}>`;
}

function renderOrderedList(node: ArticleNode): string {
  const start = node.attrs?.start;
  const startAttribute = Number.isInteger(start) && Number(start) > 1 ? ` start="${start}"` : "";
  return `<ol${startAttribute}>${renderChildren(node)}</ol>`;
}

function renderCodeBlock(node: ArticleNode): string {
  const language = typeof node.attrs?.language === "string" && node.attrs.language ? node.attrs.language : "";
  const className = language ? `hljs language-${language}` : "hljs";
  return `<pre><code class="${escapeAttribute(className)}">${escapeHtml(textContent(node))}</code></pre>`;
}

function renderImage(node: ArticleNode): string {
  const src = node.attrs?.src;
  if (typeof src !== "string" || src.length === 0) {
    throw new ArticleHtmlRenderError("invalid-image-src");
  }

  const attributes = [`src="${escapeAttribute(src)}"`];
  const alt = node.attrs?.alt;
  const title = node.attrs?.title;
  attributes.push(`alt="${typeof alt === "string" ? escapeAttribute(alt) : ""}"`);
  if (typeof title === "string" && title.length > 0) {
    attributes.push(`title="${escapeAttribute(title)}"`);
  }
  return `<img ${attributes.join(" ")}>`;
}

function renderTableCell(tagName: "td" | "th", node: ArticleNode): string {
  const attributes: string[] = [];
  const colspan = node.attrs?.colspan;
  const rowspan = node.attrs?.rowspan;

  if (Number.isInteger(colspan) && Number(colspan) > 1) {
    attributes.push(`colspan="${colspan}"`);
  }
  if (Number.isInteger(rowspan) && Number(rowspan) > 1) {
    attributes.push(`rowspan="${rowspan}"`);
  }

  const attributeText = attributes.length > 0 ? ` ${attributes.join(" ")}` : "";
  return `<${tagName}${attributeText}>${renderChildren(node)}</${tagName}>`;
}

function renderLink(mark: ArticleMark, html: string): string {
  const href = mark.attrs?.href;
  if (typeof href !== "string" || href.length === 0) {
    throw new ArticleHtmlRenderError("invalid-link-href");
  }

  const attributes = [`href="${escapeAttribute(href)}"`];
  for (const name of ["target", "rel", "class"] as const) {
    const value = mark.attrs?.[name];
    if (typeof value === "string" && value.length > 0) {
      attributes.push(`${name}="${escapeAttribute(value)}"`);
    }
  }

  return `<a ${attributes.join(" ")}>${html}</a>`;
}

function textContent(node: ArticleNode): string {
  if (node.type === "text") {
    return node.text ?? "";
  }
  if (node.type === "hardBreak") {
    return "\n";
  }
  return (node.content ?? []).map(textContent).join("");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>]/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      default:
        return character;
    }
  });
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

export { ARTICLE_DOCUMENT_SCHEMA_VERSION };
