import type { Locale } from "@tworiver/shared";
import { useEffect, useMemo, useState, type RefObject } from "react";
import type { ArticleHeading } from "../utils/renderMarkdownDocument";

interface ArticleTableOfContentsProps {
  headings: ArticleHeading[];
  containerRef: RefObject<HTMLElement | null>;
  locale: Locale;
}

function tocLabel(locale: Locale): string {
  return locale === "zh" ? "本文目录" : "On this page";
}

function findHeadingElement(container: HTMLElement, id: string): HTMLElement | null {
  return Array.from(container.querySelectorAll<HTMLElement>("h1,h2,h3")).find((heading) => heading.id === id) ?? null;
}

export function ArticleTableOfContents({ headings, containerRef, locale }: ArticleTableOfContentsProps) {
  const [activeId, setActiveId] = useState(() => headings[0]?.id ?? "");
  const label = tocLabel(locale);
  const supportsObserver = typeof window !== "undefined" && "IntersectionObserver" in window;
  const visibleActiveId = useMemo(() => {
    if (headings.some((heading) => heading.id === activeId)) {
      return activeId;
    }

    return headings[0]?.id ?? "";
  }, [activeId, headings]);

  useEffect(() => {
    setActiveId(headings[0]?.id ?? "");
  }, [headings]);

  useEffect(() => {
    if (!supportsObserver || headings.length === 0) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const observedHeadings = headings
      .map((heading) => findHeadingElement(container, heading.id))
      .filter((heading): heading is HTMLElement => Boolean(heading));

    if (observedHeadings.length === 0) {
      return;
    }

    const observer = new window.IntersectionObserver(
      (entries) => {
        const currentEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((first, second) => first.boundingClientRect.top - second.boundingClientRect.top)[0];

        if (currentEntry?.target instanceof HTMLElement && currentEntry.target.id) {
          setActiveId(currentEntry.target.id);
        }
      },
      {
        root: null,
        rootMargin: "-18% 0px -68% 0px",
        threshold: [0, 1]
      }
    );

    for (const heading of observedHeadings) {
      observer.observe(heading);
    }

    return () => {
      observer.disconnect();
    };
  }, [containerRef, headings, supportsObserver]);

  if (headings.length === 0 || !supportsObserver) {
    return null;
  }

  return (
    <aside className="article-toc">
      <nav className="article-toc__nav" aria-label={label}>
        <p className="article-toc__title">{label}</p>
        <ol className="article-toc__list">
          {headings.map((heading) => (
            <li className="article-toc__item" key={heading.id}>
              <a
                className={`article-toc__link article-toc__link--level-${heading.level}`}
                href={`#${encodeURIComponent(heading.id)}`}
                aria-current={visibleActiveId === heading.id ? "location" : undefined}
              >
                {heading.text}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </aside>
  );
}
