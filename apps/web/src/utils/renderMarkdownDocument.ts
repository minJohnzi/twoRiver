import type { Locale } from "@tworiver/shared";
import { marked } from "marked";
import { hljs } from "./highlight";
import { sanitizeMarkdownHtml } from "./sanitizeMarkdown";

export interface ArticleHeading {
  id: string;
  level: 1 | 2 | 3;
  text: string;
}

export interface MarkdownLabels {
  copy: string;
  copied: string;
  failed: string;
  openImage: string;
  imagePreview: string;
  closeImage: string;
}

export interface RenderedMarkdownDocument {
  html: string;
  headings: ArticleHeading[];
}

marked.use({
  renderer: {
    code(token) {
      const language = token.lang?.split(/\s+/)[0] ?? "";
      const highlighted =
        language && hljs.getLanguage(language)
          ? hljs.highlight(token.text, { language }).value
          : hljs.highlightAuto(token.text).value;
      const languageClass = language ? ` class="hljs language-${language}"` : ` class="hljs"`;
      return `<pre><code${languageClass}>${highlighted}</code></pre>`;
    }
  }
});

export function getMarkdownLabels(locale: Locale | undefined): MarkdownLabels {
  if (locale === "zh") {
    return {
      copy: "复制",
      copied: "已复制",
      failed: "复制失败",
      openImage: "打开图片预览",
      imagePreview: "图片预览",
      closeImage: "关闭图片预览"
    };
  }

  return {
    copy: "Copy",
    copied: "Copied",
    failed: "Failed",
    openImage: "Open image preview",
    imagePreview: "Image preview",
    closeImage: "Close image preview"
  };
}

function headingBaseId(text: string, index: number): string {
  const normalized = text
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || `section-${index + 1}`;
}

function addHeadingIds(template: HTMLTemplateElement): ArticleHeading[] {
  const headings: ArticleHeading[] = [];
  const uses = new Map<string, number>();

  for (const [index, heading] of Array.from(template.content.querySelectorAll("h1,h2,h3")).entries()) {
    const text = heading.textContent?.trim() ?? "";
    const baseId = headingBaseId(text, index);
    const useCount = (uses.get(baseId) ?? 0) + 1;
    const id = useCount === 1 ? baseId : `${baseId}-${useCount}`;
    const level = Number(heading.tagName.slice(1)) as 1 | 2 | 3;

    uses.set(baseId, useCount);
    heading.id = id;
    headings.push({ id, level, text });
  }

  return headings;
}

function codeBlockLanguage(code: Element): string {
  const languageClass = Array.from(code.classList).find((className) => className.startsWith("language-"));
  return languageClass?.replace("language-", "") || "code";
}

function enhanceCodeBlocks(template: HTMLTemplateElement, copyLabel: string): void {
  for (const pre of Array.from(template.content.querySelectorAll("pre"))) {
    const code = pre.querySelector("code");
    if (!code) {
      continue;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "code-window";

    const header = document.createElement("div");
    header.className = "code-window-header";

    const dots = document.createElement("div");
    dots.className = "window-dots";
    dots.setAttribute("aria-hidden", "true");
    dots.append(document.createElement("span"), document.createElement("span"), document.createElement("span"));

    const tools = document.createElement("div");
    tools.className = "code-window-tools";

    const language = document.createElement("span");
    language.className = "markdown-code-language";
    language.textContent = codeBlockLanguage(code);

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "markdown-copy-button";
    copy.dataset.copyCode = "true";
    copy.dataset.copyLabel = copyLabel;
    copy.textContent = copyLabel;
    copy.setAttribute("aria-label", copyLabel);

    tools.append(language, copy);
    header.append(dots, tools);
    pre.before(wrapper);
    wrapper.append(header, pre);
  }
}

function enhanceTables(template: HTMLTemplateElement): void {
  for (const table of Array.from(template.content.querySelectorAll("table"))) {
    const wrapper = document.createElement("div");
    wrapper.className = "markdown-table-wrap";
    table.before(wrapper);
    wrapper.append(table);
  }
}

function enhanceImages(template: HTMLTemplateElement, imageLabel: string): void {
  for (const image of Array.from(template.content.querySelectorAll("img"))) {
    image.classList.add("markdown-image");
    image.setAttribute("decoding", "async");

    if (image.closest("a")) {
      continue;
    }

    const button = document.createElement("button");
    const alt = image.getAttribute("alt")?.trim();
    button.type = "button";
    button.className = "markdown-image-button";
    button.dataset.markdownImage = "true";
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-label", alt ? `${imageLabel}: ${alt}` : imageLabel);
    image.before(button);
    button.append(image);
  }
}

export function renderMarkdownDocument(markdown: string, labels: MarkdownLabels): RenderedMarkdownDocument {
  const sanitized = sanitizeMarkdownHtml(marked.parse(markdown, { async: false }) as string);
  const template = document.createElement("template");
  template.innerHTML = sanitized;

  enhanceCodeBlocks(template, labels.copy);
  enhanceTables(template);
  enhanceImages(template, labels.openImage);
  const headings = addHeadingIds(template);

  return {
    html: template.innerHTML,
    headings
  };
}
