import type { Locale } from "@tworiver/shared";
import { marked } from "marked";
import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hljs } from "../utils/highlight";
import { sanitizeMarkdownHtml } from "../utils/sanitizeMarkdown";

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

interface MarkdownPreviewProps {
  markdown: string;
  locale?: Locale;
}

function copyLabels(locale: Locale | undefined) {
  if (locale === "zh") {
    return {
      copy: "复制",
      copied: "已复制",
      failed: "复制失败"
    };
  }

  return {
    copy: "Copy",
    copied: "Copied",
    failed: "Failed"
  };
}

function previewLabels(locale: Locale | undefined) {
  if (locale === "zh") {
    return {
      openImage: "打开图片预览",
      imagePreview: "图片预览",
      closeImage: "关闭图片预览"
    };
  }

  return {
    openImage: "Open image preview",
    imagePreview: "Image preview",
    closeImage: "Close image preview"
  };
}

function codeBlockLanguage(code: Element): string {
  const languageClass = Array.from(code.classList).find((className) => className.startsWith("language-"));
  return languageClass?.replace("language-", "") || "code";
}

function enhanceMarkdownHtml(html: string, copyLabel: string, imageLabel: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;

  for (const pre of Array.from(template.content.querySelectorAll("pre"))) {
    const code = pre.querySelector("code");
    if (!code) {
      continue;
    }

    const language = codeBlockLanguage(code);
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

    const languageLabel = document.createElement("span");
    languageLabel.className = "markdown-code-language";
    languageLabel.textContent = language;

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "markdown-copy-button";
    copyButton.dataset.copyCode = "true";
    copyButton.dataset.copyLabel = copyLabel;
    copyButton.textContent = copyLabel;
    copyButton.setAttribute("aria-label", copyLabel);

    tools.append(languageLabel, copyButton);
    header.append(dots, tools);
    pre.before(wrapper);
    wrapper.append(header, pre);
  }

  for (const table of Array.from(template.content.querySelectorAll("table"))) {
    const wrapper = document.createElement("div");
    wrapper.className = "markdown-table-wrap";
    table.before(wrapper);
    wrapper.append(table);
  }

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

  return template.innerHTML;
}

function fallbackCopy(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  document.body.append(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (!fallbackCopy(text)) {
    throw new Error("Clipboard copy failed");
  }
}

export function MarkdownPreview({ markdown, locale }: MarkdownPreviewProps) {
  const labels = useMemo(() => copyLabels(locale), [locale]);
  const imageLabels = useMemo(() => previewLabels(locale), [locale]);
  const resetTimersRef = useRef<number[]>([]);
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);

  const renderedMarkdown = useMemo(() => {
    const sanitizedMarkdown = sanitizeMarkdownHtml(marked.parse(markdown, { async: false }) as string);
    return enhanceMarkdownHtml(sanitizedMarkdown, labels.copy, imageLabels.openImage);
  }, [imageLabels.openImage, labels.copy, markdown]);

  useEffect(() => {
    const resetTimers = resetTimersRef.current;
    return () => {
      for (const timer of resetTimers) {
        window.clearTimeout(timer);
      }
      resetTimers.length = 0;
    };
  }, []);

  useEffect(() => {
    if (!previewImage) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPreviewImage(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [previewImage]);

  const resetCopyButton = useCallback((button: HTMLButtonElement) => {
    const resetTimer = window.setTimeout(() => {
      button.textContent = button.dataset.copyLabel ?? labels.copy;
      button.setAttribute("aria-label", button.dataset.copyLabel ?? labels.copy);
      button.classList.remove("is-copied", "is-error");
    }, 1600);

    resetTimersRef.current.push(resetTimer);
  }, [labels.copy]);

  const handleMarkdownClick = useCallback(
    async (event: MouseEvent<HTMLElement>) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const button = target.closest<HTMLButtonElement>("[data-copy-code]");
      if (button) {
        const codeBlock = button.closest(".code-window");
        const code = codeBlock?.querySelector("pre code");
        const text = code?.textContent ?? "";
        if (!text) {
          return;
        }

        try {
          await copyText(text);
          button.textContent = labels.copied;
          button.setAttribute("aria-label", labels.copied);
          button.classList.add("is-copied");
          button.classList.remove("is-error");
        } catch {
          button.textContent = labels.failed;
          button.setAttribute("aria-label", labels.failed);
          button.classList.add("is-error");
          button.classList.remove("is-copied");
        }

        resetCopyButton(button);
        return;
      }

      const imageButton = target.closest<HTMLButtonElement>("[data-markdown-image]");
      if (!imageButton) {
        return;
      }

      const image = imageButton.querySelector("img");
      const src = image?.getAttribute("src");
      if (src) {
        setPreviewImage({ src, alt: image?.getAttribute("alt") ?? "" });
      }
    },
    [labels.copied, labels.failed, resetCopyButton]
  );

  return (
    <>
      <article className="markdown-body" onClick={(event) => void handleMarkdownClick(event)} dangerouslySetInnerHTML={{ __html: renderedMarkdown }} />
      {previewImage ? (
        <div className="markdown-image-lightbox" role="dialog" aria-modal="true" aria-label={imageLabels.imagePreview}>
          <div
            className="markdown-image-lightbox__backdrop"
            role="presentation"
            onClick={() => setPreviewImage(null)}
          />
          <figure className="markdown-image-lightbox__content">
            <button
              className="markdown-image-lightbox__close"
              type="button"
              aria-label={imageLabels.closeImage}
              onClick={() => setPreviewImage(null)}
            >
              x
            </button>
            <img src={previewImage.src} alt={previewImage.alt} />
            {previewImage.alt ? <figcaption>{previewImage.alt}</figcaption> : null}
          </figure>
        </div>
      ) : null}
    </>
  );
}
