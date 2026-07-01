import type { Locale, PostTranslation } from "@tworiver/shared";
import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderArticleDocument } from "../utils/renderArticleDocument";
import {
  getMarkdownLabels,
  renderMarkdownDocument,
  type RenderedMarkdownDocument
} from "../utils/renderMarkdownDocument";

type MarkdownPreviewSource =
  | { markdown: string; document?: never; translation?: never }
  | { markdown?: never; document: RenderedMarkdownDocument; translation?: never }
  | {
      markdown?: never;
      document?: never;
      translation: Pick<PostTranslation, "locale" | "content" | "contentMarkdown">;
    };

export type MarkdownPreviewProps = MarkdownPreviewSource & {
  locale?: Locale;
  postId?: number;
  slug?: string;
};

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

export function MarkdownPreview(props: MarkdownPreviewProps) {
  const { locale, postId, slug } = props;
  const labels = useMemo(() => getMarkdownLabels(locale), [locale]);
  const markdown = "markdown" in props ? props.markdown : undefined;
  const suppliedDocument = "document" in props ? props.document : undefined;
  const translation = "translation" in props ? props.translation : undefined;
  const renderedDocument = useMemo(
    () =>
      suppliedDocument ??
      (translation
        ? renderArticleDocument(translation, labels, {
            locale: locale ?? translation.locale,
            ...(postId !== undefined ? { postId } : {}),
            ...(slug !== undefined ? { slug } : {})
          })
        : renderMarkdownDocument(markdown ?? "", labels)),
    [labels, locale, markdown, postId, slug, suppliedDocument, translation]
  );
  const resetTimersRef = useRef<number[]>([]);
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);

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
      <div
        className="markdown-body"
        onClick={(event) => void handleMarkdownClick(event)}
        dangerouslySetInnerHTML={{ __html: renderedDocument.html }}
      />
      {previewImage ? (
        <div className="markdown-image-lightbox" role="dialog" aria-modal="true" aria-label={labels.imagePreview}>
          <div
            className="markdown-image-lightbox__backdrop"
            role="presentation"
            onClick={() => setPreviewImage(null)}
          />
          <figure className="markdown-image-lightbox__content">
            <button
              className="markdown-image-lightbox__close"
              type="button"
              aria-label={labels.closeImage}
              onClick={() => setPreviewImage(null)}
            >
              ×
            </button>
            <img src={previewImage.src} alt={previewImage.alt} />
            {previewImage.alt ? <figcaption>{previewImage.alt}</figcaption> : null}
          </figure>
        </div>
      ) : null}
    </>
  );
}
